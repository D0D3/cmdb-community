"""Logique de synchronisation GLPI → CI hardware."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, cast
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.cmdb.models import CI, HardwareDetail
from app.glpi.client import GLPIClient

logger = logging.getLogger(__name__)

# ── Mapping statuts GLPI → CI status ─────────────────────────────────────────

_STATUS_MAP = {
    # noms français courants
    "en cours": "in_service",
    "en production": "in_service",
    "en service": "in_service",
    "actif": "in_service",
    "active": "in_service",
    "en stock": "in_stock",
    "stock": "in_stock",
    "spare": "in_stock",
    "hors service": "retired",
    "mis au rebut": "retired",
    "rebut": "retired",
    "retired": "retired",
    "en réparation": "maintenance",
    "maintenance": "maintenance",
    "réservé": "in_stock",
    "commandé": "ordered",
    "ordered": "ordered",
}


def _map_status(state_name: str) -> str:
    return _STATUS_MAP.get(state_name.strip().lower(), "in_service")


def _parse_date(s: Optional[str]) -> Optional[str]:
    """Convertit 'YYYY-MM-DD HH:MM:SS' en 'YYYY-MM-DD' (format date HTML/SQLAlchemy)."""
    if not s or s.startswith("0000"):
        return None
    return s[:10]


# ── Upsert d'un CI depuis un enregistrement GLPI ──────────────────────────────

def _upsert_computer(
    db: Session,
    computer: dict,
    manufacturers: dict[int, str],
    models: dict[int, str],
    locations: dict[int, str],
    states: dict[int, str],
    groups: dict[int, str],
) -> str:
    """Crée ou met à jour un CI. Retourne 'created' | 'updated' | 'skipped'."""
    glpi_id: int = computer["id"]
    name: str = computer.get("name") or f"GLPI-{glpi_id}"
    serial: str = computer.get("serial") or ""

    # ── Recherche CI existant : d'abord par glpi_id dans attributes
    existing: Optional[CI] = None
    try:
        rows = db.scalars(
            select(CI).where(CI.ci_type == "hardware")
        ).all()
        for ci in rows:
            if ci.attributes.get("glpi_id") == glpi_id:
                existing = ci
                break
        if not existing and serial:
            for ci in rows:
                if ci.hardware_details and ci.hardware_details.serial_number == serial:
                    existing = ci
                    break
    except Exception:
        pass

    state_name = states.get(computer.get("states_id", 0), "")
    status = _map_status(state_name)
    manufacturer = manufacturers.get(computer.get("manufacturers_id", 0), None)
    model = models.get(computer.get("computermodels_id", 0), None)
    location = locations.get(computer.get("locations_id", 0), None)
    team = groups.get(computer.get("groups_id_tech", 0) or computer.get("groups_id", 0), None)
    description = computer.get("comment") or None
    purchase_date = _parse_date(computer.get("date_creation"))

    now_str = datetime.now(timezone.utc).isoformat()
    attributes = {"glpi_id": glpi_id, "glpi_last_sync": now_str}

    if existing:
        existing.name = name
        existing.status = status
        existing.location = location
        existing.team = team
        existing.description = description
        existing.attributes = {**existing.attributes, **attributes}
        if existing.hardware_details:
            existing.hardware_details.manufacturer = manufacturer
            existing.hardware_details.model = model
            if serial:
                existing.hardware_details.serial_number = serial
        db.flush()
        return "updated"

    # Création
    ci = CI(
        id=uuid.uuid4(),
        ci_type="hardware",
        name=name,
        description=description,
        status=status,
        criticality="medium",
        team=team,
        location=location,
        attributes=attributes,
    )
    db.add(ci)
    db.flush()

    hw = HardwareDetail(
        ci_id=ci.id,
        manufacturer=manufacturer,
        model=model,
        serial_number=serial or None,
        purchase_date=purchase_date,
    )
    db.add(hw)
    db.flush()
    return "created"


# ── Point d'entrée de la sync ─────────────────────────────────────────────────

def run_sync(db: Session, client: GLPIClient) -> dict:
    import time
    t0 = time.time()

    logger.info("GLPI sync : chargement des lookups…")
    manufacturers = client.get_lookup("Manufacturer")
    models        = client.get_lookup("ComputerModel")
    locations     = client.get_lookup("Location")
    states        = client.get_lookup("State")
    groups        = client.get_lookup("Group")

    logger.info("GLPI sync : récupération des ordinateurs…")
    computers = client.get_computers()
    total_glpi = len(computers)
    logger.info("GLPI sync : %d ordinateurs trouvés", total_glpi)

    created = updated = skipped = errors = 0
    for computer in computers:
        if computer.get("is_deleted") or computer.get("is_template"):
            skipped += 1
            continue
        try:
            result = _upsert_computer(db, computer, manufacturers, models, locations, states, groups)
            if result == "created":
                created += 1
            elif result == "updated":
                updated += 1
            else:
                skipped += 1
        except Exception as exc:
            logger.warning("GLPI sync : erreur CI %s — %s", computer.get("id"), exc)
            errors += 1

    db.commit()
    duration = round(time.time() - t0, 1)
    logger.info("GLPI sync terminé : %d créés, %d mis à jour, %d erreurs en %.1fs",
                created, updated, errors, duration)

    return {
        "total_glpi": total_glpi,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "duration_s": duration,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }
