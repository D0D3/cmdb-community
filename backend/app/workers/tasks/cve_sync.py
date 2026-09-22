"""Tâche quotidienne : ingestion NVD + CISA KEV et matching CPE sur les logiciels."""
import logging
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

import httpx
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.workers.celery_app import celery_app
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.cmdb.models import CI, SoftwareDetail, Cve, CICve, Alert
from app.alerts.webhook import dispatch_alert_to_webhooks

logger = logging.getLogger(__name__)
settings = get_settings()

CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
NVD_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
OSV_API_URL  = "https://api.osv.dev/v1/query"
# Sans clé : 5 req/30 s → 7 s entre chaque appel pour rester safe
NVD_SLEEP = 0.5 if settings.nvd_api_key else 7.0
NVD_MAX_RESULTS = 2000

_SEVERITY_SCORE = {
    "CRITICAL": Decimal("9.5"),
    "HIGH":     Decimal("8.0"),
    "MEDIUM":   Decimal("5.0"),
    "LOW":      Decimal("2.5"),
}


def _nvd_headers() -> dict:
    if settings.nvd_api_key:
        return {"apiKey": settings.nvd_api_key}
    return {}


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:26], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _extract_cvss(metrics: dict) -> tuple[Optional[Decimal], Optional[str]]:
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key, [])
        if entries:
            data = entries[0].get("cvssData", {})
            score_raw = data.get("baseScore")
            severity = (
                data.get("baseSeverity")
                or entries[0].get("baseSeverity")
                or _score_to_severity(score_raw)
            )
            try:
                score = Decimal(str(score_raw)) if score_raw is not None else None
            except InvalidOperation:
                score = None
            return score, severity.upper() if severity else None
    return None, None


def _score_to_severity(score) -> Optional[str]:
    if score is None:
        return None
    s = float(score)
    if s >= 9.0:
        return "CRITICAL"
    if s >= 7.0:
        return "HIGH"
    if s >= 4.0:
        return "MEDIUM"
    return "LOW"


def _fetch_kev() -> set[str]:
    try:
        resp = httpx.get(CISA_KEV_URL, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        return {v["cveID"] for v in resp.json().get("vulnerabilities", [])}
    except Exception as exc:
        logger.warning("CISA KEV fetch failed: %s", exc)
        return set()


def _fetch_osv_vulns(ecosystem: str, package: str, version: Optional[str]) -> list[dict]:
    payload: dict = {"package": {"name": package, "ecosystem": ecosystem}}
    if version:
        payload["version"] = version
    try:
        resp = httpx.post(OSV_API_URL, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json().get("vulns", [])
    except Exception as exc:
        logger.warning("OSV fetch failed (%s/%s@%s): %s", ecosystem, package, version, exc)
        return []


def _upsert_cve_from_osv(db: Session, osv_vuln: dict, kev_ids: set[str]) -> Optional[tuple]:
    ghsa_id = osv_vuln.get("id", "")
    aliases = osv_vuln.get("aliases", [])

    # Préférer l'alias CVE comme clé primaire pour la déduplication avec NVD
    cve_id = next((a for a in aliases if a.startswith("CVE-")), ghsa_id)
    if not (cve_id.startswith("CVE-") or cve_id.startswith("GHSA-")):
        return None

    summary = (osv_vuln.get("summary") or osv_vuln.get("details") or "")[:500]

    severity_label = (osv_vuln.get("database_specific", {}).get("severity") or "").upper()
    if severity_label == "MODERATE":
        severity_label = "MEDIUM"

    score: Optional[Decimal] = None
    for sev in osv_vuln.get("severity", []):
        raw = sev.get("score", "")
        try:
            score = Decimal(str(float(raw)))
            break
        except (ValueError, InvalidOperation):
            pass

    if score is None and severity_label:
        score = _SEVERITY_SCORE.get(severity_label)
    if not severity_label and score is not None:
        severity_label = _score_to_severity(float(score))

    published = _parse_dt(osv_vuln.get("published"))
    modified  = _parse_dt(osv_vuln.get("modified"))
    is_kev    = cve_id in kev_ids
    source_url = f"https://osv.dev/vulnerability/{ghsa_id}"

    existing = db.get(Cve, cve_id)
    if existing:
        # NVD reste autoritaire : on ne remplace que les champs vides
        if not existing.summary and summary:
            existing.summary = summary
        if existing.cvss_score is None and score is not None:
            existing.cvss_score = score
        if not existing.cvss_severity and severity_label:
            existing.cvss_severity = severity_label
        existing.is_kev = is_kev or existing.is_kev
        db.flush()
        return existing, False

    cve = Cve(
        id=cve_id,
        summary=summary or None,
        cvss_score=score,
        cvss_severity=severity_label or None,
        is_kev=is_kev,
        published_at=published,
        modified_at=modified,
        source_url=source_url,
        raw=osv_vuln,
    )
    db.add(cve)
    db.flush()
    return cve, True


def _fetch_nvd_vulns(params: dict) -> list[dict]:
    try:
        resp = httpx.get(
            NVD_BASE_URL,
            params={**params, "resultsPerPage": NVD_MAX_RESULTS},
            headers=_nvd_headers(),
            timeout=60,
            follow_redirects=True,
        )
        resp.raise_for_status()
        return resp.json().get("vulnerabilities", [])
    except Exception as exc:
        logger.warning("NVD fetch failed (params=%s): %s", params, exc)
        return []


def _upsert_cve(db: Session, vuln: dict, kev_ids: set[str]) -> Optional[Cve]:
    cve_data = vuln.get("cve", {})
    cve_id = cve_data.get("id", "")
    if not cve_id.startswith("CVE-"):
        return None

    descriptions = cve_data.get("descriptions", [])
    summary = next((d["value"] for d in descriptions if d.get("lang") == "en"), None)
    metrics = cve_data.get("metrics", {})
    score, severity = _extract_cvss(metrics)
    published = _parse_dt(cve_data.get("published"))
    modified = _parse_dt(cve_data.get("lastModified"))
    is_kev = cve_id in kev_ids
    source_url = f"https://nvd.nist.gov/vuln/detail/{cve_id}"

    existing = db.get(Cve, cve_id)
    if existing:
        existing.summary = summary or existing.summary
        existing.cvss_score = score or existing.cvss_score
        existing.cvss_severity = severity or existing.cvss_severity
        existing.is_kev = is_kev or existing.is_kev
        existing.modified_at = modified or existing.modified_at
        existing.raw = cve_data
        db.flush()
        return existing, False

    cve = Cve(
        id=cve_id,
        summary=summary,
        cvss_score=score,
        cvss_severity=severity,
        is_kev=is_kev,
        published_at=published,
        modified_at=modified,
        source_url=source_url,
        raw=cve_data,
    )
    db.add(cve)
    db.flush()
    return cve, True


def _link_ci_cve(db: Session, ci_id, cve: Cve) -> tuple[CICve, bool]:
    link = db.get(CICve, (ci_id, cve.id))
    if link:
        return link, False
    link = CICve(ci_id=ci_id, cve_id=cve.id, status="open")
    db.add(link)
    db.flush()
    return link, True


def _maybe_alert(db: Session, ci: CI, cve: Cve):
    if cve.cvss_severity not in ("CRITICAL", "HIGH"):
        return
    severity_map = {"CRITICAL": "critical", "HIGH": "warning"}
    dedup_key = f"cve_match:{ci.id}:{cve.id}"
    existing = db.scalar(sa.select(Alert).where(Alert.dedup_key == dedup_key))
    if existing:
        return
    score_str = f" (CVSS {cve.cvss_score})" if cve.cvss_score else ""
    kev_str = " [KEV]" if cve.is_kev else ""
    alert = Alert(
        kind="cve_match",
        severity=severity_map[cve.cvss_severity],
        title=f"{cve.id}{score_str}{kev_str} — {ci.name}",
        body=cve.summary,
        ci_id=ci.id,
        cve_id=cve.id,
        dedup_key=dedup_key,
    )
    db.add(alert)
    db.flush()
    dispatch_alert_to_webhooks(db, alert)


@celery_app.task(name="app.workers.tasks.cve_sync.sync_nvd_cisa")
def sync_nvd_cisa():
    from app.core.ingest_status import set_ingest_running, set_ingest_done
    set_ingest_running()
    logger.info("sync_nvd_cisa: démarrage")
    matched_cves = 0
    new_links = 0
    new_critical_cves: list[dict] = []

    with SessionLocal() as db:
        # 1 ── CISA KEV
        logger.info("Chargement CISA KEV…")
        kev_ids = _fetch_kev()
        logger.info("CISA KEV : %d entrées", len(kev_ids))

        if kev_ids:
            existing_kev = db.scalars(
                sa.select(Cve).where(Cve.id.in_(kev_ids))
            ).all()
            for c in existing_kev:
                if not c.is_kev:
                    c.is_kev = True
            db.flush()

        # 2 ── Logiciels actifs avec CPE ou vendor+product
        sw_rows = db.execute(
            sa.select(CI, SoftwareDetail)
            .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
            .where(CI.status != "retired")
        ).all()

        for ci, sw in sw_rows:
            if sw.cpe_name:
                params = {"cpeName": sw.cpe_name}
            elif sw.vendor or sw.product:
                keyword = f"{sw.vendor or ''} {sw.product}".strip()
                params = {"keywordSearch": keyword, "keywordExactMatch": ""}
            else:
                continue

            logger.info("NVD query CI '%s'…", ci.name)
            vulns = _fetch_nvd_vulns(params)
            time.sleep(NVD_SLEEP)

            for vuln in vulns:
                result = _upsert_cve(db, vuln, kev_ids)
                if not result:
                    continue
                cve, is_new_cve = result
                matched_cves += 1
                if is_new_cve and cve.cvss_score and float(cve.cvss_score) >= 9.0:
                    new_critical_cves.append({
                        "cve_id":    cve.id,
                        "title":     (cve.summary or "")[:80],
                        "cvss":      float(cve.cvss_score),
                        "published": cve.published_at.strftime("%d/%m/%Y") if cve.published_at else "—",
                    })
                link, is_new = _link_ci_cve(db, ci.id, cve)
                if is_new:
                    new_links += 1
                    _maybe_alert(db, ci, cve)

        # 3 ── OSV — source réactive (GHSA indexés avant NVD)
        osv_rows = db.execute(
            sa.select(CI, SoftwareDetail)
            .join(SoftwareDetail, CI.id == SoftwareDetail.ci_id)
            .where(
                CI.status != "retired",
                SoftwareDetail.osv_ecosystem.isnot(None),
                SoftwareDetail.osv_package.isnot(None),
            )
        ).all()

        for ci, sw in osv_rows:
            logger.info("OSV query CI '%s' (%s/%s@%s)…", ci.name, sw.osv_ecosystem, sw.osv_package, sw.version)
            osv_vulns = _fetch_osv_vulns(sw.osv_ecosystem, sw.osv_package, sw.version)
            for osv_vuln in osv_vulns:
                result = _upsert_cve_from_osv(db, osv_vuln, kev_ids)
                if not result:
                    continue
                cve, is_new_cve = result
                matched_cves += 1
                if is_new_cve and cve.cvss_score and float(cve.cvss_score) >= 9.0:
                    new_critical_cves.append({
                        "cve_id":    cve.id,
                        "title":     (cve.summary or "")[:80],
                        "cvss":      float(cve.cvss_score),
                        "published": cve.published_at.strftime("%d/%m/%Y") if cve.published_at else "—",
                    })
                link, is_new = _link_ci_cve(db, ci.id, cve)
                if is_new:
                    new_links += 1
                    _maybe_alert(db, ci, cve)

        db.commit()

        # 4 ── Notification CVE critiques nouvelles
        if new_critical_cves:
            try:
                from app.notifications.service import trigger
                from app.core.config import get_settings as _gs
                _domain = getattr(_gs(), "domain", "")
                trigger(db, "cve_critical_new", domain=_domain, cves=new_critical_cves)
            except Exception as exc:
                logger.warning("Notification cve_critical_new échouée : %s", exc)

    set_ingest_done(matched_cves, new_links)
    logger.info(
        "sync_nvd_cisa terminé : %d CVE, %d liens, %d nouvelles critiques",
        matched_cves, new_links, len(new_critical_cves),
    )
    return {"matched_cves": matched_cves, "new_links": new_links, "new_critical": len(new_critical_cves)}
