# Architecture — Capybara CMDB

**Voir aussi :** [`docs/DATABASE.md`](DATABASE.md) (modèle de données), [`docs/UIUX.md`](UIUX.md) (design system).

---

## 1. Vue d'Ensemble

Monolithe modulaire conteneurisé — adapté à une équipe réduite, déployable derrière Traefik
(ou tout autre reverse proxy) via un réseau Docker externe.

```
                    [Traefik — réseau externe]  ← TLS, https://cmdb.example.com
                                   |
              +--------------------+--------------------+
              |                                         |
        [Frontend React]                          [API FastAPI]
        (servi statique                         (port interne 8000)
         par l'API)                                     |
                                        LDAP(S) / OIDC / SAML
        +----------+----------+----------+-------------+--------+
        |          |          |          |             |        |
  [PostgreSQL]  [Redis]  [Worker]  [AD on-prem]  [EntraID]  [SAML IdP]
     données     cache    Celery     LDAP(S)      Graph API
                 queue    + beat                  M365 Graph
                            |
         [NVD API] [CISA KEV] [OSV API] [GLPI API] [SSH targets] [SMTP] [Agent endpoints]
```

**4 conteneurs Docker Compose :** `api` (FastAPI, sert aussi le front buildé), `db` (PostgreSQL),
`redis`, `worker` (Celery + beat). Autonome, sans dépendance cloud obligatoire.

**Édition unique, gratuite** — déploiement README minimal en < 30 min.

---

## 2. Décisions Architecturales (ADR)

### ADR-001 : Backend FastAPI (Python 3.12)
- **Status :** Accepted ✅
- **Context :** API REST complète exigée avec doc auto, validation forte, tâches async.
- **Decision :** FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic. OpenAPI/Swagger auto-exposé (`/api/docs`).

### ADR-002 : Base relationnelle, PostgreSQL 16 par défaut, portable multi-SGBD
- **Status :** Accepted ✅
- **Decision :** Schéma via SQLAlchemy 2.0 + Alembic exclusivement. SGBD choisi par `DATABASE_URL`
  (`postgresql+psycopg://…`, `mysql+pymysql://…`, `mariadb+pymysql://…`, `mssql+pyodbc://…`).
  PostgreSQL 16 dans le compose par défaut.

### ADR-003 : Authentification native LDAP + OIDC + SAML (configurable via UI)
- **Status :** Accepted ✅ *(étendu v2.0 : SAML ajouté, config en DB)*
- **Decision :** Application parle directement LDAP(S) (ldap3), OIDC (authlib), SAML 2.0.
  La configuration de chaque source d'authentification est stockée en DB (table `connectors`)
  et modifiable depuis l'admin — pas seulement via `.env`.

### ADR-004 : Worker Celery + Redis
- **Status :** Accepted ✅
- **Decision :** Celery (worker) + Celery Beat (planification) avec Redis comme broker.
  Tâches : veille CVE, échéances J-90/J-30, webhooks, sync GLPI, check MAJ, sync M365,
  rapports planifiés, SSH discovery, agents natifs, sync EOL (endoflife.date).

### ADR-005 : Matching CVE par CPE (NVD) + normalisation produit + endoflife.date
- **Status :** Accepted ✅ *(étendu v2.0 : source EOL automatique ajoutée)*
- **Decision :** CPE 2.3 sur chaque CI Software + API endoflife.date pour pre-remplir `eol_date`.

### ADR-006 : Connecteurs d'intégration sous forme de plugins internes
- **Status :** Accepted ✅
- **Decision :** Interface `TicketingConnector` (Python ABC). Implémentations : `GLPIConnector`,
  extensible (ServiceNow, Jira SM…). Config en DB (`connectors.config` JSON chiffré Fernet).
- **Périmètre v2.1 :** Les connecteurs de **découverte de bases de données** (PostgreSQL, MySQL,
  MSSQL, Oracle, MongoDB) ont été retirés. Les instances DB sont créées manuellement comme CIs
  dans le parc — la découverte automatique est couverte par les outils de monitoring existants
  (Zabbix, Grafana, PRTG…) déjà intégrés via le Monitoring Hub.

### ADR-007 : Frontend React 18 + TypeScript + Tailwind + shadcn/ui, servi par l'API
- **Status :** Accepted ✅
- **Decision :** SPA React (Vite, TanStack Query/Table, React Hook Form + Zod), buildée et servie
  en statique par le conteneur `api`. Thème via variables CSS runtime (modifiables sans rebuild).

### ADR-008 : Notification de mise à jour de l'application
- **Status :** Accepted ✅
- **Decision :** Tâche Celery quotidienne comparant la version locale à un manifeste distant.
  Notification in-app + RSS + webhook. Aucune auto-mise à jour.

### ADR-009 : Alertes unifiées → RSS + Webhooks + Email
- **Status :** Accepted ✅
- **Decision :** Table `alerts` unique, diffusion RSS, webhooks (Slack/Teams/générique), email SMTP.

### ADR-011 : Agents natifs + SSH Discovery
- **Status :** Accepted ✅
- **Decision :** Endpoint `POST /api/agent/report` avec token agent dédié (pas JWT utilisateur).
  Scripts Bash/PowerShell pour Linux/Windows/macOS dans `agent/`/`agents/`. SSH Discovery via
  worker Celery (agentless, credentials stockées en DB chiffrées).

### ADR-013 : Backup natif — pg_dump format custom + tar.gz + export distant *(ajout v2.1)*
- **Status :** Accepted ✅
- **Context :** Le backup était documenté (scripts manuels) mais non intégré à l'UI.
  Risque opérationnel pour les équipes sans compétences Linux.
- **Decision :**
  - Format `pg_dump -Fc` (format custom PostgreSQL) : plus compact que SQL plain,
    restaurable avec `pg_restore --clean --if-exists --no-owner --no-acl`.
  - Archive `tar.gz` : `db.dump` + `uploads/` + `metadata.json` (version, date, options).
  - Le mot de passe PostgreSQL est passé via la variable d'environnement `PGPASSWORD`,
    jamais en argument de ligne de commande (visible dans `ps aux`).
  - `pg_restore` retourne exit 1 même pour des avertissements mineurs (ex. `transaction_timeout`
    non reconnu par pg16 alors que le dump vient de pg17) — exit 1 est donc accepté comme succès.
  - Le dossier `/app/uploads` est un volume Docker monté : impossible de `rmtree()` le point
    de montage. La restauration vide le contenu item par item, puis copie la sauvegarde.
  - Exécution background FastAPI (`BackgroundTasks`) pour ne pas bloquer la requête HTTP.
  - Export distant optionnel après chaque backup local réussi : SFTP (paramiko) ou SMB (smbclient).
  - Celery beat déclenche `run_scheduled_backups` **chaque minute** via `crontab(minute="*")`
    (aligné à l'horloge système — contrairement à un intervalle fixe en secondes qui dérive
    selon l'heure de démarrage du worker) ; la fonction `job_due()` vérifie pour chaque job
    actif : (1) l'heure **et la minute** courantes (Paris) correspondent à `schedule_hour` /
    `schedule_minute`, (2) le bon jour est atteint (`schedule_weekday` 0–6 pour hebdo,
    `schedule_monthday` 1–31 pour mensuel — ramené au dernier jour du mois si > nb de jours),
    (3) le job n'a pas déjà tourné dans cette fenêtre (même date pour daily, même semaine ISO +
    jour pour weekly, même mois + jour pour monthly). Le check est léger (requête DB uniquement)
    et ne déclenche un backup que si toutes les conditions sont réunies.
  - La planification est configurable à la minute près (`schedule_hour` 0–23,
    `schedule_minute` 0–59) via l'UI Admin → Sauvegardes (champ `<input type="time">`).
    Antérieurement, seule l'heure entière était configurable (`schedule_hour` uniquement,
    beat toutes les heures non aligné — corrigé en 2026-06-18).
  - Les runs restés en `running` après un arrêt/restore inattendu sont nettoyés automatiquement
    au prochain démarrage de l'API (`_fix_stale_backup_runs` dans `on_startup`).

### ADR-014 : Stratégie d'import — upsert-only, jamais de suppression *(ajout v2.1)*
- **Status :** Accepted ✅
- **Context :** Les imports CSV (CIs, maintenances, utilisateurs LDAP…) pourraient supprimer
  des données existantes si l'on appliquait une logique "le fichier fait foi". Ce comportement
  serait destructeur et non auditable.
- **Decision :**
  - Tout import est un **upsert** : création si l'item n'existe pas, mise à jour sinon.
  - **Aucune suppression** ne peut être déclenchée par un import, quelle que soit la source
    (CSV, connecteur LDAP/EntraID, API tierce).
  - Si un item est **archivé** (`status = archived`) ou **désactivé** (`is_active = false`),
    il est **ignoré silencieusement** lors de l'import — aucune mise à jour n'est appliquée.
    La ligne est comptabilisée dans les statistiques sous `skipped`.
  - La suppression reste une action **exclusivement humaine** : suppression unitaire via l'UI
    ou suppression de masse via sélection filtrée (voir seuils ci-dessous).
  - La clé de correspondance (matching key) par entité :

    | Entité | Clé de correspondance |
    |--------|-----------------------|
    | CI | Nom (`name`, insensible à la casse) |
    | Maintenance | Titre + CI + Date (`title + ci_name + next_due_date`) |
    | Utilisateur | Email (`email`, insensible à la casse) |

### ADR-015 : Corbeille administrative — soft-delete enrichi + restore + purge *(ajout v2.1)*
- **Status :** Accepted ✅
- **Context :** Le soft-delete via `deleted_at` est en place pour CI et User mais ne conserve
  aucune traçabilité (qui, comment, depuis quelle source). Une suppression accidentelle ou
  malveillante est irréversible.
- **Decision :**
  - Enrichissement du soft-delete avec deux colonnes supplémentaires sur les modèles concernés :
    `deleted_by_id` (FK → `users.id`, nullable) et `delete_source` (enum string).
  - Sources de suppression tracées :

    | Valeur `delete_source` | Déclencheur |
    |------------------------|-------------|
    | `ui_single` | Suppression unitaire via bouton UI |
    | `ui_mass` | Suppression de masse via sélection filtrée |
    | `api` | Appel direct à l'API REST (token) |
    | `celery` | Tâche automatisée (ex : purge expirée) |
    | `import` | Réservé — non utilisé (ADR-014 interdit la suppression par import) |

  - **Période de grâce : 30 jours.** Passé ce délai, une tâche Celery Beat
    (`purge_expired_trash`) supprime définitivement (`DELETE` SQL) les items expirés.
  - **Restauration** : endpoint `POST /api/trash/{entity_type}/{id}/restore` remet l'item
    en état actif (`deleted_at = NULL`, `deleted_by_id = NULL`, `delete_source = NULL`).
  - **Purge manuelle** : bouton "Purger" en page Corbeille (admin) — supprime définitivement
    les items sélectionnés ou la totalité, sans attendre l'expiration.
  - Les entités concernées par la corbeille et leur niveau de criticité :

    | Entité | Volume estimé | Priorité corbeille |
    |--------|--------------|-------------------|
    | CI (hardware + software) | 100 → 10 000+ | **Haute** — risque majeur |
    | Utilisateurs | < 500 | **Haute** — données personnelles |
    | Incidents | 10 → 1 000 | Moyenne |
    | Changements (RFC) | 10 → 500 | Moyenne |
    | Alertes | 1 000+ | Faible — rétention dédiée |
    | Connecteurs, SLA, licences | < 100 | Faible — faible volume |

  - Les **alertes** (volume élevé, cycle de vie court) utilisent une rétention dédiée
    distincte de la corbeille générale.

### ADR-016 : Indicateur de présence utilisateur — heartbeat 60 s *(ajout v2.2)*
- **Status :** Accepted ✅
- **Context :** Les admins ne savent pas quels utilisateurs sont actuellement connectés.
- **Decision :**
  - Colonne `last_active_at TIMESTAMPTZ` ajoutée à `users` (migration `a34o5p6q7r8s`).
  - Endpoint `POST /api/users/me/heartbeat` (authentifié) : met à jour `last_active_at = now()`.
    Aucun corps, réponse `204 No Content`.
  - `AuthContext` déclenche un heartbeat immédiat à la connexion, puis toutes les **60 secondes**
    via `setInterval`. L'intervalle est nettoyé à la déconnexion.
  - Un utilisateur est considéré **en ligne** si `now() − last_active_at < 5 min`.
  - L'indicateur est un petit cercle coloré (vert / gris) à gauche du nom dans
    Admin → Utilisateurs. Tooltip "Connecté" / "Hors ligne".
  - `last_active_at` est exposé dans `UserOut` (liste admin uniquement).
  - Ce champ n'est **pas indexé** : la comparaison est faite côté frontend sur la liste
    déjà chargée (< 500 utilisateurs par instance).

### Seuils de sélection pour la suppression de masse

La méthode de sélection s'adapte au volume de données de chaque entité :

| Volume estimé de la liste | Mode de sélection |
|---------------------------|-------------------|
| < 50 items | Cases à cocher individuelles sur la liste |
| 50 – 500 items | Cases individuelles + "Tout sélectionner sur cette page" |
| > 500 items (ex : inventaire CI) | Filtre/recherche obligatoire + "Sélectionner les N résultats du filtre" |

Pour les listes > 500 items, la sélection sans filtre actif est intentionnellement bloquée
afin de prévenir les suppressions accidentelles massives.

---

## 3. Découpage Modulaire du Backend

```
app/
├── core/          # config, sécurité, DB session, logging
├── auth/          # LDAP, OIDC, SAML, JWT sessions, RBAC, tokens API
├── cmdb/          # CI hardware/software, relations, cycle de vie, agents
├── lifecycle/     # échéances, maintenances planifiées, SLA
├── vuln/          # ingestion NVD/CISA, matching CPE, CVE↔CI
├── alerts/        # moteur d'alertes, RSS, webhooks, email
├── itsm/          # incidents, changements (RFC)
├── connectors/    # interface TicketingConnector + GLPIConnector
├── integrations/  # LDAP sync, EntraID/Graph, M365 calendar, SAML
├── agents/        # agent natif endpoint, SSH discovery, scripts
├── backup/        # sauvegarde & restauration (jobs, runs, restore logs, export distant)
├── reports/       # PDF/CSV, jobs planifiés
├── executive/     # dashboard exécutif, score gouvernance, KPIs
├── admin/         # thème/logo, utilisateurs/rôles, tokens
├── docs/          # manuels utilisateur/technique servis par rôle
└── workers/       # tâches Celery (cve_sync, deadlines, glpi_sync, eol_sync,
                   #   m365_sync, ssh_discovery, report_jobs, update_check,
                   #   backup_jobs)
```

---

## 4. Sécurité

- **Sessions UI :** cookie httpOnly + SameSite, session Redis, timeout configurable.
- **API machine :** tokens opaques hashés en base, scopes `read`/`write`, révocables, datés.
- **Agent tokens :** tokens séparés des tokens API utilisateurs, scope `agent:report`.
- **RBAC backend** : `require_perm()` sur tous les routers — jamais confiance au client.
  Rôles : `admin`, `manager`, `user`, `readonly`, `external`.
- **OWASP :** ORM paramétré (injection), React + CSP (XSS), SameSite + CSRF (CSRF),
  rate limiting login, Argon2id (local), audit trail (qui/quoi/quand/IP).
- **Secrets :** `.env` gitignored. Secrets connecteurs : Fernet (clé dans `.env`).

---

## 5. Performance

| Métrique | Cible | Stratégie |
|----------|-------|-----------|
| API p95 | < 300 ms | Index DB (voir /dba), cache Redis sur dashboards |
| Dashboards | < 2 s | Agrégats pré-calculés par worker |
| Listes CI (jusqu'à 50 k) | < 1 s | Pagination keyset, recherche indexée (pg_trgm) |
| Sync NVD | Hors ligne de l'API | Incrémentale, filtrée par CPE du parc |
| Rapports PDF | Async | Report Jobs Celery, téléchargement asynchrone |

---

## 6. Déploiement

### Docker Compose (production)
```yaml
services:
  api:      # FastAPI + front statique — port interne 8000
  worker:   # Celery worker + beat
  db:       # postgres:16-alpine, volume persistant
  redis:    # redis:7-alpine
```

- HTTPS : Traefik (réseau externe, ex. `traefik-public`) — URL d'exemple `https://cmdb.example.com`.
- Overrides SGBD : `docker-compose.mariadb.yml`, `.mysql.yml`, `.mssql.yml`.
- **Backup natif :** Administration → Sauvegardes — jobs planifiés, archive `tar.gz`
  (DB + uploads), rétention auto, export SFTP/SMB, restauration depuis l'UI. Volume `backups`
  partagé entre `api` et `worker` (les deux exécutent pg_dump / pg_restore).
- **Rollback :** images taguées par version (`cmdb:x.y.z`) → `docker compose pull && up -d`.
- **Édition unique, gratuite** : aucune clé de licence requise.

### Environnements
| Env | Usage | Données |
|-----|-------|---------|
| dev | Poste développeur (compose + hot reload) | Fictives |
| staging | UAT, tests intégration GLPI/AD réels | Anonymisées |
| prod | Utilisateurs | Réelles |

---

## 7. Observabilité

- Logs JSON structurés sur stdout (collectables par l'existant).
- `/api/health` — liveness : DB, Redis, dernier run des workers + statut agents.
- Métriques Prometheus exposées (`/api/metrics`) — Grafana optionnel post-release.
- Statut dernière sync CVE/EOL/LDAP visible dans l'admin.

---

## 8. Notifications & Email

### Configuration SMTP

La CMDB utilise une **double source de configuration** par ordre de priorité :

1. **Connecteur SMTP activé en base** (Admin → Connecteurs → SMTP — Email) : stocké chiffré
   (Fernet), éditable depuis l'UI sans redémarrage. C'est la méthode recommandée en production.
2. **Fallback `.env`** : variables `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM`
   — utilisées uniquement si aucun connecteur SMTP n'est activé en base.

Le module `app/notifications/email.py` lit la source active à chaque envoi via `_get_smtp_config()`.
Deux modes TLS sont supportés : **SSL direct** sur le port 465, et **STARTTLS** sur 587 (ou autre).

---

### Déclencheurs d'envoi

#### Temps réel — actions utilisateur

| Événement | Destinataire(s) |
|-----------|----------------|
| RFC soumise (statut → `pending`) | Approbateur désigné |
| RFC approuvée ou rejetée | Demandeur |
| RFC terminée (statut → `done`) | Demandeur |
| Incident déclaré | Administrateurs |
| Alerte critique créée | Admins avec `notify_critical_alerts = true` |
| SLA expirant dans ≤ 30 j | Administrateurs |
| Licence expirant dans ≤ 30 j | Administrateurs |
| Garantie matériel expirant | Administrateurs |
| Leasing expirant | Administrateurs |
| Nouvelles CVE critiques (CVSS ≥ 9.0) après sync NVD | Administrateurs |
| Erreur de synchronisation connecteur | Administrateurs |
| Rapport PDF généré avec option « envoyer par email » | Utilisateur demandeur |

#### Planifié — Celery Beat

| Tâche | Fréquence | Description |
|-------|-----------|-------------|
| `send_critical_alert_emails` | Toutes les heures | Alertes critiques ouvertes non acquittées → email groupé à tous les admins |
| `notify_weekly_digest` | Lundi 8h00 | Résumé hebdomadaire : total CIs, alertes critiques, incidents ouverts, CVE critiques, SLA/licences expirant dans 30 j |

---

### Préférences utilisateur

Chaque compte dispose d'un flag `notify_critical_alerts` (activé par défaut).
Désactivé : l'utilisateur est exclu des envois d'alertes critiques horaires.
Réglable dans Profil → Notifications ou via l'API `PATCH /api/users/me`.

---

### Email de test

Admin → Notifications → **Tester la notification** : envoie un email de test vers
l'adresse choisie pour valider la config SMTP sans attendre un événement réel.

---

### Gestion des destinataires par règle

Chaque règle de notification expose un panneau **Destinataires** avec deux modes d'ajout :

#### 1. Saisie libre
Champ `type="email"` pour entrer n'importe quelle adresse — utile pour les groupes de
messagerie (listes de diffusion, alias partagés type `equipe-ops@entreprise.com`).

#### 2. Sélecteur annuaire
Bouton **Choisir depuis l'annuaire** (icône `Users`) : ouvre un dropdown de recherche qui
interroge `GET /api/users` (cache TanStack Query 5 min). La liste inclut **tous les
utilisateurs synchronisés**, quelle que soit leur source d'authentification.

Chaque résultat affiche nom complet + email + badge de source :

| Source (`auth_source`) | Badge | Couleur |
|------------------------|-------|---------|
| `ldap` | LDAP | Bleu |
| `entra` | EntraID | Cyan (sky) |
| `oidc` | OIDC | Violet |
| `local` | Local | Gris (muted) |

**Comportement :**
- La recherche filtre sur nom complet **ou** adresse email dès le premier caractère.
- Les utilisateurs dont l'email est déjà dans la liste des destinataires sont exclus des résultats.
- Un clic sur un résultat appelle immédiatement `PATCH /api/notification-rules/{id}` avec la liste
  mise à jour et ferme le dropdown.
- Le dropdown se referme automatiquement sur clic hors zone (`mousedown` listener).

Aucun endpoint backend spécifique n'a été ajouté : le sélecteur réutilise `GET /api/users`
existant. Les utilisateurs LDAP/EntraID/OIDC sont présents dans la table `users` grâce
à la synchronisation des connecteurs annuaire.

---

### Module `app/notifications/email.py` — fonctions principales

| Fonction | Usage |
|----------|-------|
| `send_email(to, subject, html_body)` | Envoi générique |
| `send_email_with_attachment(...)` | Rapport PDF en pièce jointe |
| `notify_rfc_submitted / _decision / _completed` | Cycle de vie RFC |
| `notify_critical_alert` | Alerte critique |
| `notify_incident_event` | Incident déclaré |
| `notify_sla_expiring` | SLA < 30 j |
| `notify_license_expiring` | Licence < 30 j |
| `notify_warranty_expiring` | Garantie < 30 j |
| `notify_leasing_expiring` | Leasing < 30 j |
| `notify_cve_critical_new` | Nouvelles CVE CVSS ≥ 9 |
| `notify_connector_sync_error` | Erreur sync connecteur |
| `notify_weekly_digest` | Digest hebdomadaire |

Tous les envois sont silencieux si aucun SMTP n'est configuré (log `WARNING` uniquement,
aucune exception propagée vers l'API).

---

## 9. Stratégie d'import & Corbeille

### 9.1 Règles d'import (toutes sources)

Tout mécanisme d'import dans la CMDB (CSV manuel, connecteur LDAP/EntraID, API tierce)
applique la même politique :

```
Pour chaque ligne / item entrant :
  1. Recherche de correspondance via la clé définie (nom, email…)
  2. Si trouvé ET actif       → mise à jour des champs fournis (upsert)
  3. Si trouvé ET archivé/désactivé → ignoré (comptabilisé dans `skipped`)
  4. Si non trouvé            → création
  5. Jamais de suppression    → action humaine exclusive
```

**Comportement des champs lors d'un update par import** : si un champ du CSV est vide ou
absent, la valeur existante en base est conservée (pas d'écrasement par `NULL`).

**Rapport d'import** retourné à l'utilisateur :

| Compteur | Description |
|----------|-------------|
| `created` | Nouveaux items créés |
| `updated` | Items existants mis à jour |
| `skipped` | Items ignorés (archivé ou désactivé) |
| `errors`  | Lignes en erreur avec détail (ligne, message) |

---

### 9.2 Corbeille administrative

#### Modèle de données

Les entités supportant la corbeille disposent de trois colonnes supplémentaires :

```sql
deleted_at       TIMESTAMPTZ     -- NULL = actif ; non-NULL = en corbeille
deleted_by_id    UUID REFERENCES users(id)   -- auteur de la suppression
delete_source    VARCHAR(20)     -- 'ui_single' | 'ui_mass' | 'api' | 'celery'
```

#### Cycle de vie d'un item supprimé

```
Action suppression
      │
      ▼
  deleted_at = NOW()
  deleted_by_id = user.id
  delete_source = source
      │
      ├─ Restauration (admin) ──► deleted_at = NULL  (retour état actif)
      │
      └─ Après 30 jours
            │
            ├─ Auto : tâche Celery `purge_expired_trash` (quotidienne)
            └─ Manuel : bouton "Purger" en page Corbeille (admin)
                        ──► DELETE SQL définitif
```

#### Page Corbeille (Admin)

Accessible depuis **Administration > Corbeille**, visible uniquement par le rôle `admin`.

Fonctionnalités :

| Action | Description |
|--------|-------------|
| **Filtrer** | Par type d'entité, auteur, date, source de suppression |
| **Restaurer** | Remet l'item à son emplacement d'origine (état actif) |
| **Purger la sélection** | Suppression définitive immédiate des items sélectionnés |
| **Tout purger** | Vide intégralement la corbeille (confirmation requise) |
| **Export CSV** | Journal d'audit exportable des suppressions |

Colonnes affichées : type d'entité · nom · supprimé le · supprimé par · source · expire le.

#### Sélection de masse pour la suppression

| Volume de la liste | Mode activé |
|--------------------|-------------|
| < 50 items | Cases à cocher individuelles |
| 50 – 500 items | Cases + "Tout sélectionner cette page" |
| > 500 items | Filtre obligatoire + "Sélectionner les N résultats" |

Pour les listes > 500 items, toute action de masse sans filtre actif est bloquée par l'UI.

#### Tâche Celery `purge_expired_trash`

- Fréquence : quotidienne (00h00 UTC)
- Sélectionne tous les items avec `deleted_at < NOW() - INTERVAL '30 days'`
- Effectue un `DELETE` SQL définitif par entité concernée
- Trace chaque purge dans les logs applicatifs (`INFO`) avec le nombre d'items supprimés

#### Entités concernées

| Entité | Table(s) | Colonnes ajoutées | Implémentation |
|--------|----------|-------------------|----------------|
| CI | `cis` | `deleted_by_id`, `delete_source` | `deleted_at` ✅ existant |
| Utilisateurs | `users` | `deleted_by_id`, `delete_source` | `deleted_at` ✅ existant |
| Incidents | `incidents` | `deleted_at`, `deleted_by_id`, `delete_source` | À ajouter |
| Changements (RFC) | `changes` | `deleted_at`, `deleted_by_id`, `delete_source` | À ajouter |
| Alertes | `alerts` | Rétention dédiée (≠ corbeille) | Hors périmètre |

---

## 10. Contribuer

Voir [`CONTRIBUTING.md`](../CONTRIBUTING.md) pour le workflow de développement local, les tests
end-to-end et les conventions de contribution.
