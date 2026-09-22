"""
Configuration centralisée — chargée depuis les variables d'environnement (.env).
Toutes les valeurs ont des defaults "dev-safe" sauf secret_key et admin_password
qui sont obligatoires. Instancié une seule fois via get_settings() mis en cache.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    app_name: str = "CMDB"
    version: str = "2.1.0"
    environment: str = "prod"
    domain: str = "cmdb.example.com"

    # Base de données
    database_url: str = "postgresql+psycopg://cmdb:changeme@db/cmdb"

    # Redis
    redis_url: str = "redis://:changeme@redis:6379/0"

    # Sécurité
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # Admin local (break-glass)
    admin_email: str = "admin@example.com"
    admin_password: str

    # LDAP (optionnel)
    ldap_url: str = ""
    ldap_bind_dn: str = ""
    ldap_bind_password: str = ""
    ldap_base_dn: str = ""
    ldap_user_filter: str = "(sAMAccountName={username})"
    ldap_group_base_dn: str = ""
    ldap_tls: bool = True

    # OIDC (optionnel)
    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""

    # NVD (optionnel — sans clé : 5 req/30 s, avec clé : 50 req/30 s)
    nvd_api_key: str = ""

    # GLPI (optionnel)
    glpi_url: str = ""           # ex: https://glpi.example.com
    glpi_app_token: str = ""     # Setup > Générale > API
    glpi_user_token: str = ""    # Profil utilisateur > API (stateless)
    glpi_username: str = ""      # fallback si user_token absent
    glpi_password: str = ""

    # SMTP (optionnel)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "cmdb@example.com"

    @computed_field
    @property
    def ldap_enabled(self) -> bool:
        return bool(self.ldap_url and self.ldap_base_dn)

    @computed_field
    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_issuer and self.oidc_client_id)

    @computed_field
    @property
    def smtp_enabled(self) -> bool:
        return bool(self.smtp_host)

    @computed_field
    @property
    def debug(self) -> bool:
        return self.environment == "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
