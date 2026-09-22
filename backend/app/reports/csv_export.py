"""Exports CSV : inventaire CI, CVE, échéances, SLA, licences, incidents."""
import csv
from datetime import date
from io import StringIO
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.cmdb.models import CI, HardwareDetail, SoftwareDetail, CICve, Cve, Sla
from app.incidents.models import Incident, IncidentCI
from app.auth.models import User  # noqa: F401 — enregistre User dans le registry SQLAlchemy
from app.keyusers.models import CIKeyUser  # noqa: F401 — enregistre CIKeyUser dans le registry SQLAlchemy


def _output(fieldnames: list[str]) -> tuple[StringIO, csv.DictWriter]:
    buf = StringIO()
    w = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    w.writeheader()
    return buf, w


def export_inventory(db: Session, ci_type: str | None = None) -> bytes:
    q = (
        select(CI)
        .where(CI.deleted_at.is_(None))
        .options(selectinload(CI.hardware_details), selectinload(CI.software_details))
        .order_by(CI.name)
    )
    if ci_type:
        q = q.where(CI.ci_type == ci_type)

    fields = [
        "id", "nom", "type", "statut", "criticité", "équipe", "emplacement", "description",
        "fabricant", "modèle", "n_série", "sous_type", "os_nom", "os_version",
        "date_achat", "fin_garantie", "fournisseur",
        "éditeur", "produit", "version", "type_licence", "fin_licence", "eol", "cpe",
        "créé_le", "modifié_le",
    ]
    buf, w = _output(fields)

    for ci in db.scalars(q).all():
        hw = ci.hardware_details
        sw = ci.software_details
        w.writerow({
            "id": str(ci.id),
            "nom": ci.name,
            "type": "Matériel" if ci.ci_type == "hardware" else "Logiciel",
            "statut": ci.status,
            "criticité": ci.criticality,
            "équipe": ci.team or "",
            "emplacement": ci.location or "",
            "description": ci.description or "",
            "fabricant": hw.manufacturer if hw else "",
            "modèle": hw.model if hw else "",
            "n_série": hw.serial_number if hw else "",
            "sous_type": hw.hw_subtype if hw else "",
            "os_nom": hw.os_name if hw else "",
            "os_version": hw.os_version if hw else "",
            "date_achat": str(hw.purchase_date) if hw and hw.purchase_date else "",
            "fin_garantie": str(hw.warranty_end_date) if hw and hw.warranty_end_date else "",
            "fournisseur": hw.supplier if hw else "",
            "éditeur": sw.vendor if sw else "",
            "produit": sw.product if sw else "",
            "version": sw.version if sw else "",
            "type_licence": sw.license_type if sw else "",
            "fin_licence": str(sw.license_end_date) if sw and sw.license_end_date else "",
            "eol": str(sw.eol_date) if sw and sw.eol_date else "",
            "cpe": sw.cpe_name if sw else "",
            "créé_le": ci.created_at.strftime("%Y-%m-%d %H:%M") if ci.created_at else "",
            "modifié_le": ci.updated_at.strftime("%Y-%m-%d %H:%M") if ci.updated_at else "",
        })

    return buf.getvalue().encode("utf-8-sig")


def export_cves(db: Session) -> bytes:
    q = (
        select(CICve)
        .options(selectinload(CICve.ci), selectinload(CICve.cve))
        .join(CICve.ci)
        .where(CI.deleted_at.is_(None))
        .order_by(CICve.cve_id)
    )

    fields = ["cve_id", "ci_nom", "ci_statut", "sévérité_cvss", "score_cvss", "kev", "statut", "résumé"]
    buf, w = _output(fields)

    for link in db.scalars(q).all():
        cve: Cve = link.cve
        w.writerow({
            "cve_id": link.cve_id,
            "ci_nom": link.ci.name if link.ci else "",
            "ci_statut": link.ci.status if link.ci else "",
            "sévérité_cvss": cve.cvss_severity or "",
            "score_cvss": str(cve.cvss_score) if cve.cvss_score else "",
            "kev": "Oui" if cve.is_kev else "Non",
            "statut": link.status,
            "résumé": (cve.summary or "")[:500],
        })

    return buf.getvalue().encode("utf-8-sig")


def export_deadlines(db: Session) -> bytes:
    today = date.today()
    rows: list[dict] = []

    hw_q = (
        select(CI, HardwareDetail)
        .join(HardwareDetail, HardwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None), HardwareDetail.warranty_end_date.is_not(None))
        .order_by(HardwareDetail.warranty_end_date)
    )
    for ci, hw in db.execute(hw_q).all():
        rows.append({
            "type": "Fin garantie",
            "ci_nom": ci.name,
            "équipe": ci.team or "",
            "date": str(hw.warranty_end_date),
            "jours_restants": (hw.warranty_end_date - today).days,
            "statut_ci": ci.status,
        })

    eol_q = (
        select(CI, SoftwareDetail)
        .join(SoftwareDetail, SoftwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None), SoftwareDetail.eol_date.is_not(None))
        .order_by(SoftwareDetail.eol_date)
    )
    for ci, sw in db.execute(eol_q).all():
        rows.append({
            "type": "EOL logiciel",
            "ci_nom": ci.name,
            "équipe": ci.team or "",
            "date": str(sw.eol_date),
            "jours_restants": (sw.eol_date - today).days,
            "statut_ci": ci.status,
        })

    lic_q = (
        select(CI, SoftwareDetail)
        .join(SoftwareDetail, SoftwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None), SoftwareDetail.license_end_date.is_not(None))
        .order_by(SoftwareDetail.license_end_date)
    )
    for ci, sw in db.execute(lic_q).all():
        rows.append({
            "type": "Fin licence",
            "ci_nom": ci.name,
            "équipe": ci.team or "",
            "date": str(sw.license_end_date),
            "jours_restants": (sw.license_end_date - today).days,
            "statut_ci": ci.status,
        })

    rows.sort(key=lambda r: r["date"])

    fields = ["type", "ci_nom", "équipe", "date", "jours_restants", "statut_ci"]
    buf, w = _output(fields)
    for row in rows:
        w.writerow(row)

    return buf.getvalue().encode("utf-8-sig")


def export_sla(db: Session) -> bytes:
    today = date.today()
    slas = db.scalars(
        select(Sla).options(selectinload(Sla.cis)).order_by(Sla.contract_end_date)
    ).all()

    fields = [
        "nom", "niveau", "référence_contrat", "prestataire", "contact_support",
        "temps_réponse", "fin_contrat", "jours_restants", "nb_cis", "notes",
    ]
    buf, w = _output(fields)
    for sla in slas:
        days = (sla.contract_end_date - today).days if sla.contract_end_date else ""
        w.writerow({
            "nom": sla.name,
            "niveau": sla.level or "",
            "référence_contrat": sla.contract_ref or "",
            "prestataire": sla.provider or "",
            "contact_support": sla.support_contact or "",
            "temps_réponse": sla.response_time or "",
            "fin_contrat": str(sla.contract_end_date) if sla.contract_end_date else "",
            "jours_restants": days,
            "nb_cis": len(sla.cis),
            "notes": sla.notes or "",
        })

    return buf.getvalue().encode("utf-8-sig")


def export_licenses(db: Session) -> bytes:
    today = date.today()
    q = (
        select(CI, SoftwareDetail)
        .join(SoftwareDetail, SoftwareDetail.ci_id == CI.id)
        .where(CI.deleted_at.is_(None))
        .order_by(CI.name)
    )

    fields = [
        "ci_nom", "éditeur", "produit", "version", "type_licence",
        "sièges_max", "fin_licence", "jours_restants", "statut_ci", "équipe",
    ]
    buf, w = _output(fields)
    for ci, sw in db.execute(q).all():
        days = (sw.license_end_date - today).days if sw.license_end_date else ""
        w.writerow({
            "ci_nom": ci.name,
            "éditeur": sw.vendor or "",
            "produit": sw.product,
            "version": sw.version or "",
            "type_licence": sw.license_type or "",
            "sièges_max": sw.max_seats if sw.max_seats is not None else "",
            "fin_licence": str(sw.license_end_date) if sw.license_end_date else "",
            "jours_restants": days,
            "statut_ci": ci.status,
            "équipe": ci.team or "",
        })

    return buf.getvalue().encode("utf-8-sig")


def export_incidents(db: Session) -> bytes:
    incidents = db.scalars(
        select(Incident)
        .options(selectinload(Incident.ci_links))
        .order_by(Incident.created_at.desc())
    ).all()

    # Précharge les noms de CIs en une seule requête
    all_ci_ids = {link.ci_id for inc in incidents for link in inc.ci_links}
    ci_names_map: dict = {}
    if all_ci_ids:
        ci_rows = db.execute(select(CI.id, CI.name).where(CI.id.in_(all_ci_ids))).all()
        ci_names_map = {r.id: r.name for r in ci_rows}

    fields = [
        "titre", "sévérité", "statut", "cis_liés",
        "créé_le", "résolu_le", "durée_résolution_h",
    ]
    buf, w = _output(fields)
    for inc in incidents:
        cis_names = ", ".join(
            ci_names_map.get(link.ci_id, "?") for link in inc.ci_links
        )
        resolved_str = ""
        duration = ""
        if inc.resolved_at:
            resolved_str = inc.resolved_at.strftime("%Y-%m-%d %H:%M")
            delta = (inc.resolved_at - inc.created_at).total_seconds() / 3600
            duration = f"{delta:.1f}"
        w.writerow({
            "titre": inc.title,
            "sévérité": inc.severity,
            "statut": inc.status,
            "cis_liés": cis_names,
            "créé_le": inc.created_at.strftime("%Y-%m-%d %H:%M") if inc.created_at else "",
            "résolu_le": resolved_str,
            "durée_résolution_h": duration,
        })

    return buf.getvalue().encode("utf-8-sig")
