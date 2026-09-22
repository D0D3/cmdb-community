"""Génération PDF avec reportlab."""
from __future__ import annotations
from datetime import date, datetime, timezone
from io import BytesIO
from typing import TYPE_CHECKING
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.cmdb.models import CI, HardwareDetail, SoftwareDetail, CICve, Cve, Sla
from app.incidents.models import Incident, IncidentCI
from app.auth.models import User  # noqa: F401 — enregistre User dans le registry SQLAlchemy
from app.keyusers.models import CIKeyUser  # noqa: F401 — enregistre CIKeyUser dans le registry SQLAlchemy

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image,
    )
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

_BRAND = colors.HexColor("#2563EB") if HAS_REPORTLAB else None
_BRAND_LIGHT = colors.HexColor("#EFF6FF") if HAS_REPORTLAB else None
_SEV_COLORS = {
    "CRITICAL": colors.HexColor("#DC2626"),
    "HIGH":     colors.HexColor("#EA580C"),
    "MEDIUM":   colors.HexColor("#CA8A04"),
    "LOW":      colors.HexColor("#16A34A"),
} if HAS_REPORTLAB else {}


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M UTC")


def _get_logo_image(db: Session):
    """Retourne un flowable Image ReportLab du logo branding, ou None si absent/SVG."""
    if not HAS_REPORTLAB:
        return None
    try:
        import base64
        from app.branding.models import BrandingSetting
        row = db.scalar(select(BrandingSetting))
        if not row or not row.logo_data or not row.logo_mime:
            return None
        if "svg" in row.logo_mime:
            return None  # SVG non supporté nativement par ReportLab
        raw = base64.b64decode(row.logo_data)
        img = Image(BytesIO(raw))
        max_w, max_h = 6.0 * cm, 2.8 * cm
        ratio = img.imageWidth / img.imageHeight if img.imageHeight else 1
        h = min(img.imageHeight, max_h)
        w = h * ratio
        if w > max_w:
            w = max_w
            h = w / ratio
        img.drawWidth  = w
        img.drawHeight = h
        return img
    except Exception:
        return None


def _header_table(title: str, subtitle: str, styles, logo=None) -> list:
    title_p = Paragraph(f"<b>{title}</b>", styles["header_title"])
    sub_p   = Paragraph(subtitle, styles["header_sub"])
    date_p  = Paragraph(f"Généré le {_now_str()}", styles["header_date"])
    hr      = HRFlowable(width="100%", thickness=1, color=_BRAND)

    if logo is not None:
        text_cell = [title_p, Spacer(1, 0.2 * cm), sub_p, Spacer(1, 0.1 * cm), date_p]
        hdr_tbl = Table([[text_cell, logo]], colWidths=["*", logo.drawWidth + 0.4 * cm])
        hdr_tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (1, 0), (1, 0),   "RIGHT"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        return [hdr_tbl, Spacer(1, 0.2 * cm), hr]

    return [
        title_p,
        Spacer(1, 0.25 * cm),
        sub_p,
        Spacer(1, 0.15 * cm),
        date_p,
        Spacer(1, 0.2 * cm),
        hr,
    ]


def _make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("header_title", parent=styles["Normal"], fontSize=18, leading=22, textColor=_BRAND))
    styles.add(ParagraphStyle("header_sub", parent=styles["Normal"], fontSize=10, leading=13, textColor=colors.gray))
    styles.add(ParagraphStyle("header_date", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.gray))
    styles.add(ParagraphStyle("cell", fontSize=8, leading=10))
    styles.add(ParagraphStyle("cell_bold", fontSize=8, leading=10, fontName="Helvetica-Bold"))
    return styles


def _base_table_style() -> list:
    return [
        ("BACKGROUND", (0, 0), (-1, 0), _BRAND),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 8),
        ("FONTSIZE",   (0, 1), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _BRAND_LIGHT]),
        ("GRID",       (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]


def _p(text: str, style) -> "Paragraph":
    """Cellule avec word-wrap."""
    return Paragraph(str(text), style)


def pdf_inventory(db: Session, ci_type: str | None = None) -> bytes:
    if not HAS_REPORTLAB:
        raise RuntimeError("reportlab non installé")

    q = (
        select(CI)
        .where(CI.deleted_at.is_(None))
        .options(selectinload(CI.hardware_details), selectinload(CI.software_details))
        .order_by(CI.ci_type, CI.name)
    )
    if ci_type:
        q = q.where(CI.ci_type == ci_type)
    cis = db.scalars(q).all()

    total_hw = sum(1 for c in cis if c.ci_type == "hardware")
    total_sw = sum(1 for c in cis if c.ci_type == "software")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=2 * cm, bottomMargin=1.5 * cm,
    )
    styles = _make_styles()
    # Style header de colonne blanc gras
    hdr_style = ParagraphStyle("col_hdr", fontSize=8, leading=10,
                               fontName="Helvetica-Bold", textColor=colors.white)
    cell  = styles["cell"]
    cellb = styles["cell_bold"]
    story = []

    story += _header_table(
        "Inventaire CMDB",
        f"{len(cis)} éléments — {total_hw} matériels · {total_sw} logiciels",
        styles,
        logo=_get_logo_image(db),
    )
    story.append(Spacer(1, 0.5 * cm))

    # Landscape A4 utilisable : 29.7 - 1.5 - 1.5 = 26.7 cm
    # Nom plus large, Type lisible, colonnes secondaires réduites
    headers    = ["Nom", "Type", "Statut", "Criticité", "Équipe",
                  "Emplacement", "Fabricant / Éditeur", "Modèle / Produit", "Fin garantie / EOL"]
    col_widths = [5.5*cm, 2.4*cm, 2.2*cm, 2.0*cm, 2.8*cm,
                  2.8*cm, 3.2*cm, 3.2*cm, 2.6*cm]  # total = 26.7 cm

    data = [[_p(h, hdr_style) for h in headers]]
    for ci in cis:
        hw = ci.hardware_details
        sw = ci.software_details
        maker    = hw.manufacturer if hw else (sw.vendor if sw else "")
        model    = hw.model       if hw else (sw.product if sw else "")
        deadline = (
            str(hw.warranty_end_date) if hw and hw.warranty_end_date else
            str(sw.eol_date)          if sw and sw.eol_date           else "—"
        )
        data.append([
            _p(ci.name,                                           cellb),
            _p("Matériel" if ci.ci_type == "hardware" else "Logiciel", cell),
            _p(ci.status,                                         cell),
            _p(ci.criticality,                                    cell),
            _p(ci.team     or "—",                                cell),
            _p(ci.location or "—",                                cell),
            _p(maker       or "—",                                cell),
            _p(model       or "—",                                cell),
            _p(deadline,                                          cell),
        ])

    ts = list(_base_table_style())
    ts.append(("ROWHEIGHT", (0, 0), (-1, 0), 18))      # header plus haut
    ts.append(("TOPPADDING",    (0, 1), (-1, -1), 4))
    ts.append(("BOTTOMPADDING", (0, 1), (-1, -1), 4))
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(ts))
    story.append(t)

    doc.build(story)
    return buf.getvalue()


def _section_title(text: str, styles) -> list:
    return [
        Spacer(1, 1.0 * cm),
        Paragraph(f"<b>{text}</b>", styles["section_title"]),
        Spacer(1, 0.1 * cm),
        HRFlowable(width="100%", thickness=0.5, color=_BRAND),
        Spacer(1, 0.25 * cm),
    ]


def pdf_executive(db: Session) -> bytes:
    """Rapport exécutif complet : KPIs, inventaire, vulnérabilités, SLA, incidents, licences."""
    if not HAS_REPORTLAB:
        raise RuntimeError("reportlab non installé")

    today = date.today()

    # ── Données ──
    total_ci     = db.scalar(select(func.count(CI.id)).where(CI.deleted_at.is_(None))) or 0
    hw_count     = db.scalar(select(func.count(CI.id)).where(CI.deleted_at.is_(None), CI.ci_type == "hardware")) or 0
    sw_count     = db.scalar(select(func.count(CI.id)).where(CI.deleted_at.is_(None), CI.ci_type == "software")) or 0

    open_incidents   = db.scalar(select(func.count(Incident.id)).where(Incident.status.in_(["open", "investigating"]))) or 0
    crit_incidents   = db.scalar(select(func.count(Incident.id)).where(Incident.status.in_(["open", "investigating"]), Incident.severity == "critical")) or 0
    total_incidents  = db.scalar(select(func.count(Incident.id))) or 0

    cve_count        = db.scalar(select(func.count(CICve.cve_id)).join(CICve.ci).where(CI.deleted_at.is_(None))) or 0
    crit_cve         = db.scalar(
        select(func.count(CICve.cve_id))
        .join(CICve.ci).join(CICve.cve)
        .where(CI.deleted_at.is_(None), Cve.cvss_severity == "CRITICAL")
    ) or 0

    slas         = db.scalars(select(Sla).options(selectinload(Sla.cis))).all()
    sla_total    = len(slas)
    sla_expired  = sum(1 for s in slas if s.contract_end_date and s.contract_end_date < today)
    sla_exp30    = sum(1 for s in slas if s.contract_end_date and today <= s.contract_end_date and (s.contract_end_date - today).days <= 30)

    sw_all       = db.scalars(select(SoftwareDetail)).all()
    lic_total    = len(sw_all)
    lic_expired  = sum(1 for s in sw_all if s.license_end_date and s.license_end_date < today)
    lic_exp30    = sum(1 for s in sw_all if s.license_end_date and today <= s.license_end_date and (s.license_end_date - today).days <= 30)

    hw_exp       = sum(
        1 for hw in db.scalars(select(HardwareDetail)).all()
        if hw.warranty_end_date and hw.warranty_end_date < today
    )

    # ── Document ──
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=2 * cm, bottomMargin=1.5 * cm,
    )
    styles = _make_styles()
    styles.add(ParagraphStyle("section_title", parent=styles["Normal"], fontSize=11, leading=14, textColor=_BRAND))
    styles.add(ParagraphStyle("kpi_label", fontSize=8, textColor=colors.gray))
    styles.add(ParagraphStyle("kpi_value", fontSize=20, textColor=_BRAND, fontName="Helvetica-Bold", leading=24))
    styles.add(ParagraphStyle("kpi_warn", fontSize=20, textColor=colors.HexColor("#DC2626"), fontName="Helvetica-Bold", leading=24))
    story = []

    story += _header_table(
        "Rapport Exécutif CMDB",
        f"Synthèse du parc et conformité — {today.strftime('%d/%m/%Y')}",
        styles,
        logo=_get_logo_image(db),
    )

    # ── KPIs synthèse ──
    story += _section_title("Synthèse du parc", styles)

    def _kpi(label: str, val: str, warn: bool = False):
        s = styles["kpi_warn"] if warn else styles["kpi_value"]
        return [Paragraph(str(val), s), Paragraph(label, styles["kpi_label"])]

    kpi_data = [
        [_kpi("CIs total", total_ci), _kpi("Matériels", hw_count), _kpi("Logiciels", sw_count)],
        [_kpi("Incidents ouverts", open_incidents, open_incidents > 0),
         _kpi("Incidents critiques", crit_incidents, crit_incidents > 0),
         _kpi("Incidents total", total_incidents)],
        [_kpi("CVEs détectées", cve_count),
         _kpi("CVEs critiques", crit_cve, crit_cve > 0),
         _kpi("Garanties expirées", hw_exp, hw_exp > 0)],
    ]
    kpi_col = [5.8 * cm] * 3
    for row in kpi_data:
        t = Table([row], colWidths=kpi_col)
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(t)

    # ── Conformité SLA ──
    story += _section_title("Contrats SLA", styles)
    sla_headers = ["Contrat", "Niveau", "Prestataire", "Fin contrat", "CIs couverts", "Statut"]
    sla_widths  = [4.9 * cm, 1.9 * cm, 3.9 * cm, 2.4 * cm, 2.4 * cm, 1.9 * cm]
    sla_data    = [sla_headers]
    sla_ts      = list(_base_table_style())

    slas_sorted = sorted(slas, key=lambda s: (s.contract_end_date or date(9999, 1, 1)))
    for i, sla in enumerate(slas_sorted, start=1):
        remaining = (sla.contract_end_date - today).days if sla.contract_end_date else None
        if sla.contract_end_date is None:
            status_txt = "Sans date"
        elif remaining < 0:
            status_txt = "Expiré"
        elif remaining <= 30:
            status_txt = f"Expire J-{remaining}"
        else:
            status_txt = "Actif"

        sla_data.append([
            sla.name[:40],
            sla.level or "—",
            (sla.provider or "—")[:30],
            str(sla.contract_end_date) if sla.contract_end_date else "—",
            str(len(sla.cis)),
            status_txt,
        ])
        if sla.contract_end_date and sla.contract_end_date < today:
            sla_ts.append(("TEXTCOLOR", (5, i), (5, i), colors.HexColor("#DC2626")))
            sla_ts.append(("FONTNAME", (5, i), (5, i), "Helvetica-Bold"))
        elif remaining is not None and remaining <= 30:
            sla_ts.append(("TEXTCOLOR", (5, i), (5, i), colors.HexColor("#CA8A04")))

    if len(sla_data) > 1:
        t = Table(sla_data, colWidths=sla_widths, repeatRows=1)
        t.setStyle(TableStyle(sla_ts))
        story.append(t)
    else:
        story.append(Paragraph("Aucun contrat SLA enregistré.", styles["cell"]))

    story.append(Paragraph(
        f"Total : {sla_total} contrat(s) — {sla_expired} expiré(s), {sla_exp30} expirant dans 30 j.",
        styles["header_date"],
    ))

    # ── Licences ──
    story += _section_title("Licences logiciels", styles)
    lic_rows_exp = [
        sw for sw in sw_all
        if sw.license_end_date and (sw.license_end_date - today).days <= 90
    ]
    lic_rows_exp.sort(key=lambda s: s.license_end_date)

    lic_headers = ["Produit", "Éditeur", "Type", "Sièges", "Fin licence", "J restants"]
    lic_widths  = [4.8 * cm, 3.4 * cm, 2.4 * cm, 1.9 * cm, 2.4 * cm, 2.5 * cm]
    lic_data    = [lic_headers]
    lic_ts      = list(_base_table_style())

    for i, sw in enumerate(lic_rows_exp, start=1):
        days_left = (sw.license_end_date - today).days
        lic_data.append([
            sw.product[:40],
            (sw.vendor or "—")[:25],
            sw.license_type or "—",
            str(sw.max_seats) if sw.max_seats else "—",
            str(sw.license_end_date),
            str(days_left),
        ])
        if days_left < 0:
            lic_ts.append(("TEXTCOLOR", (5, i), (5, i), colors.HexColor("#DC2626")))
            lic_ts.append(("FONTNAME", (5, i), (5, i), "Helvetica-Bold"))
        elif days_left <= 30:
            lic_ts.append(("TEXTCOLOR", (5, i), (5, i), colors.HexColor("#CA8A04")))

    if len(lic_data) > 1:
        t = Table(lic_data, colWidths=lic_widths, repeatRows=1)
        t.setStyle(TableStyle(lic_ts))
        story.append(t)
        story.append(Paragraph("Affiche les licences expirant dans les 90 prochains jours.", styles["header_date"]))
    else:
        story.append(Paragraph("Aucune licence expirant dans les 90 jours.", styles["cell"]))

    story.append(Paragraph(
        f"Total : {lic_total} logiciel(s) — {lic_expired} licence(s) expirée(s), {lic_exp30} expirant dans 30 j.",
        styles["header_date"],
    ))

    # ── Incidents ouverts ──
    # Récupère les incidents avec les noms de CIs via jointure
    story += _section_title("Incidents ouverts", styles)
    open_incs = db.scalars(
        select(Incident)
        .options(selectinload(Incident.ci_links))
        .where(Incident.status.in_(["open", "investigating"]))
        .order_by(Incident.severity, Incident.created_at)
        .limit(30)
    ).all()

    # Précharge les noms de CIs en une seule requête
    inc_ci_ids = {link.ci_id for inc in open_incs for link in inc.ci_links}
    ci_names_map: dict = {}
    if inc_ci_ids:
        ci_rows = db.execute(select(CI.id, CI.name).where(CI.id.in_(inc_ci_ids))).all()
        ci_names_map = {r.id: r.name for r in ci_rows}

    # A4 portrait utilisable : 21 - 1.8 - 1.8 = 17.4 cm
    inc_headers = ["Titre", "Sévérité", "Statut", "CIs liés", "Créé le"]
    inc_widths  = [6.0*cm, 2.2*cm, 2.2*cm, 4.8*cm, 2.2*cm]  # total = 17.4 cm
    _sev_map    = {"critical": colors.HexColor("#DC2626"), "high": colors.HexColor("#EA580C"),
                   "medium": colors.HexColor("#CA8A04"), "low": colors.HexColor("#16A34A")}
    hdr_style_inc = ParagraphStyle("col_hdr_inc", fontSize=8, leading=10,
                                   fontName="Helvetica-Bold", textColor=colors.white)
    cell_inc  = styles["cell"]

    inc_data = [[_p(h, hdr_style_inc) for h in inc_headers]]
    inc_ts   = list(_base_table_style())

    for i, inc in enumerate(open_incs, start=1):
        cis_names = ", ".join(ci_names_map.get(link.ci_id, "?") for link in inc.ci_links)
        sev_color = _sev_map.get(inc.severity, colors.black)
        sev_style = ParagraphStyle(f"sev_{i}", parent=cell_inc,
                                   textColor=sev_color, fontName="Helvetica-Bold")
        inc_data.append([
            _p(inc.title,          cell_inc),
            _p(inc.severity.upper(), sev_style),
            _p(inc.status,         cell_inc),
            _p(cis_names or "—",   cell_inc),
            _p(inc.created_at.strftime("%d/%m/%Y") if inc.created_at else "—", cell_inc),
        ])

    if len(inc_data) > 1:
        inc_ts.append(("ROWHEIGHT",     (0, 0), (-1, 0),  18))
        inc_ts.append(("TOPPADDING",    (0, 1), (-1, -1),  5))
        inc_ts.append(("BOTTOMPADDING", (0, 1), (-1, -1),  5))
        t = Table(inc_data, colWidths=inc_widths, repeatRows=1)
        t.setStyle(TableStyle(inc_ts))
        story.append(t)
        if len(open_incs) == 30:
            story.append(Paragraph("(limité aux 30 plus récents)", styles["header_date"]))
    else:
        story.append(Paragraph("Aucun incident ouvert.", styles["cell"]))

    doc.build(story)
    return buf.getvalue()


def pdf_cves(db: Session) -> bytes:
    if not HAS_REPORTLAB:
        raise RuntimeError("reportlab non installé")

    q = (
        select(CICve)
        .options(selectinload(CICve.ci), selectinload(CICve.cve))
        .join(CICve.ci)
        .where(CI.deleted_at.is_(None))
        .order_by(CICve.cve_id)
    )
    links = db.scalars(q).all()

    # Statistiques
    by_sev: dict[str, int] = {}
    for link in links:
        sev = link.cve.cvss_severity or "UNKNOWN"
        by_sev[sev] = by_sev.get(sev, 0) + 1

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=2 * cm, bottomMargin=1.5 * cm,
    )
    styles = _make_styles()
    # Landscape A4 utilisable : 29.7 - 1.5 - 1.5 = 26.7 cm
    hdr_style_cve = ParagraphStyle("col_hdr_cve", fontSize=8, leading=10,
                                   fontName="Helvetica-Bold", textColor=colors.white)
    cell_cve = styles["cell"]
    story = []

    sev_summary = " · ".join(f"{k}: {v}" for k, v in sorted(by_sev.items()))
    story += _header_table("Rapport Vulnérabilités", f"{len(links)} CVE associées — {sev_summary}", styles, logo=_get_logo_image(db))
    story.append(Spacer(1, 0.5 * cm))

    headers = ["CVE ID", "CI", "Sévérité", "Score", "KEV", "Statut", "Résumé"]
    col_widths = [3.0*cm, 4.5*cm, 2.2*cm, 1.5*cm, 1.0*cm, 2.8*cm, 11.7*cm]  # total = 26.7 cm

    data = [[_p(h, hdr_style_cve) for h in headers]]
    ts = list(_base_table_style())
    for i, link in enumerate(links, start=1):
        cve: Cve = link.cve
        sev = cve.cvss_severity or ""
        sev_color = _SEV_COLORS.get(sev, colors.black)
        sev_style = ParagraphStyle(f"cve_sev_{i}", parent=cell_cve,
                                   textColor=sev_color, fontName="Helvetica-Bold")
        data.append([
            _p(link.cve_id,                                            cell_cve),
            _p(link.ci.name if link.ci else "—",                       cell_cve),
            _p(sev,                                                    sev_style),
            _p(str(cve.cvss_score) if cve.cvss_score else "—",         cell_cve),
            _p("✓" if cve.is_kev else "",                              cell_cve),
            _p(link.status,                                            cell_cve),
            _p((cve.summary or "")[:400],                              cell_cve),
        ])

    ts.append(("ROWHEIGHT",     (0, 0), (-1, 0),  18))
    ts.append(("TOPPADDING",    (0, 1), (-1, -1),  4))
    ts.append(("BOTTOMPADDING", (0, 1), (-1, -1),  4))
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(ts))
    story.append(t)

    doc.build(story)
    return buf.getvalue()
