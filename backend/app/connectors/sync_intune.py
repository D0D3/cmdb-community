"""Synchronisation Microsoft Intune → CIs matériels CMDB."""
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cmdb.models import CI, HardwareDetail
from app.connectors.crypto import decrypt_config
from .models import Connector


def _ms_token(config: dict) -> str:
    resp = httpx.post(
        f"https://login.microsoftonline.com/{config['tenant_id']}/oauth2/v2.0/token",
        data={
            "grant_type":    "client_credentials",
            "client_id":     config["client_id"],
            "client_secret": config["client_secret"],
            "scope":         "https://graph.microsoft.com/.default",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _paginate(url: str, token: str, params: Optional[dict] = None) -> list[dict]:
    headers = {"Authorization": f"Bearer {token}"}
    items: list[dict] = []
    next_url: Optional[str] = url
    while next_url:
        resp = httpx.get(
            next_url,
            headers=headers,
            params=params if next_url == url else None,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("value", []))
        next_url = data.get("@odata.nextLink")
    return items


_OS_SUBTYPE_MAP = {
    "windows": "workstation",
    "macos":   "workstation",
    "ios":     "workstation",
    "android": "workstation",
}
_SERVER_KEYWORDS = ("server", "srv", "dc", "ad")


def _hw_subtype(os: str, name: str) -> str:
    os_lower = (os or "").lower()
    name_lower = (name or "").lower()
    if "server" in os_lower:
        return "server"
    if any(kw in name_lower for kw in _SERVER_KEYWORDS):
        return "server"
    return _OS_SUBTYPE_MAP.get(os_lower.split()[0] if os_lower else "", "workstation")


def _find_ci_by_intune_id(db: Session, intune_id: str) -> Optional[CI]:
    candidates = db.scalars(
        select(CI).where(CI.ci_type == "hardware", CI.attributes.is_not(None))
    ).all()
    return next(
        (c for c in candidates if (c.attributes or {}).get("intune_id") == intune_id),
        None,
    )


def sync_intune_devices(connector: Connector, db: Session) -> dict:
    """
    Synchronise les appareils gérés Intune dans les CIs matériels CMDB.
    - Identifiant unique : intune_id (stocké dans CI.attributes)
    - Met à jour manufacturer, model, serial_number, os_name, os_version, hw_subtype
    - Stocke l'utilisateur Intune et la date de dernière sync dans CI.attributes
    Renvoie {created, updated, total, errors}.
    """
    cfg = decrypt_config(connector.config_encrypted)
    token = _ms_token(cfg)

    devices = _paginate(
        "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices",
        token,
        params={
            "$select": (
                "id,deviceName,operatingSystem,osVersion,manufacturer,model,"
                "serialNumber,userDisplayName,userPrincipalName,"
                "complianceState,lastSyncDateTime,managedDeviceOwnerType"
            ),
            "$top": "999",
        },
    )

    created = updated = errors = 0

    for dev in devices:
        try:
            intune_id = dev["id"]
            name = (dev.get("deviceName") or intune_id).strip()
            os_name = dev.get("operatingSystem") or ""
            subtype = _hw_subtype(os_name, name)

            attrs = {
                "intune_id":           intune_id,
                "intune_user":         dev.get("userDisplayName"),
                "intune_user_upn":     dev.get("userPrincipalName"),
                "intune_compliance":   dev.get("complianceState"),
                "intune_last_sync":    dev.get("lastSyncDateTime"),
                "intune_owner_type":   dev.get("managedDeviceOwnerType"),
            }

            ci = _find_ci_by_intune_id(db, intune_id)

            if ci:
                ci.attributes = {**(ci.attributes or {}), **attrs}
                hw = db.get(HardwareDetail, ci.id)
                if hw:
                    hw.manufacturer = dev.get("manufacturer") or hw.manufacturer
                    hw.model        = dev.get("model")        or hw.model
                    hw.serial_number = dev.get("serialNumber") or hw.serial_number
                    hw.os_name      = os_name or hw.os_name
                    hw.os_version   = dev.get("osVersion") or hw.os_version
                    hw.hw_subtype   = subtype
                else:
                    db.add(HardwareDetail(
                        ci_id=ci.id,
                        manufacturer=dev.get("manufacturer"),
                        model=dev.get("model"),
                        serial_number=dev.get("serialNumber"),
                        os_name=os_name,
                        os_version=dev.get("osVersion"),
                        hw_subtype=subtype,
                    ))
                updated += 1
            else:
                ci = CI(
                    name=name,
                    ci_type="hardware",
                    status="in_service",
                    attributes=attrs,
                )
                db.add(ci)
                db.flush()
                db.add(HardwareDetail(
                    ci_id=ci.id,
                    manufacturer=dev.get("manufacturer"),
                    model=dev.get("model"),
                    serial_number=dev.get("serialNumber"),
                    os_name=os_name,
                    os_version=dev.get("osVersion"),
                    hw_subtype=subtype,
                ))
                created += 1
        except Exception:
            errors += 1

    db.commit()
    return {
        "created": created,
        "updated": updated,
        "total":   len(devices),
        "errors":  errors,
    }
