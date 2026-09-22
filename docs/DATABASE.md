# Modèle de Données — Capybara CMDB (multi-SGBD, PostgreSQL 16 par défaut)

**Voir aussi :** [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
**Volumétrie cible :** 5 000–50 000 CI, ~400 utilisateurs, historique CVE filtré par parc.
**SGBD supportés :** PostgreSQL 16 (défaut), MariaDB 10.11+, MySQL 8.0+, SQL Server 2019+ — voir §6.

Conventions : snake_case pluriel, PK `UUID`, `created_at`/`updated_at` `TIMESTAMPTZ` partout,
soft delete (`deleted_at`) sur les CI, contraintes `CHECK` pour les énumérations,
index sur toutes les FK. Migrations Alembic avec `downgrade()` systématique.

> ⚠️ Le DDL ci-dessous est donné en **dialecte PostgreSQL pour la lisibilité** ; la définition
> de référence est le modèle SQLAlchemy, qui rend ce schéma sur les 4 SGBD selon les règles du §6.

---

## 1. Vue d'ensemble des entités

```
users ──< user_roles >── roles ──< role_group_mappings (groupes AD/EntraID)
users ──< api_tokens

cis (cœur) ──1:1── hardware_details
    │      ──1:1── software_details ──> cves (via ci_cves)
    │──< ci_relations >── cis (relations typées)
    │──> slas
    │──< maintenance_schedules ──< maintenance_logs
    │──< ci_cves

alerts (unifiées : CVE, échéances, maintenance, MAJ app)
webhooks ──< webhook_deliveries
connectors (GLPI…) | settings (thème/branding) | audit_log
```

**Choix structurant :** table `cis` pour le tronc commun + tables de détail 1-1
(`hardware_details`, `software_details`). Les dates pilotant l'alerting (garantie, licence, EOL)
sont des **colonnes réelles indexées**, jamais du JSONB ; le JSONB (`attributes`) ne porte que
les attributs libres par type de CI.

---

## 2. DDL de référence (extraits structurants)

### Identité & accès

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    auth_source     TEXT NOT NULL DEFAULT 'local'
                    CHECK (auth_source IN ('local','ldap','oidc')),
    external_id     TEXT,                  -- objectGUID AD / sub OIDC
    hashed_password TEXT,                  -- Argon2id, NULL si ldap/oidc
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    last_active_at  TIMESTAMPTZ,               -- mis à jour par heartbeat (60 s) → indicateur présence
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_external ON users(auth_source, external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,      -- admin, it-infra, it-application, viewer…
    name        TEXT NOT NULL,
    is_builtin  BOOLEAN NOT NULL DEFAULT false,
    permissions JSONB NOT NULL DEFAULT '{}',  -- {"ci:hardware": "write", "ci:software": "read", …}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- mapping groupe annuaire → rôle applicatif (appliqué au login)
CREATE TABLE role_group_mappings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    source     TEXT NOT NULL CHECK (source IN ('ldap','oidc')),
    group_name TEXT NOT NULL,              -- DN LDAP ou claim de groupe OIDC
    UNIQUE (source, group_name, role_id)
);

CREATE TABLE api_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,     -- SHA-256 du token, jamais en clair
    scopes       TEXT[] NOT NULL DEFAULT '{read}',  -- read / write
    created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Cœur CMDB

```sql
CREATE TABLE cis (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ci_type      TEXT NOT NULL CHECK (ci_type IN ('hardware','software')),
    name         TEXT NOT NULL CHECK (char_length(name) > 0),
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'in_service'
                 CHECK (status IN ('ordered','in_stock','in_service','maintenance','retired')),
    criticality  TEXT NOT NULL DEFAULT 'medium'
                 CHECK (criticality IN ('low','medium','high','critical')),
    owner_id     UUID REFERENCES users(id) ON DELETE SET NULL,  -- responsable / affectation
    team         TEXT,                     -- métier responsable (infra, application…)
    location     TEXT,
    sla_id       UUID REFERENCES slas(id) ON DELETE SET NULL,
    attributes   JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_cis_type_status ON cis(ci_type, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_cis_owner ON cis(owner_id);
CREATE INDEX idx_cis_sla ON cis(sla_id);
-- recherche globale (nom + description), pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_cis_name_trgm ON cis USING GIN (name gin_trgm_ops);
CREATE INDEX idx_cis_attributes ON cis USING GIN (attributes);

CREATE TABLE hardware_details (
    ci_id             UUID PRIMARY KEY REFERENCES cis(id) ON DELETE CASCADE,
    manufacturer      TEXT,
    model             TEXT,
    serial_number     TEXT,
    purchase_date     DATE,
    warranty_end_date DATE,                -- pilote l'alerting J-90/J-30
    supplier          TEXT,
    purchase_price    NUMERIC(12,2)
);
CREATE INDEX idx_hw_warranty ON hardware_details(warranty_end_date)
    WHERE warranty_end_date IS NOT NULL;
CREATE UNIQUE INDEX idx_hw_serial ON hardware_details(serial_number)
    WHERE serial_number IS NOT NULL;

CREATE TABLE software_details (
    ci_id            UUID PRIMARY KEY REFERENCES cis(id) ON DELETE CASCADE,
    vendor           TEXT,
    product          TEXT NOT NULL,
    version          TEXT,
    cpe_name         TEXT,                 -- CPE 2.3 pour le matching CVE (ADR-005)
    is_internal      BOOLEAN NOT NULL DEFAULT false,  -- logiciel métier interne
    license_type     TEXT,                 -- perpétuelle, abonnement, OSS…
    license_end_date DATE,                 -- pilote l'alerting
    eol_date         DATE,                 -- fin de support éditeur, pilote l'alerting
    install_count    INTEGER
);
CREATE INDEX idx_sw_license_end ON software_details(license_end_date)
    WHERE license_end_date IS NOT NULL;
CREATE INDEX idx_sw_eol ON software_details(eol_date) WHERE eol_date IS NOT NULL;
CREATE INDEX idx_sw_cpe ON software_details(cpe_name) WHERE cpe_name IS NOT NULL;

CREATE TABLE ci_relations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ci_id  UUID NOT NULL REFERENCES cis(id) ON DELETE CASCADE,
    target_ci_id  UUID NOT NULL REFERENCES cis(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL
                  CHECK (relation_type IN ('hosted_on','depends_on','assigned_to','connected_to')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_ci_id, target_ci_id, relation_type),
    CHECK (source_ci_id <> target_ci_id)
);
CREATE INDEX idx_ci_relations_target ON ci_relations(target_ci_id);
```

### Cycle de vie : SLA & maintenances

```sql
CREATE TABLE slas (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    level             TEXT,                -- Gold/Silver/Bronze ou libre
    contract_ref      TEXT,
    provider          TEXT,
    support_contact   TEXT,                -- qui appeler
    response_time     TEXT,                -- engagement (ex: 4h ouvrées)
    contract_end_date DATE,                -- pilote l'alerting
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slas_end ON slas(contract_end_date) WHERE contract_end_date IS NOT NULL;

CREATE TABLE maintenance_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ci_id           UUID NOT NULL REFERENCES cis(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'maintenance'
                    CHECK (kind IN ('maintenance','update','patch','audit')),
    rrule           TEXT,                  -- récurrence RFC 5545 (FREQ=MONTHLY;…), NULL si ponctuel
    next_due_date   DATE NOT NULL,         -- recalculée par le worker après exécution
    remind_days     INTEGER[] NOT NULL DEFAULT '{30,7}',  -- rappels J-30, J-7
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_due ON maintenance_schedules(next_due_date) WHERE is_active;
CREATE INDEX idx_maint_ci ON maintenance_schedules(ci_id);

CREATE TABLE maintenance_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id  UUID REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    ci_id        UUID NOT NULL REFERENCES cis(id) ON DELETE CASCADE,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes        TEXT
);
CREATE INDEX idx_maint_logs_ci ON maintenance_logs(ci_id, performed_at DESC);
```

### Vulnérabilités (NVD / CISA KEV)

```sql
CREATE TABLE cves (
    id             TEXT PRIMARY KEY,       -- 'CVE-2026-12345' (ID naturel, pas d'UUID ici)
    summary        TEXT,
    cvss_score     NUMERIC(3,1),
    cvss_severity  TEXT CHECK (cvss_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    is_kev         BOOLEAN NOT NULL DEFAULT false,   -- présent au catalogue CISA KEV
    published_at   TIMESTAMPTZ,
    modified_at    TIMESTAMPTZ,            -- curseur de sync incrémentale NVD
    source_url     TEXT,
    raw            JSONB NOT NULL DEFAULT '{}',
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cves_severity ON cves(cvss_severity, published_at DESC);

CREATE TABLE ci_cves (
    ci_id      UUID NOT NULL REFERENCES cis(id) ON DELETE CASCADE,
    cve_id     TEXT NOT NULL REFERENCES cves(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status     TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','acknowledged','mitigated','not_affected')),
    PRIMARY KEY (ci_id, cve_id)
);
CREATE INDEX idx_ci_cves_cve ON ci_cves(cve_id);
CREATE INDEX idx_ci_cves_open ON ci_cves(status) WHERE status = 'open';
```

### Alertes, webhooks, intégrations, paramétrage

```sql
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        TEXT NOT NULL CHECK (kind IN
                ('cve_match','warranty_expiry','license_expiry','eol',
                 'sla_expiry','maintenance_due','app_update')),
    severity    TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info','warning','critical')),
    title       TEXT NOT NULL,
    body        TEXT,
    ci_id       UUID REFERENCES cis(id) ON DELETE CASCADE,
    cve_id      TEXT REFERENCES cves(id) ON DELETE CASCADE,
    dedup_key   TEXT NOT NULL UNIQUE,      -- évite les alertes en double (ex: 'warranty:ci_uuid:2026-09-01')
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_active ON alerts(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_alerts_ci ON alerts(ci_id);

CREATE TABLE webhooks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    url          TEXT NOT NULL,
    format       TEXT NOT NULL DEFAULT 'generic'
                 CHECK (format IN ('generic','slack','teams')),
    secret       TEXT,                     -- signature HMAC du payload
    alert_kinds  TEXT[] NOT NULL DEFAULT '{}',  -- vide = tous
    min_severity TEXT NOT NULL DEFAULT 'info',
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id  UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    alert_id    UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    status_code INTEGER,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    delivered_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliveries_pending ON webhook_deliveries(webhook_id)
    WHERE delivered_at IS NULL;

CREATE TABLE connectors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        TEXT NOT NULL CHECK (kind IN ('glpi')),  -- extensible par migration
    name        TEXT NOT NULL,
    config      JSONB NOT NULL DEFAULT '{}',   -- URL, tokens chiffrés applicativement (Fernet)
    is_active   BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    last_status TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
    key        TEXT PRIMARY KEY,           -- 'branding.logo', 'theme.primary_color',
    value      JSONB NOT NULL,             -- 'alerts.warranty_days' = [90,30], etc.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name  TEXT NOT NULL,
    record_id   TEXT NOT NULL,
    action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_values  JSONB,
    new_values  JSONB,
    user_id     UUID,
    user_ip     INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_record ON audit_log(table_name, record_id, created_at DESC);
```

### Backup & Restauration

```sql
CREATE TABLE backup_jobs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    schedule         TEXT NOT NULL DEFAULT 'manual',   -- manual | daily | weekly | monthly
    schedule_hour    INTEGER DEFAULT 2,                -- 0-23 (heure Paris)
    schedule_minute  INTEGER DEFAULT 0,                -- 0-59 (minute Paris) — ajouté 2026-06-18
    schedule_weekday  INTEGER,                         -- 0=lundi … 6=dimanche (weekly)
    schedule_monthday INTEGER,                         -- 1-31 (monthly, ramené au dernier jour si > nb jours)
    retention_count  INTEGER NOT NULL DEFAULT 7,
    include_uploads  BOOLEAN NOT NULL DEFAULT true,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    last_run_at      TIMESTAMPTZ,
    -- Destination distante optionnelle (SFTP ou SMB)
    remote_enabled   BOOLEAN NOT NULL DEFAULT false,
    remote_type      TEXT,        -- sftp | smb
    remote_host      TEXT,
    remote_port      INTEGER,
    remote_user      TEXT,
    remote_password  TEXT,        -- en clair (on-premise) ; à chiffrer avec Fernet si besoin
    remote_path      TEXT,
    remote_ssh_key   TEXT,        -- clé privée PEM complète (RSA/Ed25519)
    remote_smb_share TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE backup_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'running',  -- running | success | error
    filename    TEXT,        -- nom court ex. cmdb_backup_20260618_220000.tar.gz
    size_bytes  INTEGER,
    error_msg   TEXT,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX idx_backup_runs_job ON backup_runs(job_id, started_at DESC);

CREATE TABLE restore_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL DEFAULT 'local',   -- local | upload | sftp | smb
    source_ref  TEXT,
    run_id      UUID REFERENCES backup_runs(id) ON DELETE SET NULL,  -- SET NULL si le run est purgé
    status      TEXT NOT NULL DEFAULT 'success',
    error_msg   TEXT,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
```

> **Planification :** Celery beat exécute `run_scheduled_backups` chaque minute
> (`crontab(minute="*")`, aligné à l'horloge). La fonction `job_due()` compare
> `now().hour == schedule_hour AND now().minute == schedule_minute` (heure Paris)
> avant de lancer le backup — le check est léger (requête DB uniquement).
> Un intervalle fixe (3600 s) avait été utilisé initialement mais causait un décalage
> selon l'heure de démarrage du worker ; remplacé par crontab le 2026-06-18.

---

## 3. Notes de conception

- **Dates d'échéance = colonnes réelles indexées.** Le worker quotidien fait une requête unique
  par type d'échéance (`warranty_end_date <= today + interval '90 days'`, idem licence/EOL/SLA/
  maintenance) et insère dans `alerts` avec `dedup_key` pour l'idempotence.
- **`cves.id` en clé naturelle** (l'identifiant CVE est mondial et immuable) — exception assumée
  à la règle UUID.
- **`rrule` RFC 5545** pour les récurrences de maintenance : standard, librairie `dateutil.rrule`
  côté Python, et `next_due_date` matérialisée pour rester requêtable en SQL.
- **Secrets connecteurs** (tokens GLPI) chiffrés applicativement (Fernet, clé dans `.env`),
  jamais en clair dans `config`.
- **Volumétrie** : 50 k CI + CVE filtrées par CPE du parc → quelques centaines de milliers de
  lignes max ; aucun partitionnement nécessaire. `audit_log` purgeable par rétention configurable.

## 4. Rôles PostgreSQL (moindre privilège)

| Rôle | Droits | Usage |
|------|--------|-------|
| `cmdb_app` | SELECT/INSERT/UPDATE/DELETE | conteneurs `api` et `worker` |
| `cmdb_migrate` | DDL | migrations Alembic au déploiement |
| `cmdb_readonly` | SELECT | reporting / debug |

## 6. Portabilité multi-SGBD (PostgreSQL / MariaDB / MySQL / MSSQL)

Le SGBD est choisi uniquement par `DATABASE_URL`. Règles de portabilité appliquées au modèle
SQLAlchemy (aucune n'exige de changer le code applicatif) :

| Besoin | PG-only (interdit dans le socle) | Solution portable retenue |
|--------|----------------------------------|---------------------------|
| PK UUID | `UUID DEFAULT gen_random_uuid()` | type SQLAlchemy `Uuid` (UUID natif PG, `CHAR(36)` MySQL/MariaDB, `UNIQUEIDENTIFIER` MSSQL) + **génération côté application** (`uuid4()`), jamais de default serveur |
| Attributs flexibles | `JSONB` + index GIN | type SQLAlchemy `JSON` (JSONB sur PG via variant, `JSON` MySQL/MariaDB, `NVARCHAR(MAX)` MSSQL) ; pas de requête indexée sur le JSON dans le socle |
| Listes (`scopes`, `remind_days`, `alert_kinds`) | `TEXT[]` / `INTEGER[]` | colonne `JSON` contenant une liste |
| Dates/heures | `TIMESTAMPTZ` | `DateTime(timezone=True)` + **convention UTC applicative** (MySQL/MariaDB n'ont pas de vrai type TZ) |
| Adresse IP audit | `INET` | `VARCHAR(45)` (IPv6 max) |
| Recherche CI | index `pg_trgm` GIN | `LIKE '%…%'` portable sur colonnes indexées ; optimisation pg_trgm appliquée par migration conditionnelle PG uniquement |
| Index partiels (`WHERE deleted_at IS NULL`) | index partiel | index complet portable ; l'unicité e-mail avec soft delete est garantie par une colonne générée `active_marker` ou un contrôle applicatif transactionnel |
| `now()` serveur | `DEFAULT now()` | `server_default=func.now()` (traduit par dialecte) + `onupdate` géré par l'ORM |
| Énumérations | type `ENUM` PG | `VARCHAR` + contrainte `CHECK` (supportée par les 4 moteurs : MySQL ≥ 8.0.16, MariaDB ≥ 10.2) |

**Règles d'implémentation :**
1. **Jamais de SQL brut dialecte-spécifique** dans le code applicatif ; uniquement l'ORM/Core SQLAlchemy.
2. Les migrations Alembic sont écrites portables ; les optimisations spécifiques PG vivent dans
   des blocs `if op.get_bind().dialect.name == 'postgresql':` et ont toujours un comportement
   neutre sur les autres moteurs.
3. Drivers embarqués dans l'image : `psycopg` (PG), `pymysql` (MySQL/MariaDB), `pyodbc` + msodbc18 (MSSQL).
4. **CI en matrice** : la suite de tests d'intégration (Testcontainers) tourne sur les 4 moteurs
   à chaque merge vers `develop` — la portabilité est prouvée en continu, pas déclarée.
5. Le `docker-compose.yml` livre PostgreSQL par défaut ; des overrides
   (`docker-compose.mariadb.yml`, `.mysql.yml`, `.mssql.yml`) permettent de basculer, et un
   environnement existant peut pointer vers un serveur SQL externe via `DATABASE_URL` seule
   (aucun conteneur DB requis).
6. Casse/collation : noms en minuscules partout (évite les pièges de casse MySQL/MSSQL) ;
   collation UTF-8 (`utf8mb4` sur MySQL/MariaDB).

## 7. Backup

- Outil natif : `pg_dump -Fc` (format custom PostgreSQL), restauration via `pg_restore --clean --if-exists --no-owner --no-acl`.
- Archive `tar.gz` : `db.dump` + répertoire `uploads/` + `metadata.json` (version, date, options).
- Rétention configurable par job (défaut 7 archives réussies) ; les archives en erreur ne comptent pas dans la rétention.
- Export distant optionnel après chaque backup local réussi : SFTP (paramiko) ou SMB (smbclient). Un échec distant ne fait pas échouer le backup local.
- **Planification à la minute près** : `schedule_hour` (0-23) + `schedule_minute` (0-59), heure Paris. Le Celery beat passe chaque minute (`crontab(minute="*")`) et déclenche le backup uniquement quand l'heure et la minute correspondent.
- **Test de restore** conseillé mensuellement sur staging — un backup non testé n'est pas un backup.
