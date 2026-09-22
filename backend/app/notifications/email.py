"""Envoi d'emails via SMTP.

Priorité : connecteur SMTP activé en DB → fallback sur variables d'env.
Silencieux si aucun SMTP configuré (log warning uniquement).
"""
from __future__ import annotations
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional

logger = logging.getLogger(__name__)


def _get_smtp_config() -> Optional[dict]:
    """Retourne la config SMTP : connecteur DB en priorité, sinon settings."""
    try:
        from app.core.database import SessionLocal
        from app.connectors.models import Connector
        from app.connectors.service import decrypt_config

        with SessionLocal() as db:
            conn = (
                db.query(Connector)
                .filter(Connector.connector_type == "smtp", Connector.enabled.is_(True))
                .first()
            )
            if conn and conn.config_encrypted:
                cfg = decrypt_config(conn.config_encrypted)
                if cfg.get("host"):
                    return cfg
    except Exception as e:
        logger.debug("Pas de connecteur SMTP en DB : %s", e)

    from app.core.config import get_settings
    s = get_settings()
    if s.smtp_enabled:
        return {
            "host":     s.smtp_host,
            "port":     s.smtp_port,
            "user":     s.smtp_user,
            "password": s.smtp_password,
            "from":     s.smtp_from,
            "use_tls":  True,
        }
    return None


def send_email(to: str | list[str], subject: str, html_body: str) -> bool:
    """Envoie un email. Retourne True si succès, False sinon."""
    cfg = _get_smtp_config()
    if not cfg:
        logger.debug("SMTP non configuré — email ignoré : %s", subject)
        return False

    recipients = [to] if isinstance(to, str) else to
    if not recipients:
        return False

    sender = cfg.get("from") or cfg.get("user", "cmdb@example.com")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = sender
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    host     = cfg.get("host", "")
    port     = int(cfg.get("port", 587))
    user     = cfg.get("user", "")
    password = cfg.get("password", "")
    use_tls  = cfg.get("use_tls", True)

    try:
        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx) as srv:
                if user:
                    srv.login(user, password)
                srv.sendmail(sender, recipients, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=10) as srv:
                if use_tls:
                    srv.starttls(context=ssl.create_default_context())
                if user:
                    srv.login(user, password)
                srv.sendmail(sender, recipients, msg.as_string())

        logger.info("Email envoyé → %s : %s", recipients, subject)
        return True

    except Exception as exc:
        logger.warning("Échec envoi email vers %s : %s", recipients, exc)
        return False


# ── Templates RFC ─────────────────────────────────────────────────────────────

def send_email_with_attachment(
    to: str | list[str],
    subject: str,
    html_body: str,
    attachment_name: str,
    attachment_data: bytes,
    attachment_mime: str = "application/octet-stream",
) -> bool:
    """Envoie un email avec une pièce jointe."""
    cfg = _get_smtp_config()
    if not cfg:
        logger.debug("SMTP non configuré — email avec PJ ignoré : %s", subject)
        return False

    recipients = [to] if isinstance(to, str) else to
    if not recipients:
        return False

    sender = cfg.get("from") or cfg.get("user", "cmdb@example.com")

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"]    = sender
    msg["To"]      = ", ".join(recipients)

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    part = MIMEBase(*attachment_mime.split("/", 1))
    part.set_payload(attachment_data)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename=attachment_name)
    msg.attach(part)

    host     = cfg.get("host", "")
    port     = int(cfg.get("port", 587))
    user     = cfg.get("user", "")
    password = cfg.get("password", "")
    use_tls  = cfg.get("use_tls", True)

    try:
        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx) as srv:
                if user:
                    srv.login(user, password)
                srv.sendmail(sender, recipients, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=10) as srv:
                if use_tls:
                    srv.starttls(context=ssl.create_default_context())
                if user:
                    srv.login(user, password)
                srv.sendmail(sender, recipients, msg.as_string())
        logger.info("Email avec PJ envoyé → %s : %s", recipients, subject)
        return True
    except Exception as exc:
        logger.warning("Échec envoi email avec PJ vers %s : %s", recipients, exc)
        return False


def _base(title: str, body: str, domain: str = "") -> str:
    url = f"https://{domain}" if domain else ""
    return f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#6d28d9;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">CMDB — {title}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    {f'<p style="margin-top:24px"><a href="{url}/changes" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir les changements</a></p>' if url else ''}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Ce message a été généré automatiquement par la CMDB.</p>
  </div>
</body></html>"""


def notify_rfc_submitted(change_id: str, title: str, requester: str,
                          approver_email: str, domain: str = "") -> None:
    """Notifie l'approbateur qu'une RFC attend son avis."""
    body = f"""
    <p>Bonjour,</p>
    <p>Une nouvelle RFC est en attente de votre approbation :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;color:#6b7280;width:140px">Référence</td><td style="padding:8px;font-weight:600">{change_id[:8].upper()}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Titre</td><td style="padding:8px">{title}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Demandé par</td><td style="padding:8px">{requester}</td></tr>
    </table>
    <p>Connectez-vous à la CMDB pour approuver ou rejeter cette demande.</p>"""
    send_email(approver_email, f"[CMDB] RFC en attente d'approbation — {title}", _base("RFC en attente", body, domain))


def notify_rfc_decision(change_id: str, title: str, new_status: str,
                         requester_email: str, comment: str = "", domain: str = "") -> None:
    """Notifie le demandeur de la décision sur sa RFC."""
    label = "approuvée ✅" if new_status == "approved" else "rejetée ❌"
    body = f"""
    <p>Bonjour,</p>
    <p>Votre RFC a été <strong>{label}</strong> :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;color:#6b7280;width:140px">Référence</td><td style="padding:8px;font-weight:600">{change_id[:8].upper()}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Titre</td><td style="padding:8px">{title}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Statut</td><td style="padding:8px">{label}</td></tr>
      {f'<tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Commentaire</td><td style="padding:8px">{comment}</td></tr>' if comment else ''}
    </table>"""
    send_email(requester_email, f"[CMDB] RFC {label} — {title}", _base(f"RFC {label}", body, domain))


def notify_rfc_completed(change_id: str, title: str,
                          requester_email: str, domain: str = "") -> None:
    body = f"""
    <p>Bonjour,</p>
    <p>La RFC <strong>{title}</strong> a été marquée comme <strong>terminée ✅</strong>.</p>
    <p>Référence : <strong>{change_id[:8].upper()}</strong></p>"""
    send_email(requester_email, f"[CMDB] RFC terminée — {title}", _base("RFC terminée", body, domain))


def notify_critical_alert(ci_name: str, alert_title: str,
                           recipients: list[str], domain: str = "") -> None:
    body = f"""
    <p>Une alerte critique a été déclenchée :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;color:#6b7280;width:140px">CI</td><td style="padding:8px;font-weight:600">{ci_name}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Alerte</td><td style="padding:8px">{alert_title}</td></tr>
    </table>
    <p>Connectez-vous à la CMDB pour consulter le détail et résoudre l'alerte.</p>"""
    url = f"https://{domain}" if domain else ""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#dc2626;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">⚠ CMDB — Alerte critique</h2>
  </div>
  <div style="border:1px solid #fecaca;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    {f'<p style="margin-top:24px"><a href="{url}/alerts" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir les alertes</a></p>' if url else ''}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Ce message a été généré automatiquement par la CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] Alerte critique — {alert_title}", html)


def notify_sla_expiring(items: list[dict], recipients: list[str], domain: str = "") -> None:
    """items : [{'name': str, 'ci': str, 'days': int, 'end_date': str}]"""
    url = f"https://{domain}" if domain else ""
    rows = "".join(
        f"<tr{'style=\"background:#f9fafb\"' if i % 2 else ''}>"
        f"<td style='padding:8px'>{r['name']}</td>"
        f"<td style='padding:8px'>{r.get('ci', '—')}</td>"
        f"<td style='padding:8px;font-weight:600;color:{'#dc2626' if r['days']<=7 else '#d97706'}'>{r['days']} j</td>"
        f"<td style='padding:8px'>{r['end_date']}</td></tr>"
        for i, r in enumerate(items)
    )
    body = f"""
    <p>Les contrats SLA suivants arrivent à expiration prochainement :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <thead><tr style="background:#6d28d9;color:#fff">
        <th style="padding:8px;text-align:left">Contrat</th>
        <th style="padding:8px;text-align:left">CI associé</th>
        <th style="padding:8px;text-align:left">Délai</th>
        <th style="padding:8px;text-align:left">Échéance</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    {f'<p><a href="{url}/slas" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Gérer les SLA</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#d97706;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">⏰ CMDB — Expiration SLA imminente</h2>
  </div>
  <div style="border:1px solid #fde68a;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] {len(items)} contrat(s) SLA expirent bientôt", html)


def notify_license_expiring(items: list[dict], recipients: list[str], domain: str = "") -> None:
    """items : [{'software': str, 'version': str, 'days': int, 'end_date': str}]"""
    url = f"https://{domain}" if domain else ""
    rows = "".join(
        f"<tr{'style=\"background:#f9fafb\"' if i % 2 else ''}>"
        f"<td style='padding:8px'>{r['software']}</td>"
        f"<td style='padding:8px'>{r.get('version','—')}</td>"
        f"<td style='padding:8px;font-weight:600;color:{'#dc2626' if r['days']<=7 else '#d97706'}'>{r['days']} j</td>"
        f"<td style='padding:8px'>{r['end_date']}</td></tr>"
        for i, r in enumerate(items)
    )
    body = f"""
    <p>Les licences logicielles suivantes expirent prochainement :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <thead><tr style="background:#6d28d9;color:#fff">
        <th style="padding:8px;text-align:left">Logiciel</th>
        <th style="padding:8px;text-align:left">Version</th>
        <th style="padding:8px;text-align:left">Délai</th>
        <th style="padding:8px;text-align:left">Expiration</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    {f'<p><a href="{url}/software" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir les logiciels</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#7c3aed;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">📋 CMDB — Expiration de licences</h2>
  </div>
  <div style="border:1px solid #ddd6fe;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] {len(items)} licence(s) expirent bientôt", html)


def notify_warranty_expiring(items: list[dict], recipients: list[str], domain: str = "") -> None:
    """items : [{'name': str, 'days': int, 'end_date': str}]"""
    url = f"https://{domain}" if domain else ""
    rows = "".join(
        f"<tr{'style=\"background:#f9fafb\"' if i % 2 else ''}>"
        f"<td style='padding:8px'>{r['name']}</td>"
        f"<td style='padding:8px;font-weight:600;color:{'#dc2626' if r['days']<=7 else '#d97706'}'>{r['days']} j</td>"
        f"<td style='padding:8px'>{r['end_date']}</td></tr>"
        for i, r in enumerate(items)
    )
    body = f"""
    <p>Les garanties matériel suivantes arrivent à expiration prochainement :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <thead><tr style="background:#6d28d9;color:#fff">
        <th style="padding:8px;text-align:left">Équipement</th>
        <th style="padding:8px;text-align:left">Délai</th>
        <th style="padding:8px;text-align:left">Fin de garantie</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    {f'<p><a href="{url}/expiring" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir la page Fin de vie</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#7c3aed;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">🔧 CMDB — Expiration de garanties</h2>
  </div>
  <div style="border:1px solid #ddd6fe;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] {len(items)} garantie(s) matériel expirent bientôt", html)


def notify_leasing_expiring(items: list[dict], recipients: list[str], domain: str = "") -> None:
    """items : [{'name': str, 'provider': str, 'days': int, 'end_date': str}]"""
    url = f"https://{domain}" if domain else ""
    rows = "".join(
        f"<tr{'style=\"background:#f9fafb\"' if i % 2 else ''}>"
        f"<td style='padding:8px'>{r['name']}</td>"
        f"<td style='padding:8px'>{r.get('provider', '—')}</td>"
        f"<td style='padding:8px;font-weight:600;color:{'#dc2626' if r['days']<=7 else '#d97706'}'>{r['days']} j</td>"
        f"<td style='padding:8px'>{r['end_date']}</td></tr>"
        for i, r in enumerate(items)
    )
    body = f"""
    <p>Les leasings matériel suivants arrivent à expiration prochainement :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <thead><tr style="background:#6d28d9;color:#fff">
        <th style="padding:8px;text-align:left">Équipement</th>
        <th style="padding:8px;text-align:left">Prestataire</th>
        <th style="padding:8px;text-align:left">Délai</th>
        <th style="padding:8px;text-align:left">Fin de leasing</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    {f'<p><a href="{url}/expiring" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir la page Fin de vie</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">📋 CMDB — Expiration de leasings</h2>
  </div>
  <div style="border:1px solid #bfdbfe;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] {len(items)} leasing(s) matériel expirent bientôt", html)


def notify_cve_critical_new(cves: list[dict], recipients: list[str], domain: str = "") -> None:
    """cves : [{'cve_id': str, 'title': str, 'cvss': float, 'published': str}]"""
    url = f"https://{domain}" if domain else ""
    rows = "".join(
        f"<tr{'style=\"background:#f9fafb\"' if i % 2 else ''}>"
        f"<td style='padding:8px;font-weight:600'>{c['cve_id']}</td>"
        f"<td style='padding:8px'>{c.get('title','')[:60]}</td>"
        f"<td style='padding:8px;color:#dc2626;font-weight:700'>{c.get('cvss','')}</td>"
        f"<td style='padding:8px'>{c.get('published','')}</td></tr>"
        for i, c in enumerate(cves)
    )
    body = f"""
    <p><strong>{len(cves)}</strong> nouvelle(s) CVE critique(s) (CVSS ≥ 9.0) ont été détectées lors de la dernière synchronisation NVD :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <thead><tr style="background:#dc2626;color:#fff">
        <th style="padding:8px;text-align:left">CVE</th>
        <th style="padding:8px;text-align:left">Description</th>
        <th style="padding:8px;text-align:left">CVSS</th>
        <th style="padding:8px;text-align:left">Publiée le</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    {f'<p><a href="{url}/cves" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir les CVE</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#dc2626;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">🔴 CMDB — Nouvelles CVE critiques</h2>
  </div>
  <div style="border:1px solid #fecaca;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] {len(cves)} nouvelles CVE critiques détectées", html)


def notify_connector_sync_error(connector_name: str, connector_type: str,
                                 error: str, recipients: list[str], domain: str = "") -> None:
    url = f"https://{domain}" if domain else ""
    body = f"""
    <p>La synchronisation du connecteur suivant a échoué :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;color:#6b7280;width:140px">Connecteur</td><td style="padding:8px;font-weight:600">{connector_name}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Type</td><td style="padding:8px">{connector_type}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;vertical-align:top">Erreur</td>
          <td style="padding:8px;color:#dc2626;font-family:monospace;font-size:12px">{error[:500]}</td></tr>
    </table>
    {f'<p><a href="{url}/admin/connectors" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Gérer les connecteurs</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#dc2626;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">⚠ CMDB — Erreur de sync connecteur</h2>
  </div>
  <div style="border:1px solid #fecaca;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] Erreur de synchronisation — {connector_name}", html)


def notify_weekly_digest(stats: dict, recipients: list[str], domain: str = "") -> None:
    """stats: {ci_total, ci_active, alerts_critical, incidents_open, cve_critical, sla_expiring_30, license_expiring_30}"""
    url = f"https://{domain}" if domain else ""

    def _row(label: str, value, color: str = "#1a1a1a", i: int = 0) -> str:
        bg = "background:#f9fafb;" if i % 2 else ""
        return f"<tr><td style='padding:8px;color:#6b7280;{bg}'>{label}</td><td style='padding:8px;font-weight:600;color:{color}'>{value}</td></tr>"

    body = f"""
    <p>Bonjour,</p>
    <p>Voici le résumé hebdomadaire de votre CMDB :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      {_row("CIs actifs", stats.get("ci_active", "—"), i=0)}
      {_row("CIs total", stats.get("ci_total", "—"), i=1)}
      {_row("Alertes critiques actives", stats.get("alerts_critical", 0), "#dc2626", 2)}
      {_row("Incidents ouverts", stats.get("incidents_open", 0), "#d97706", 3)}
      {_row("CVE critiques (CVSS ≥ 9)", stats.get("cve_critical", 0), "#dc2626", 4)}
      {_row("SLA expirant dans 30j", stats.get("sla_expiring_30", 0), "#d97706", 5)}
      {_row("Licences expirant dans 30j", stats.get("license_expiring_30", 0), "#d97706", 6)}
    </table>
    {f'<p><a href="{url}" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Ouvrir la CMDB</a></p>' if url else ''}"""
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#6d28d9;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">📊 CMDB — Digest hebdomadaire</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Message automatique CMDB — chaque lundi à 8h.</p>
  </div>
</body></html>"""
    from datetime import date
    week = date.today().isocalendar()[1]
    send_email(recipients, f"[CMDB] Digest hebdomadaire — semaine {week}", html)


def notify_incident_event(incident_id: str, title: str, severity: str,
                           reporter: str, recipients: list[str], domain: str = "") -> None:
    SEV_LABELS = {"critical": "Critique 🔴", "high": "Haute 🟠", "medium": "Moyenne 🟡", "low": "Faible 🔵"}
    sev_label = SEV_LABELS.get(severity, severity)
    url = f"https://{domain}" if domain else ""
    body = f"""
    <p>Un incident a été déclaré :</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:8px;color:#6b7280;width:140px">Référence</td><td style="padding:8px;font-weight:600">{incident_id[:8].upper()}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Titre</td><td style="padding:8px">{title}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Sévérité</td><td style="padding:8px"><strong>{sev_label}</strong></td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Déclaré par</td><td style="padding:8px">{reporter}</td></tr>
    </table>
    <p>Connectez-vous à la CMDB pour prendre en charge cet incident.</p>"""
    bg = "#dc2626" if severity == "critical" else "#d97706"
    html = f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:{bg};padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">🚨 CMDB — Incident {sev_label}</h2>
  </div>
  <div style="border:1px solid #fecaca;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    {body}
    {f'<p style="margin-top:24px"><a href="{url}/incidents" style="background:{bg};color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Voir les incidents</a></p>' if url else ''}
    <p style="margin-top:32px;font-size:12px;color:#9ca3af">Ce message a été généré automatiquement par la CMDB.</p>
  </div>
</body></html>"""
    send_email(recipients, f"[CMDB] Incident {sev_label} — {title}", html)
