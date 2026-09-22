"""Schémas Pydantic auth : entrées (UserCreate, PasswordChange) et sorties (UserOut, LoginResponse)."""
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    totp_required: bool = False
    partial_token: Optional[str] = None


class RoleOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    is_builtin: bool = False
    permissions: dict = {}

    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    auth_source: str
    is_active: bool
    is_locked: bool = False
    last_login_at: Optional[datetime]
    last_active_at: Optional[datetime] = None
    notify_critical_alerts: bool = True
    totp_enabled: bool = False
    updated_at: Optional[datetime] = None
    # Champ intermédiaire : lu depuis l'ORM, exclu de la réponse JSON
    avatar_data: Optional[str] = Field(default=None, exclude=True)
    has_avatar: bool = False
    personal_primary_color: Optional[str] = None
    personal_sidebar_color: Optional[str] = None
    roles: list[RoleOut] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_has_avatar(self) -> "UserOut":
        self.has_avatar = bool(self.avatar_data)
        return self


class TotpSetupOut(BaseModel):
    secret: str
    uri: str


class TotpEnableIn(BaseModel):
    code: str


class TotpDisableIn(BaseModel):
    code: str


class TotpVerifyIn(BaseModel):
    partial_token: str
    code: str


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role_slugs: list[str] = ["viewer"]

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Le mot de passe doit contenir au moins 10 caractères")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_locked: Optional[bool] = None
    role_slugs: Optional[list[str]] = None


class AdminPasswordReset(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Le mot de passe doit contenir au moins 10 caractères")
        return v


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    notify_critical_alerts: Optional[bool] = None
    personal_primary_color: Optional[str] = None
    personal_sidebar_color: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Le mot de passe doit contenir au moins 10 caractères")
        return v


class ApiTokenCreate(BaseModel):
    name: str
    scopes: list[str] = ["read"]
    expires_at: Optional[datetime] = None


class ApiTokenOut(BaseModel):
    id: uuid.UUID
    name: str
    scopes: list[str]
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiTokenCreated(ApiTokenOut):
    token: str  # retourné une seule fois à la création


class ApiTokenAdminOut(ApiTokenOut):
    created_by_name: str | None = None
