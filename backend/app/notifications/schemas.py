"""Schémas notifications : règles, labels/descriptions des event_types, test d'envoi."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

EVENT_LABELS: dict[str, str] = {
    # Alertes temps réel
    "alert_critical":    "Alertes critiques",
    "incident_critical": "Incidents critiques (sévérité critique)",
    "incident_open":     "Nouvel incident ouvert",
    # Changements
    "rfc_submitted":     "RFC soumise pour approbation",
    "rfc_decision":      "Décision RFC (approbation / rejet)",
    "rfc_completed":     "RFC terminée",
    # Expiration & conformité
    "sla_expiring":           "Contrats SLA — expiration imminente (J-30, J-7, J-1)",
    "license_expiring":       "Licences logicielles — expiration imminente (J-30, J-7, J-1)",
    "warranty_expiring":      "Garanties matériel — expiration imminente (J-30, J-7, J-1)",
    "leasing_expiring":       "Leasings matériel — expiration imminente (J-30, J-7, J-1)",
    "cve_critical_new":       "Nouvelles CVE critiques (CVSS ≥ 9.0) détectées",
    "connector_sync_error":   "Erreur de synchronisation connecteur",
    # Résumé
    "digest_weekly":          "Digest hebdomadaire — résumé de la CMDB (lundi 8h)",
}

EVENT_DESCRIPTIONS: dict[str, str] = {
    "alert_critical":         "Envoyé à chaque heure si des alertes critiques non résolues existent.",
    "incident_critical":      "Envoyé à la création d'un incident de sévérité critique.",
    "incident_open":          "Envoyé à chaque nouvel incident ouvert.",
    "rfc_submitted":          "Envoyé aux approbateurs quand une RFC est soumise.",
    "rfc_decision":           "Envoyé au demandeur quand sa RFC est approuvée ou rejetée.",
    "rfc_completed":          "Envoyé au demandeur quand sa RFC est clôturée.",
    "sla_expiring":           "Récapitulatif des contrats arrivant à échéance dans 30, 7 et 1 jour.",
    "license_expiring":       "Récapitulatif des licences arrivant à expiration dans 30, 7 et 1 jour.",
    "warranty_expiring":      "Récapitulatif des garanties matériel arrivant à expiration dans 30, 7 et 1 jour.",
    "leasing_expiring":       "Récapitulatif des leasings matériel arrivant à expiration dans 30, 7 et 1 jour.",
    "cve_critical_new":       "Envoyé après chaque sync NVD si de nouvelles CVE CVSS ≥ 9.0 sont découvertes.",
    "connector_sync_error":   "Envoyé quand la synchronisation d'un connecteur se termine en erreur.",
    "digest_weekly":          "Synthèse hebdomadaire : CIs actifs, alertes, incidents, CVE, SLA.",
}


class NotificationRuleOut(BaseModel):
    id: uuid.UUID
    event_type: str
    event_label: str
    event_description: str
    enabled: bool
    recipient_emails: list[str]
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_enriched(cls, rule) -> "NotificationRuleOut":
        return cls(
            id=rule.id,
            event_type=rule.event_type,
            event_label=EVENT_LABELS.get(rule.event_type, rule.event_type),
            event_description=EVENT_DESCRIPTIONS.get(rule.event_type, ""),
            enabled=rule.enabled,
            recipient_emails=rule.recipient_emails or [],
            updated_at=rule.updated_at,
        )


class NotificationRuleUpdate(BaseModel):
    enabled: Optional[bool] = None
    recipient_emails: Optional[list[str]] = None

    @field_validator("recipient_emails")
    @classmethod
    def validate_emails(cls, v):
        if v is None:
            return v
        import re
        pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
        for email in v:
            if not pattern.match(email):
                raise ValueError(f"Adresse invalide : {email}")
        return v


class NotificationTestIn(BaseModel):
    event_type: str
    recipient: str
