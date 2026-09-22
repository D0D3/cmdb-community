"""Import en masse de CIs depuis un CSV."""
from __future__ import annotations
import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy.orm import Session

from sqlalchemy import select as sa_select
from .models import CI, HardwareDetail, SoftwareDetail

# ── Colonnes reconnues ────────────────────────────────────────────────────────

CI_COLS = {
    "name", "ci_type", "description", "status", "criticality", "team", "location",
}
HW_COLS = {
    "manufacturer", "model", "serial_number", "hw_subtype",
    "os_name", "os_version", "os_build",
    "purchase_date", "warranty_end_date", "supplier", "purchase_price",
}
SW_COLS = {
    "vendor", "product", "version", "license_type", "license_end_date",
    "eol_date", "install_count", "is_internal", "cpe_name",
}

VALID_STATUSES     = {"ordered", "in_stock", "in_service", "maintenance", "retired"}
VALID_CRITICALITY  = {"low", "medium", "high", "critical"}
VALID_CI_TYPES     = {"hardware", "software"}

TEMPLATE_HEADER = (
    "ci_type,name,description,status,criticality,team,location,"
    "manufacturer,model,serial_number,hw_subtype,os_name,os_version,"
    "purchase_date,warranty_end_date,supplier,purchase_price,"
    "vendor,product,version,license_type,license_end_date,eol_date,install_count,is_internal,"
    "key_users"
)
TEMPLATE_HW_EXAMPLE = (
    "hardware,Serveur-PROD-01,Serveur principal de production,in_service,critical,IT-Infra,Paris,"
    "Dell,PowerEdge R750,SN-123456,server,Windows Server,2022,,2027-06-01,Dell France,4500,,,,,,,,,"
    "jean.dupont@company.com;marie.martin@company.com"
)
TEMPLATE_SW_EXAMPLE = (
    "software,Office 365,Suite bureautique,in_service,medium,IT-Applications,,"
    ",,,,,,,,,,,"
    "Microsoft,Office 365,2306,subscription,2025-12-31,,500,false,"
    "chef.projet@company.com"
)


@dataclass
class ImportResult:
    total:   int = 0
    created: int = 0
    updated: int = 0
    errors:  list[dict] = field(default_factory=list)
    preview: list[dict] = field(default_factory=list)


def _parse_date(val: str) -> Optional[date]:
    val = val.strip()
    if not val:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return date.fromisoformat(val) if fmt == "%Y-%m-%d" else \
                   date(*(int(p) for p in val.split(fmt[2])))
        except Exception:
            pass
    # dernière tentative générique
    try:
        from datetime import datetime
        return datetime.strptime(val, "%Y-%m-%d").date()
    except Exception:
        return None


def _parse_bool(val: str) -> bool:
    return val.strip().lower() in ("1", "true", "yes", "oui", "vrai")


def _parse_decimal(val: str) -> Optional[Decimal]:
    val = val.strip().replace(",", ".")
    if not val:
        return None
    try:
        return Decimal(val)
    except InvalidOperation:
        return None


def _normalize_cols(row: dict) -> dict:
    """Normalise les clés du CSV (minuscules, sans espaces)."""
    return {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items()}


def parse_csv_preview(content: bytes) -> list[dict]:
    """Retourne les 10 premières lignes parsées sans créer de CIs."""
    text = content.decode("utf-8-sig").replace("\r\n", "\n")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for i, raw in enumerate(reader):
        if i >= 10:
            break
        rows.append(_normalize_cols(raw))
    return rows


def import_csv(db: Session, content: bytes, dry_run: bool = False) -> ImportResult:
    result = ImportResult()
    text   = content.decode("utf-8-sig").replace("\r\n", "\n")
    reader = csv.DictReader(io.StringIO(text))

    for row_num, raw in enumerate(reader, start=2):  # ligne 1 = header
        result.total += 1
        row = _normalize_cols(raw)

        # ── Validation obligatoire ────────────────────────────────────────────
        name    = row.get("name", "").strip()
        ci_type = row.get("ci_type", "").strip().lower()

        if not name:
            result.errors.append({"row": row_num, "message": "Colonne 'name' vide ou absente"})
            continue
        if ci_type not in VALID_CI_TYPES:
            result.errors.append({"row": row_num, "message": f"ci_type invalide : '{ci_type}' (attendu : hardware | software)"})
            continue

        status      = row.get("status", "in_service").strip() or "in_service"
        criticality = row.get("criticality", "medium").strip() or "medium"

        if status not in VALID_STATUSES:
            result.errors.append({"row": row_num, "message": f"status invalide : '{status}'"})
            continue
        if criticality not in VALID_CRITICALITY:
            result.errors.append({"row": row_num, "message": f"criticality invalide : '{criticality}'"})
            continue

        if dry_run:
            result.preview.append({"row": row_num, "name": name, "ci_type": ci_type, "status": status, "criticality": criticality})
            result.created += 1
            continue

        # ── Upsert CI (update si nom existant, sinon création) ────────────────
        try:
            existing = db.scalars(
                sa_select(CI).where(CI.name == name, CI.deleted_at.is_(None))
            ).first()

            if existing:
                existing.description = row.get("description") or existing.description
                existing.status      = status
                existing.criticality = criticality
                existing.team        = row.get("team")     or existing.team
                existing.location    = row.get("location") or existing.location
                ci = existing

                if ci_type == "hardware" and ci.hardware_details:
                    hw = ci.hardware_details
                    hw.hw_subtype        = row.get("hw_subtype")        or hw.hw_subtype
                    hw.manufacturer      = row.get("manufacturer")      or hw.manufacturer
                    hw.model             = row.get("model")             or hw.model
                    hw.serial_number     = row.get("serial_number")     or hw.serial_number
                    hw.os_name           = row.get("os_name")           or hw.os_name
                    hw.os_version        = row.get("os_version")        or hw.os_version
                    hw.os_build          = row.get("os_build")          or hw.os_build
                    hw.supplier          = row.get("supplier")          or hw.supplier
                    hw.purchase_date     = _parse_date(row.get("purchase_date", ""))     or hw.purchase_date
                    hw.warranty_end_date = _parse_date(row.get("warranty_end_date", "")) or hw.warranty_end_date
                    hw.purchase_price    = _parse_decimal(row.get("purchase_price", "")) or hw.purchase_price
                elif ci_type == "software" and ci.software_details:
                    sw = ci.software_details
                    sw.vendor           = row.get("vendor")    or sw.vendor
                    sw.version          = row.get("version")   or sw.version
                    sw.license_type     = row.get("license_type") or sw.license_type
                    sw.license_end_date = _parse_date(row.get("license_end_date", "")) or sw.license_end_date
                    sw.eol_date         = _parse_date(row.get("eol_date", ""))         or sw.eol_date
                    if row.get("install_count", "").isdigit():
                        sw.install_count = int(row["install_count"])

                result.updated += 1

            else:
                ci = CI(
                    ci_type     = ci_type,
                    name        = name,
                    description = row.get("description") or None,
                    status      = status,
                    criticality = criticality,
                    team        = row.get("team")     or None,
                    location    = row.get("location") or None,
                    attributes  = {},
                )
                db.add(ci)
                db.flush()

                if ci_type == "hardware":
                    db.add(HardwareDetail(
                        ci_id             = ci.id,
                        hw_subtype        = row.get("hw_subtype")        or None,
                        os_name           = row.get("os_name")           or None,
                        os_version        = row.get("os_version")        or None,
                        os_build          = row.get("os_build")          or None,
                        manufacturer      = row.get("manufacturer")      or None,
                        model             = row.get("model")             or None,
                        serial_number     = row.get("serial_number")     or None,
                        purchase_date     = _parse_date(row.get("purchase_date",     "")),
                        warranty_end_date = _parse_date(row.get("warranty_end_date", "")),
                        supplier          = row.get("supplier")          or None,
                        purchase_price    = _parse_decimal(row.get("purchase_price", "")),
                    ))
                else:
                    product = row.get("product") or name
                    db.add(SoftwareDetail(
                        ci_id            = ci.id,
                        vendor           = row.get("vendor")       or None,
                        product          = product,
                        version          = row.get("version")      or None,
                        cpe_name         = row.get("cpe_name")     or None,
                        is_internal      = _parse_bool(row.get("is_internal", "")),
                        license_type     = row.get("license_type") or None,
                        license_end_date = _parse_date(row.get("license_end_date", "")),
                        eol_date         = _parse_date(row.get("eol_date", "")),
                        install_count    = int(row["install_count"]) if row.get("install_count", "").isdigit() else None,
                    ))

                result.created += 1

            # ── Key Users (colonne optionnelle) ───────────────────────────────
            key_users_raw = row.get("key_users", "").strip()
            if key_users_raw and not dry_run:
                _import_key_users(db, ci, key_users_raw)

        except Exception as exc:
            db.rollback()
            result.errors.append({"row": row_num, "message": str(exc)})
            db.begin()
            continue

    if not dry_run:
        db.commit()

    return result


def _import_key_users(db: Session, ci: CI, raw: str) -> None:
    """Résout les emails de la colonne key_users et lie les référents au CI."""
    from app.keyusers.models import CIKeyUser
    from app.auth.models import User
    from sqlalchemy import select as sa_sel

    emails = [e.strip().lower() for e in raw.replace(";", ",").split(",") if e.strip()]
    for email in emails:
        # Éviter les doublons
        already = db.scalar(
            sa_sel(CIKeyUser).where(
                CIKeyUser.ci_id == ci.id,
                (CIKeyUser.entra_email == email) |
                (CIKeyUser.ldap_email  == email) |
                (CIKeyUser.local_user_id.in_(
                    sa_sel(User.id).where(User.email == email).scalar_subquery()
                )),
            )
        )
        if already:
            continue

        # Local
        user = db.scalar(sa_sel(User).where(User.email == email, User.deleted_at.is_(None)))
        if user:
            db.add(CIKeyUser(ci_id=ci.id, user_type="local", role="key_user",
                             local_user_id=user.id))
            continue

        # EntraID
        from app.keyusers.router import _search_entra, _search_ldap
        for r in _search_entra(email, db):
            if r.email.lower() == email:
                db.add(CIKeyUser(ci_id=ci.id, user_type="entra", role="key_user",
                                 entra_oid=r.source_id, entra_email=r.email,
                                 entra_display_name=r.display_name,
                                 entra_job_title=r.job_title, entra_department=r.department))
                break
        else:
            # LDAP
            for r in _search_ldap(email, db):
                if r.email.lower() == email:
                    db.add(CIKeyUser(ci_id=ci.id, user_type="ldap", role="key_user",
                                     ldap_dn=r.source_id, ldap_uid=r.ldap_uid,
                                     ldap_email=r.email, ldap_display_name=r.display_name,
                                     ldap_job_title=r.job_title, ldap_department=r.department))
                    break
            else:
                # Inconnu — stocker l'email en entrée LDAP fantôme
                db.add(CIKeyUser(ci_id=ci.id, user_type="ldap", role="key_user",
                                 ldap_dn=f"unknown:{email}", ldap_email=email,
                                 ldap_display_name=email))
