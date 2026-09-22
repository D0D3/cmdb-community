"""Schémas Pydantic Key Users (création, affichage, recherche multi-source, page globale)."""
import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator, model_validator


class CIKeyUserCreate(BaseModel):
    user_type: Literal["local", "entra", "ldap"]
    role: Literal["key_user", "owner", "referent", "local_admin"] = "key_user"
    notes: Optional[str] = None

    # local
    local_user_id: Optional[uuid.UUID] = None

    # entra
    entra_oid: Optional[str] = None
    entra_email: Optional[str] = None
    entra_display_name: Optional[str] = None
    entra_job_title: Optional[str] = None
    entra_department: Optional[str] = None

    # ldap
    ldap_dn: Optional[str] = None
    ldap_uid: Optional[str] = None
    ldap_email: Optional[str] = None
    ldap_display_name: Optional[str] = None
    ldap_job_title: Optional[str] = None
    ldap_department: Optional[str] = None

    @model_validator(mode="after")
    def check_fields(self):
        if self.user_type == "local" and not self.local_user_id:
            raise ValueError("local_user_id est requis pour user_type='local'")
        if self.user_type == "entra" and not self.entra_oid:
            raise ValueError("entra_oid est requis pour user_type='entra'")
        if self.user_type == "ldap" and not self.ldap_dn:
            raise ValueError("ldap_dn est requis pour user_type='ldap'")
        return self


class CIKeyUserPatch(BaseModel):
    role: Optional[Literal["key_user", "owner", "referent", "local_admin"]] = None
    notes: Optional[str] = None


class CIKeyUserOut(BaseModel):
    """Schéma de sortie aplati — display_name / email calculés côté serveur."""
    id: uuid.UUID
    ci_id: uuid.UUID
    user_type: str
    source_id: str          # local_user_id ou entra_oid
    display_name: str
    email: str
    job_title: Optional[str]
    department: Optional[str]
    role: str
    notes: Optional[str]
    created_at: datetime


class UserSearchResult(BaseModel):
    source: Literal["local", "entra", "ldap"]
    source_id: str          # user.id (str), entra OID ou ldap DN
    display_name: str
    email: str
    job_title: Optional[str] = None
    department: Optional[str] = None
    # LDAP uniquement
    ldap_uid: Optional[str] = None


class CIKeyUserGlobalOut(BaseModel):
    """Vue transversale — référent + infos du CI associé."""
    id: uuid.UUID
    ci_id: uuid.UUID
    ci_name: str
    ci_type: str
    ci_criticality: str
    user_type: str
    source_id: str
    display_name: str
    email: str
    job_title: Optional[str]
    department: Optional[str]
    role: str
    notes: Optional[str]
    created_at: datetime


class KeyUsersPage(BaseModel):
    total: int
    items: list[CIKeyUserGlobalOut]
