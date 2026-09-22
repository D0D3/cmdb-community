// ── Types ─────────────────────────────────────────────────────────────────────

export type RoleSlug = 'admin' | 'operator' | 'viewer'

export interface DocArticle {
  id:    string
  title: string
  roles: RoleSlug[]   // rôles qui peuvent voir cet article ([] = tous)
  body:  string       // Markdown simplifié
}

export interface DocSection {
  id:       string
  title:    string
  icon:     string
  roles:    RoleSlug[]
  articles: DocArticle[]
}

// ── Contenu ───────────────────────────────────────────────────────────────────

export const DOCS: DocSection[] = [
  // ─── Démarrage ────────────────────────────────────────────────────────────
  {
    id: 'getting-started',
    title: 'Prise en main',
    icon: '🚀',
    roles: [],
    articles: [
      {
        id: 'intro',
        title: 'Qu\'est-ce que CMDB ?',
        roles: [],
        body: `
# Présentation de l'application

La **CMDB** (Configuration Management Database) est votre référentiel centralisé pour gérer tous vos éléments de configuration (CI — *Configuration Items*).

Elle vous permet de :
- **Inventorier** matériels et logiciels avec leurs attributs
- **Lier** les éléments entre eux (dépendances, relations)
- **Suivre** les alertes, incidents, changements et vulnérabilités
- **Planifier** les maintenances et surveiller les échéances
- **Piloter** la qualité des données et générer des rapports

## Navigation

Utilisez la **sidebar gauche** pour accéder aux modules. Elle peut être réduite en mode icônes (clic sur la flèche) pour gagner de l'espace.

La **barre de recherche** en haut (raccourci \`Ctrl+K\`) permet de trouver instantanément tout CI, incident, changement ou CVE.
        `,
      },
      {
        id: 'navigation',
        title: 'Navigation et interface',
        roles: [],
        body: `
# Navigation dans l'interface

## Sidebar — menus groupés

La sidebar gauche organise les modules en **groupes accordéon**. Cliquez sur un groupe pour l'ouvrir ou le fermer. Le groupe contenant la page active s'ouvre automatiquement.

### Tableaux de bord
Accès rapide aux vues synthétiques :

| Lien | Description |
|------|-------------|
| **Vue générale** | Dashboard opérationnel — KPIs temps réel, alertes récentes, santé du parc |
| **Rapport exécutif** | Score de gouvernance global, 4 piliers de conformité, recommandations auto |

### Inventaire
Gestion du parc informatique :

| Lien | Description |
|------|-------------|
| **Matériel** | Serveurs, PC, équipements réseau — statuts, garanties, localisation |
| **Parc Virtuel** | VMs et conteneurs — hôte physique, CPU/RAM, hyperviseur |
| **Logiciels** | Applications installées, licences, éditeurs |
| **Référents** | Annuaire des responsables par CI — Key Users et référents logiciel |
| **Cartographie** | Graphe interactif des dépendances entre CIs |

### Opérations
Suivi quotidien de l'activité ITSM :

| Lien | Description |
|------|-------------|
| **Alertes** | Seuils dépassés — CPU, RAM, disque, connectivité |
| **Incidents** | Tickets d'incidents liés aux CIs — gravité, statut, MTTR |
| **Changements** | RFC (demandes de changement) — workflow approbation → planification → réalisation |
| **Maintenances** | Fenêtres de maintenance programmées sur les CIs |

### Conformité & Risques
Pilotage de la conformité du parc :

| Lien | Description |
|------|-------------|
| **Vulnérabilités** | CVEs liées aux CIs — score CVSS, statut de remédiation |
| **Fin de vie & Échéances** | Vue unifiée : garanties/leasings/licences/EOL par CI + priorités SLA/maintenance |
| **Contrats SLA** | Contrats de niveau de service — couverture, expiration |
| **Licences** | Conformité des licences logiciel — sièges utilisés vs alloués |
| **Qualité données** | Score de complétude des fiches CI — champs manquants, doublons |

> La page **Fin de vie & Échéances** remplace les anciennes pages "Fin de vie" et "Échéances" fusionnées en deux onglets : **Vue par CI** (garanties, leasings, licences, EOL) et **Vue par priorité** (toutes échéances classées par sévérité, inclut SLA et maintenances). L'ancienne URL /deadlines redirige automatiquement.

### Rapports *(Rapports planifiés visibles admins uniquement)*
Accès aux exports et à la planification :

| Lien | Description |
|------|-------------|
| **Rapports** | Génération de rapports PDF/CSV — par type de CI, période, filtre |
| **Rapports planifiés** | Envois automatiques périodiques — fréquence, destinataires, format |
| **État système** | Santé des services internes — backend, Redis, Celery, connecteurs |

### Intégrations *(admins uniquement)*
Connexions avec les systèmes externes :

| Lien | Description |
|------|-------------|
| **Connecteurs** | LDAP, EntraID, Intune, GLPI, SSH, SMTP, NVD, etc. |
| **Agents** | Téléchargement et gestion des agents natifs Linux/Windows |
| **Monitoring** | Connecteurs Zabbix, PRTG, Nagios — alertes et synchronisation |
| **Webhooks** | Intégrations sortantes vers outils tiers (Slack, Teams, générique) |
| **Tokens API** | Génération de clés d'accès pour l'API REST |
| **SSO / SAML** | Configuration de l'authentification unique via SAML 2.0 |
| **Calendrier M365** | Synchronisation des maintenances avec Microsoft 365 |
| **Segments réseau** | Modélisation des VLAN, DMZ, LAN — rattachement aux CIs |

### Administration *(admins uniquement)*
Configuration générale de la plateforme :

| Lien | Description |
|------|-------------|
| **Utilisateurs** | Gestion des comptes, rôles et mots de passe |
| **Droits & rôles** | Matrice de permissions par rôle |
| **Notifications** | Règles d'email automatique — types d'événements, destinataires |
| **Personnalisation** | Logo, nom de l'application, thème couleur, fond de connexion |
| **Sauvegardes** | Backup et restauration de la base de données |
| **Paramètres** | Fuseau horaire, format date/nombre/devise, listes de référence |
| **Audit** | Journal complet des actions utilisateurs |
| **Documentation API** | Interface Swagger OpenAPI interactive |

---

## Modes d'affichage de la sidebar

| Mode | Largeur | Utilisation |
|------|---------|-------------|
| **Plein** | 224 px | Labels complets + accordéon, idéal bureau |
| **Mini** | 56 px | Icônes groupes + popover au survol, gagne de l'espace |

Cliquez sur **◀** pour réduire, sur une icône de groupe en mode mini pour afficher un popover avec les sous-liens.

## Raccourci clavier

Appuyez sur **\`Ctrl+K\`** (ou \`⌘K\` sur Mac) pour ouvrir la **recherche globale**. Elle couvre : CIs, incidents, demandes de changement, vulnérabilités.

## Profil utilisateur

Votre avatar en bas de la sidebar donne accès à votre profil (nom, mot de passe). Le bouton **↪** à côté permet de se déconnecter.

## Créer un CI rapidement

Le bouton **+ Nouveau CI** en haut de la sidebar est toujours accessible, quel que soit le groupe ouvert.
        `,
      },
      {
        id: 'plans',
        title: 'Modules disponibles',
        roles: ['admin'],
        body: `
# Modules disponibles

Capybara CMDB Community est une **édition unique et gratuite** : tous les modules ci-dessous sont inclus, sans palier ni licence à activer.

| Module | Description |
|--------|-------------|
| **Inventaire matériel** | Gestion des équipements physiques (serveurs, postes, réseau) |
| **Inventaire logiciels** | Gestion des logiciels et applications |
| **Cartographie CI** | Graphe des dépendances entre CIs |
| **Recherche globale** | Recherche \`Ctrl+K\` sur tous les CIs |
| **Tableau de bord** | Vue générale et KPIs |
| **Incidents ITSM** | Gestion des incidents, timeline et lien ticket externe |
| **Changements (RFC)** | Gestion des demandes de changement |
| **Contrats SLA** | Suivi des SLA, expiration et couverture |
| **Licences** | Gestion des sièges, expiration et conformité |
| **Notifications email** | Alertes email sur événements CMDB |
| **Rapports PDF / CSV** | Export de rapports exécutifs et opérationnels |
| **Connecteurs** | LDAP/AD, GLPI et autres connecteurs on-prem |
| **Webhooks & tokens API** | Intégrations sortantes et accès API machine |
| **Calendrier maintenances** | Planification et suivi des fenêtres de maintenance |
| **Dashboard exécutif** | Score gouvernance et recommandations |
| **SSO / SAML** | Authentification SAML 2.0 (Okta, ADFS, etc.) |
| **Microsoft EntraID / Intune** | Sync utilisateurs et inventaire depuis Microsoft 365 |
| **Segments réseau** | Vue étoile et segments réseau VLAN/DMZ |
| **Agent natif Win / Linux / macOS** | Client léger pour remontée automatique d'inventaire |
| **SNMP → Incidents auto** | Réception SNMP/webhook et création d'incidents automatique |
| **Calendrier M365 / Outlook** | Synchronisation maintenances avec Outlook (Microsoft Graph API) |
| **Qualité des données** | Détection des CIs incomplets, doublons et anomalies |
        `,
      },
      {
        id: 'roles',
        title: 'Rôles et permissions',
        roles: ['admin'],
        body: `
# Rôles et permissions

L'accès aux fonctionnalités dépend du rôle attribué à votre compte.

## Tableau des permissions

| Fonctionnalité | Viewer | Operator | Admin |
|----------------|:------:|:--------:|:-----:|
| Consulter les CIs | ✅ | ✅ | ✅ |
| Créer / modifier des CIs | ❌ | ✅ | ✅ |
| Gérer les incidents | ❌ | ✅ | ✅ |
| Créer des RFC | ❌ | ✅ | ✅ |
| Gestion des utilisateurs | ❌ | ❌ | ✅ |
| Personnalisation (branding) | ❌ | ❌ | ✅ |
| Paramètres globaux | ❌ | ❌ | ✅ |
| Tokens API | ❌ | ❌ | ✅ |
| Rapports planifiés | ❌ | ❌ | ✅ |

> **Note :** Contactez votre administrateur pour toute demande de changement de rôle.
        `,
      },
    ],
  },

  // ─── Inventaire ───────────────────────────────────────────────────────────
  {
    id: 'inventory',
    title: 'Inventaire',
    icon: '🖥️',
    roles: [],
    articles: [
      {
        id: 'ci-concept',
        title: 'Éléments de configuration (CI)',
        roles: [],
        body: `
# Éléments de configuration (CI)

Un **CI (Configuration Item)** est tout composant de votre infrastructure qui doit être géré et suivi : serveurs, postes de travail, logiciels, équipements réseau, licences…

## Types de CI

| Type | Description |
|------|-------------|
| **Hardware** | Matériels physiques ou virtuels (serveurs, postes, switches…) |
| **Software** | Applications, systèmes d'exploitation, licences |

## Cycle de vie

\`\`\`
active → maintenance → retired
\`\`\`

- **active** : en production
- **maintenance** : en cours de maintenance planifiée
- **retired** : hors service (exclut des calculs qualité)

## Attributs clés

- **Nom** : identifiant métier du CI
- **Hostname / IP** : pour les éléments réseau
- **Numéro de série** : pour le matériel physique
- **Responsable** : personne ou équipe propriétaire
- **Criticité** : low / medium / high / critical
        `,
      },
      {
        id: 'ci-create',
        title: 'Créer et modifier un CI',
        roles: ['admin', 'operator'],
        body: `
# Créer et modifier un CI

## Création

1. Cliquez sur **Nouveau CI** en haut de la sidebar (ou le bouton \`+\`)
2. Choisissez le type : **Hardware** ou **Software**
3. Remplissez au minimum : nom, statut, criticité
4. Sauvegardez

## Modification

Depuis la fiche CI, cliquez sur **Modifier** (icône crayon) pour éditer les champs.

## Relations entre CIs

Sur la fiche CI, l'onglet **Relations** permet de lier des CIs entre eux :
- *dépend de* — ce CI a besoin de l'autre pour fonctionner
- *héberge* — ce CI fait tourner l'autre (ex. serveur → VM)
- *composé de* — relation partie/tout

Ces relations alimentent la **Cartographie** (page Graph).

## Suppression

La suppression d'un CI le place dans la **Corbeille** (Administration > Corbeille). Il reste récupérable pendant 30 jours, après quoi la suppression devient définitive. Préférez le statut **retired** pour conserver l'historique sans supprimer l'enregistrement.
        `,
      },
      {
        id: 'hardware',
        title: 'Tableau de bord Matériel',
        roles: [],
        body: `
# Tableau de bord Matériel

La page **Matériel** offre une vue consolidée de votre parc physique et virtuel.

## Indicateurs

- **Total CI hardware** actifs, en maintenance, retirés
- **Répartition par criticité** (donut chart)
- **CI en fin de vie** — date de garantie dépassée ou proche
- **CI sous-documentés** — champs importants manquants

## Liste

La liste filtre, trie et permet d'exporter au format CSV. Utilisez la colonne **Statut** pour repérer rapidement les anomalies.

## Sous-types matériel (hw_subtype)

Chaque CI hardware peut préciser son sous-type pour affiner la cartographie :

| Sous-type | Description |
|-----------|-------------|
| **server** | Serveur physique (rack, tour, lame) |
| **workstation** | Poste de travail utilisateur |
| **vm** | Machine virtuelle |
| **terminal_server** | Serveur de bureau à distance (RDS/TSE) |
| **infra** | Équipement réseau ou infrastructure (switch, firewall, AP…) |

## Champs techniques étendus (M41)

Chaque fiche CI hardware dispose de champs supplémentaires accessibles en modification :

| Champ | Description |
|-------|-------------|
| **Adresse IP** | IP principale de l'équipement |
| **CI hôte** | Pour une VM, lien vers le serveur physique ou hyperviseur |
| **Mode d'acquisition** | \`purchase\` (achat) ou \`leasing\` |
| **Fournisseur leasing** | Société de leasing (ex : HP Financial Services) |
| **Début / fin leasing** | Dates du contrat de leasing |
| **Coût mensuel** | Loyer mensuel du leasing |

> La date de **fin de leasing** est agrégée dans la page **Fin de vie & Échéances** avec les garanties, licences et EOL.
        `,
      },
      {
        id: 'software',
        title: 'Tableau de bord Logiciels',
        roles: [],
        body: `
# Tableau de bord Logiciels

La page **Logiciels** regroupe applications, systèmes d'exploitation et licences.

## Points d'attention

- **Licences expirées** : les logiciels avec \`end_of_support\` dépassé apparaissent en rouge
- **Versions dupliquées** : identifiez les doublons pour rationaliser
- **Couverture** : ratio CI logiciel / CI hardware pour estimer la complétude

## Lien avec les vulnérabilités

Chaque CI logiciel peut avoir des **CVE associées**. Le module Vulnérabilités affiche les CVE critiques et leur surface d'impact.
        `,
      },
    ],
  },

  // ─── Pilotage ─────────────────────────────────────────────────────────────
  {
    id: 'operations',
    title: 'Pilotage opérationnel',
    icon: '⚙️',
    roles: [],
    articles: [
      {
        id: 'alerts',
        title: 'Alertes',
        roles: [],
        body: `
# Alertes

Le module **Alertes** centralise les notifications issues de vos intégrations (Zabbix, PRTG, Nagios…) ou déclenchées manuellement.

## Niveaux de sévérité

| Niveau | Couleur | Signification |
|--------|---------|---------------|
| **critical** | Rouge | Incident en cours, action immédiate |
| **warning** | Orange | Dégradation, surveiller |
| **info** | Bleu | Information non bloquante |

## Cycle de vie

\`open\` → \`acknowledged\` → \`resolved\`

- **Acknowledge** : vous prenez en charge l'alerte (sans la fermer)
- **Resolve** : problème corrigé, alerte archivée

## Intégration webhook

Un webhook entrant peut créer des alertes automatiquement via \`POST /api/alerts\`. Consultez la section Administration > Webhooks pour la configuration.
        `,
      },
      {
        id: 'incidents',
        title: 'Incidents (ITSM)',
        roles: [],
        body: `
# Gestion des incidents

Le module **Incidents** suit les perturbations de service selon le cycle ITSM.

## Statuts

\`\`\`
new → assigned → in_progress → resolved → closed
\`\`\`

## Priorités

Calculées automatiquement à partir de l'**impact** (1-3) × **urgence** (1-3) :

| Priorité | Score |
|----------|-------|
| P1 — Critique | 8-9 |
| P2 — Haute | 5-7 |
| P3 — Moyenne | 3-4 |
| P4 — Basse | 1-2 |

## Lien CI

Associez un incident à un ou plusieurs CIs pour tracer l'impact et alimenter le score de risque du Dashboard KPI.

## SLA

Le SLA par défaut est défini au niveau de la priorité. Un incident P1 non résolu dans les délais apparaît en rouge dans la liste.
        `,
      },
      {
        id: 'changes',
        title: 'Changements (RFC)',
        roles: [],
        body: `
# Gestion des changements

Le module **Changements** (RFC — *Request for Change*) gère les demandes de modification de l'infrastructure.

## Workflow

\`\`\`
draft → submitted → approved / rejected → in_progress → completed
\`\`\`

## Types de changement

| Type | Description |
|------|-------------|
| **standard** | Changement pré-approuvé, risque faible |
| **normal** | Nécessite une validation explicite |
| **emergency** | Changement urgent, processus allégé |

## Planification

Chaque RFC peut être associée à une fenêtre de maintenance. La **Cartographie** visualise les CIs impactés.
        `,
      },
      {
        id: 'maintenance',
        title: 'Maintenances',
        roles: [],
        body: `
# Maintenances

Le **Calendrier des maintenances** planifie et visualise toutes les fenêtres de maintenance.

## Créer une maintenance

1. Cliquez sur **Nouvelle maintenance** ou cliquez sur un créneau dans le calendrier
2. Définissez : titre, CIs concernés, date de début / fin, statut
3. Sauvegardez

## Statuts

| Statut | Signification |
|--------|--------------|
| **planned** | Planifiée, pas encore commencée |
| **in_progress** | En cours |
| **completed** | Terminée avec succès |
| **cancelled** | Annulée |

## Vues du calendrier

Basculez entre vue **Mois**, **Semaine** et **Jour** via les boutons en haut à droite. Les maintenances apparaissent en couleur selon leur statut.
        `,
      },
      {
        id: 'vulnerabilities',
        title: 'Vulnérabilités (CVE)',
        roles: [],
        body: `
# Vulnérabilités

Le module **Vulnérabilités** recense les CVE (*Common Vulnerabilities and Exposures*) affectant vos CIs.

## Score CVSS

Chaque CVE porte un score CVSS (0-10) :

| Score | Niveau |
|-------|--------|
| 9.0-10.0 | **Critical** |
| 7.0-8.9 | **High** |
| 4.0-6.9 | **Medium** |
| 0.1-3.9 | **Low** |

## Surface d'impact

Depuis la fiche CVE, l'onglet **CIs affectés** liste tous vos éléments vulnérables. Cette donnée alimente le score de risque KPI du tableau de bord exécutif.

## Remédiation

Mettez à jour le champ **Date de correction prévue** pour suivre l'avancement. Les CVE critiques non corrigées remontent en priorité dans le Dashboard.
        `,
      },
      {
        id: 'eol-expiring',
        title: 'Fin de vie & Échéances',
        roles: [],
        body: `
# Fin de vie & Échéances

La page **Fin de vie & Échéances** (menu Conformité & Risques) regroupe en un seul endroit toutes les informations d'expiration du parc, accessibles via deux onglets complémentaires.

## Onglet — Vue par CI

Tableau des 4 types d'échéances liés aux fiches CI :

| Type | Source |
|------|--------|
| **Fin de garantie** | Champ \`warranty_end_date\` du CI hardware |
| **Fin de leasing** | Champ \`leasing_end_date\` du CI hardware |
| **Fin de licence** | Champ \`license_end_date\` du CI logiciel |
| **EOL éditeur** | Champ \`eol_date\` du CI logiciel |

## KPIs en tête de page

| Indicateur | Description |
|-----------|-------------|
| **Expirés** | Échéances déjà dépassées |
| **Critiques (< 30j)** | Expiration dans moins de 30 jours |
| **Attention (30-60j)** | Expiration entre 30 et 60 jours |
| **À venir** | Au-delà de 60 jours (dans l'horizon sélectionné) |

## Filtres

- **Horizon** : 30 / 60 / 90 jours / 6 mois / 1 an
- **Type CI** : tous / matériel / logiciel
- **Inclure expirés** : case à cocher pour afficher ou masquer les échéances passées

## Chips de délai

Chaque ligne affiche une pastille colorée indiquant le délai restant :
- 🔴 **Expiré** — date passée
- 🔴 **< 30j** — critique
- 🟠 **30-60j** — attention
- 🟡 **> 60j** — à surveiller

## Export CSV

Le bouton **CSV** (en haut à droite des filtres) télécharge la liste filtrée au format CSV, avec les colonnes : CI, Type CI, Équipe, Localisation, Statut, Échéance, Date, Jours restants.

## Lien vers la fiche CI

Chaque ligne est cliquable via le nom du CI pour accéder directement à la fiche et mettre à jour les dates.

## Widget sur le tableau de bord

Un widget **Fin de vie — 30 jours** est affiché directement sur la page d'accueil (Dashboard). Il liste les 6 prochains éléments expirant dans les 30 jours, toutes catégories confondues, avec un lien rapide vers la page complète.

## Alertes automatiques (M43)

Des notifications email sont envoyées automatiquement aux seuils **J-30, J-7 et J-1** pour :

| Événement | Type |
|-----------|------|
| \`warranty_expiring\` | Fin de garantie matériel |
| \`leasing_expiring\` | Fin de leasing matériel |
| \`license_expiring\` | Fin de licence logiciel (existant) |
| \`sla_expiring\` | Fin de contrat SLA (existant) |

Les destinataires et l'activation se configurent dans **Administration → Notifications**.

## Onglet — Vue par priorité

Vue opérationnelle classée par sévérité, alimentée par le moteur d'alertes Celery. Couvre des types supplémentaires non présents dans l'onglet CI :

| Type | Source |
|------|--------|
| **Fin de garantie** | Champ \`warranty_end_date\` du CI hardware |
| **Fin de licence** | Champ \`license_end_date\` du CI logiciel |
| **EOL éditeur** | Champ \`eol_date\` du CI logiciel |
| **Contrat SLA** | Échéance du contrat SLA lié au CI |
| **Maintenance** | Prochaine maintenance planifiée |

Chaque ligne affiche un badge de sévérité : **Critique** (rouge), **Attention** (orange), **Info** (gris).

> L'ancienne URL \`/deadlines\` redirige automatiquement vers cette page.
        `,
      },
    ],
  },

  // ─── Qualité & Rapports ───────────────────────────────────────────────────
  {
    id: 'quality',
    title: 'Qualité & Rapports',
    icon: '📊',
    roles: [],
    articles: [
      {
        id: 'quality-score',
        title: 'Score de qualité des données',
        roles: [],
        body: `
# Qualité des données

La page **Qualité** analyse automatiquement vos CIs actifs sur 9 critères pondérés.

## Score global (0-100)

| Score | Niveau |
|-------|--------|
| 80-100 | **Bon** (vert) |
| 50-79 | **Attention** (orange) |
| 0-49 | **Critique** (rouge) |

## Critères analysés

| Critère | Sévérité | Poids |
|---------|----------|-------|
| Nom manquant | Critique | 20 |
| Statut non défini | Critique | 15 |
| Criticité manquante | Haute | 12 |
| Responsable non assigné | Haute | 10 |
| Description absente | Moyenne | 8 |
| Type non renseigné | Haute | 10 |
| Aucune relation | Faible | 5 |
| Pas de date de revue | Faible | 5 |
| CI actif jamais mis à jour | Faible | 5 |

## Actions correctives

Cliquez sur un problème pour voir la liste des CIs concernés, puis accédez directement à leur fiche pour corriger.
        `,
      },
      {
        id: 'reports',
        title: 'Rapports',
        roles: [],
        body: `
# Rapports

Le module **Rapports** génère des exports de votre inventaire et de l'activité ITSM.

## Types disponibles

- **Inventaire complet** — tous les CIs avec attributs
- **Rapport de sécurité** — CVE actives par CI
- **Rapport d'incidents** — incidents sur une période
- **Tableau de bord exécutif** — KPIs synthétiques

## Formats

Les rapports sont disponibles en **CSV** (pour Excel) et **PDF** (pour diffusion).

## Export immédiat vs planifié

- **Export immédiat** : généré à la demande depuis la page Rapports
- **Rapports planifiés** (admin) : envoi automatique par email à intervalle défini
        `,
      },
    ],
  },

  // ─── Dashboard exécutif ───────────────────────────────────────────────────
  {
    id: 'executive',
    title: 'Tableau de bord KPI',
    icon: '📈',
    roles: [],
    articles: [
      {
        id: 'kpi-dashboard',
        title: 'Indicateurs KPI',
        roles: [],
        body: `
# Tableau de bord KPI exécutif

La page **Tableau de bord** offre une vue synthétique de la santé globale de votre infrastructure.

## Health Score (0-100)

Score composite calculé à partir de :
- Nombre d'alertes critiques ouvertes (pondération ×3)
- Nombre d'incidents ouverts (pondération ×5)
- CVE critiques non corrigées (pondération ×3)

| Score | État |
|-------|------|
| 80-100 | Sain |
| 50-79 | Dégradé |
| 0-49 | Critique |

## Top 5 CIs à risque

Classement des CIs les plus exposés, combinant CVE critiques et incidents ouverts.

## Tendance des alertes (30 jours)

Graphique d'évolution du nombre d'alertes quotidiennes sur le dernier mois.

## Cartographie

La page **Cartographie** représente graphiquement les relations entre CIs. Naviguez, zoomez et cliquez sur un nœud pour ouvrir sa fiche.
        `,
      },
      {
        id: 'executive-report',
        title: 'Rapport exécutif (gouvernance)',
        roles: [],
        body: `
# Rapport exécutif — Score de gouvernance

La page **Rapport exécutif** (menu "Rapport exécutif") offre une vue stratégique de maturité IT destinée aux responsables et RSSI.

## Score de gouvernance global (0–100)

Le score synthétise 4 piliers de conformité, chacun exprimé en pourcentage. Le code couleur :

| Score | Couleur | Signification |
|-------|---------|---------------|
| 80–100 | 🟢 Vert | Bonne maîtrise |
| 60–79 | 🟡 Ambre | Points d'attention |
| 0–59 | 🔴 Rouge | Risques significatifs |

## Les 4 piliers

| Pilier | Ce qu'il mesure |
|--------|----------------|
| **Sécurité** | % CVE critiques corrigées dans les délais |
| **Disponibilité** | % incidents résolus dans les SLA définis |
| **Conformité** | % licences conformes (sièges & expiration) |
| **Qualité données** | % CIs avec champs essentiels remplis |

Cliquez sur un pilier pour accéder directement au module correspondant (Vulnérabilités, Incidents, Licences ou Qualité).

## Recommandations automatiques

En bas de page, des recommandations contextuelles sont générées en fonction des piliers les moins bien notés. Exemples :
- *"32 CVE critiques sans date de correction — prioriser la remédiation"*
- *"14 licences en surallocation — réviser les achats"*

## Rafraîchissement

Les données sont calculées à la demande au chargement de la page. Utilisez le bouton **Actualiser** pour forcer un recalcul (utile après une mise à jour des données).
        `,
      },
    ],
  },

  // ─── Administration ───────────────────────────────────────────────────────
  {
    id: 'administration',
    title: 'Administration',
    icon: '🔧',
    roles: ['admin'],
    articles: [
      {
        id: 'users',
        title: 'Gestion des utilisateurs',
        roles: ['admin'],
        body: `
# Gestion des utilisateurs

Accédez à **Administration > Utilisateurs** pour gérer les comptes.

## Créer un utilisateur

1. Cliquez sur **Nouvel utilisateur**
2. Renseignez email, nom complet, mot de passe temporaire
3. Attribuez un ou plusieurs rôles : **viewer**, **operator**, **admin**
4. Sauvegardez — l'utilisateur peut se connecter immédiatement

## Rôles disponibles

| Rôle | Accès |
|------|-------|
| **viewer** | Lecture seule sur tous les modules |
| **operator** | Lecture + écriture CI, incidents, changements |
| **admin** | Accès complet incluant l'administration |

## Désactiver un compte

Décochez **Actif** dans la fiche utilisateur. Le compte est bloqué sans être supprimé (l'historique est conservé).

## Indicateur de présence

Dans la liste des utilisateurs, un **cercle coloré** s'affiche à gauche de chaque nom :

| Couleur | Signification |
|---------|---------------|
| 🟢 Vert | Utilisateur actif — connecté dans les 5 dernières minutes |
| ⚫ Gris | Utilisateur hors ligne ou inactif depuis plus de 5 minutes |

Survolez le cercle pour voir le tooltip **"Connecté"** ou **"Hors ligne"**.

La présence est mise à jour automatiquement par un heartbeat envoyé toutes les 60 secondes depuis le navigateur de chaque utilisateur connecté.
        `,
      },
      {
        id: 'webhooks',
        title: 'Webhooks',
        roles: ['admin'],
        body: `
# Webhooks

Les webhooks permettent à des systèmes externes d'envoyer des événements à la CMDB (alertes, découvertes d'actifs…).

## Créer un webhook

1. **Administration > Webhooks > Nouveau webhook**
2. Donnez-lui un nom et sélectionnez les types d'événements à recevoir
3. Copiez l'**URL** et le **secret** générés
4. Configurez l'émetteur externe pour envoyer un \`POST\` avec l'en-tête \`X-Webhook-Secret\`

## Sécurité

Chaque webhook a un secret HMAC-SHA256. La CMDB vérifie la signature avant de traiter l'événement. Ne partagez jamais le secret.

## Tester

Utilisez le bouton **Envoyer un test** pour vérifier que la connexion fonctionne.
        `,
      },
      {
        id: 'tokens',
        title: 'Tokens API',
        roles: ['admin'],
        body: `
# Tokens API

Les tokens permettent aux scripts et outils tiers de s'authentifier à l'API REST sans mot de passe utilisateur.

## Créer un token

1. **Administration > Tokens API > Nouveau token**
2. Donnez-lui un nom descriptif et une date d'expiration optionnelle
3. Copiez le token immédiatement — il ne sera plus affiché ensuite

## Utilisation

Ajoutez l'en-tête HTTP :
\`\`\`
Authorization: Bearer <votre-token>
\`\`\`

## Révocation

Cliquez sur **Révoquer** pour invalider immédiatement un token compromis.
        `,
      },
      {
        id: 'notifications',
        title: 'Notifications email',
        roles: ['admin'],
        body: `
# Centre de notifications email

Configurez les règles d'envoi d'emails automatiques depuis **Administration > Notifications**.

## Prérequis — connecteur SMTP

L'envoi d'emails requiert un connecteur SMTP actif. Rendez-vous dans
**Administration > Connecteurs**, ajoutez un connecteur de type **SMTP — Email** et
cliquez sur **Tester la connexion** pour valider. Une bannière verte confirme que le
connecteur est opérationnel directement dans la page Notifications.

## Types de notifications

| Catégorie | Type | Déclencheur |
|-----------|------|-------------|
| **Alertes** | Alerte critique | Nouvelle alerte de sévérité critical |
| **Alertes** | Incident critique | Incident priorité critique ouvert |
| **Alertes** | Incident ouvert | Tout nouvel incident déclaré |
| **Changements** | RFC soumise | Nouvelle demande de changement en attente |
| **Changements** | RFC décision | Approbation ou rejet d'une RFC |
| **Changements** | RFC terminée | Changement clôturé |
| **Conformité** | SLA expirant | SLA arrivant à échéance dans ≤ 30 jours |
| **Conformité** | Licence expirante | Licence arrivant à échéance dans ≤ 30 jours |
| **Conformité** | CVE critique | Nouvelle CVE avec score CVSS ≥ 9.0 |
| **Conformité** | Erreur connecteur | Échec de synchronisation d'un connecteur |
| **Résumé** | Digest hebdomadaire | Récapitulatif envoyé chaque lundi à 8h00 |

## Gestion des destinataires

Chaque règle dispose de sa propre liste de destinataires, modifiable indépendamment.

### Saisie manuelle
Saisissez directement une adresse email dans le champ de saisie libre. Idéal pour
les **groupes de messagerie** ou **listes de diffusion** (ex : \`equipe-ops@entreprise.com\`).

### Sélecteur annuaire
Cliquez sur **Choisir depuis l'annuaire** pour rechercher parmi les utilisateurs
synchronisés (LDAP, EntraID, OIDC ou locaux). Tapez un nom ou une adresse email —
les résultats apparaissent dès le premier caractère.

Chaque résultat affiche un badge indiquant la source de l'utilisateur :

| Badge | Couleur | Source |
|-------|---------|--------|
| **LDAP** | Bleu | Active Directory / annuaire LDAP |
| **EntraID** | Cyan | Microsoft Entra ID (Azure AD) |
| **OIDC** | Violet | Fournisseur OIDC (Keycloak, Okta…) |
| **Local** | Gris | Compte créé localement dans la CMDB |

Un clic sur un utilisateur ajoute immédiatement son adresse email à la liste des
destinataires. Les utilisateurs déjà présents dans la liste sont automatiquement exclus
des résultats de recherche.

## Email de test

Dans chaque règle, le lien **Envoyer un email de test** permet de valider la configuration
SMTP en envoyant un exemple vers l'adresse de votre choix, sans attendre un événement réel.

## Préférences par utilisateur

Chaque compte dispose d'un réglage **Alertes critiques** (activé par défaut) dans
**Profil > Notifications**. Si désactivé, l'utilisateur ne reçoit plus les emails
d'alertes critiques horaires, même s'il est dans la liste des destinataires de la règle.
        `,
      },
      {
        id: 'branding',
        title: 'Personnalisation',
        roles: ['admin'],
        body: `
# Personnalisation (Branding)

La page **Administration > Personnalisation** permet d'adapter l'interface à votre organisation.

## Options disponibles

- **Nom de l'application** : affiché dans la sidebar, l'onglet du navigateur et la **page de connexion**
- **Couleur principale** : thème global de l'interface (boutons, liens actifs…)
- **Couleur de la sidebar** : fond du menu latéral
- **Logo** : affiché dans la sidebar et en grand sur la **page de connexion** (PNG, JPEG, SVG, WebP, GIF — max 2 Mo)

## Page de connexion

Si un logo est configuré, il s'affiche directement sur la page de login à la place de l'icône par défaut, sans fond coloré. Le nom de l'application remplace le texte "CMDB" en titre.

## Aperçu en temps réel

Les modifications sont visibles en temps réel avant sauvegarde. Cliquez sur **Enregistrer** pour appliquer à tous les utilisateurs.

## Réinitialiser

Le bouton **Réinitialiser** restaure les valeurs par défaut (couleur bleue, pas de logo).
        `,
      },
      {
        id: 'global-settings',
        title: 'Paramètres globaux',
        roles: ['admin'],
        body: `
# Paramètres globaux

La page **Administration > Paramètres** regroupe les réglages transversaux de l'instance CMDB.

## Préférences d'affichage

| Paramètre | Options | Défaut |
|-----------|---------|--------|
| **Fuseau horaire** | Tous les fuseaux IANA (ex: \`Europe/Zurich\`) | \`UTC\` |
| **Format de date** | \`DD/MM/YYYY\`, \`MM/DD/YYYY\`, \`YYYY-MM-DD\` | \`DD/MM/YYYY\` |
| **Format nombre** | \`1.000,00\` (FR) ou \`1,000.00\` (EN) | FR |
| **Devise** | Code ISO 4217 (ex: \`CHF\`, \`EUR\`, \`USD\`) | \`CHF\` |

Ces paramètres s'appliquent à l'ensemble de l'interface : dates des fiches CI, montants des leasings et achats, rapports PDF/CSV.

## Listes de référence

Les listes de référence sont des valeurs prédéfinies que l'on retrouve dans les formulaires (ex: équipes, localisations, types de matériel). Elles se gèrent dans l'onglet **Listes de référence** :

- **Ajouter** une valeur : bouton "+ Ajouter"
- **Désactiver** une valeur : bascule active/inactive (la valeur reste dans les CIs existants)
- **Réordonner** : champ sort_order

## Packs de licences

L'onglet **Packs de licences** liste les contrats multi-CIs (Enterprise Agreement, Volume Licensing…) :

| Champ | Description |
|-------|-------------|
| **Nom** | Ex: "Microsoft 365 Business Premium" |
| **Clé de licence** | Clé globale du contrat |
| **Sièges totaux** | Nombre de sièges couverts par le pack |
| **Notes** | Informations contractuelles libres |

Chaque pack affiche le nombre de CIs logiciels rattachés et la somme des sièges consommés.
        `,
      },
      {
        id: 'report-jobs',
        title: 'Rapports planifiés',
        roles: ['admin'],
        body: `
# Rapports planifiés

**Administration > Rapports planifiés** configure l'envoi automatique de rapports par email.

## Créer une planification

1. Choisissez le **type de rapport** (inventaire, sécurité, incidents, KPI)
2. Définissez la **fréquence** : quotidien, hebdomadaire, mensuel
3. Saisissez les **destinataires** (emails séparés par des virgules)
4. Choisissez le **format** : CSV ou PDF
5. Activez et sauvegardez

## Envoi immédiat

Le bouton **Envoyer maintenant** déclenche un envoi ponctuel sans attendre l'échéance planifiée.

## Historique

Chaque planification affiche la date et le statut du dernier envoi. En cas d'échec, le message d'erreur est disponible.
        `,
      },
      {
        id: 'audit',
        title: 'Journal d\'audit',
        roles: ['admin'],
        body: `
# Journal d'audit

Le **Journal d'audit** enregistre toutes les actions réalisées par les utilisateurs.

## Informations tracées

- Utilisateur et son rôle
- Action effectuée (create, update, delete, login…)
- Ressource concernée (type + identifiant)
- Horodatage précis
- Adresse IP source

## Filtres

Filtrez par **utilisateur**, **type d'action**, **ressource** ou **période** pour isoler rapidement un événement.

## Conservation

Les logs d'audit sont conservés indéfiniment. Pour les archiver, exportez via l'API : \`GET /api/audit?format=csv\`.
        `,
      },
      {
        id: 'trash',
        title: 'Corbeille',
        roles: ['admin'],
        body: `
# Corbeille

**Administration > Corbeille** centralise tous les éléments supprimés, avec possibilité de restauration ou de purge définitive.

## Principe

Toute suppression dans la CMDB est d'abord un **soft-delete** : l'élément est masqué de l'interface mais conservé en base. La corbeille est la page qui expose ces éléments aux administrateurs.

## Période de grâce

Les éléments supprimés restent récupérables pendant **30 jours**. Passé ce délai, ils sont effacés automatiquement chaque nuit.

## Informations tracées

| Colonne | Description |
|---------|-------------|
| **Type** | Entité concernée (CI, Utilisateur, Incident…) |
| **Nom** | Identifiant lisible de l'élément |
| **Supprimé le** | Date et heure exacte |
| **Supprimé par** | Utilisateur auteur de la suppression |
| **Source** | Comment la suppression a été déclenchée |
| **Expire le** | Date limite avant suppression définitive |

### Sources de suppression

| Source | Description |
|--------|-------------|
| **Interface — unitaire** | Bouton "Supprimer" sur un élément |
| **Interface — masse** | Sélection multiple + action groupée |
| **API** | Appel direct via l'API REST |
| **Automatique** | Tâche planifiée (purge des éléments expirés) |

## Actions disponibles

- **Restaurer** — remet l'élément à son emplacement d'origine, état actif
- **Purger la sélection** — suppression définitive immédiate des éléments sélectionnés
- **Tout purger** — vide intégralement la corbeille (confirmation obligatoire)
- **Exporter CSV** — journal d'audit des suppressions

## Sélection de masse

La méthode de sélection s'adapte au volume de la liste :

| Volume | Mode |
|--------|------|
| Moins de 50 éléments | Cases à cocher individuelles |
| 50 à 500 éléments | Cases + "Tout sélectionner cette page" |
| Plus de 500 éléments | Filtre obligatoire + "Sélectionner les N résultats" |

> Pour les grandes listes, toute action de masse sans filtre actif est intentionnellement bloquée afin d'éviter les suppressions accidentelles.
        `,
      },
      {
        id: 'import-strategy',
        title: 'Stratégie d\'import',
        roles: ['admin'],
        body: `
# Stratégie d'import

Tous les imports dans la CMDB (CSV, connecteurs LDAP/EntraID, API tierce) suivent la même politique.

## Règle fondamentale : jamais de suppression par import

Un import ne peut **jamais** supprimer un élément existant, quelle que soit la source.
La suppression reste une action exclusivement manuelle via l'interface ou l'API.

## Comportement d'un import (upsert)

Pour chaque ligne ou élément entrant :

| Situation | Action |
|-----------|--------|
| Élément introuvable en base | **Création** |
| Élément trouvé et actif | **Mise à jour** des champs fournis |
| Élément trouvé mais archivé ou désactivé | **Ignoré** (compté dans "ignorés") |

Si un champ est vide dans le fichier importé, la valeur existante en base est **conservée** — aucun écrasement par une valeur vide.

## Clés de correspondance

| Entité | Clé utilisée pour la correspondance |
|--------|-------------------------------------|
| CI | Nom (insensible à la casse) |
| Maintenance | Titre + nom du CI + date |
| Utilisateur | Adresse email (insensible à la casse) |

## Rapport d'import

Après chaque import, un résumé est affiché :

| Compteur | Signification |
|----------|---------------|
| **Créés** | Nouveaux éléments ajoutés |
| **Mis à jour** | Éléments existants modifiés |
| **Ignorés** | Éléments archivés ou désactivés (non modifiés) |
| **Erreurs** | Lignes invalides, avec numéro de ligne et message |

## Suppression après import

Si votre fichier source ne contient plus certains éléments et que vous souhaitez les supprimer, utilisez :
- La **suppression unitaire** depuis la fiche de l'élément
- La **suppression de masse** via les filtres de la liste (sélectionner les résultats → supprimer)

Les éléments supprimés passent par la **Corbeille** (30 jours de récupération).
        `,
      },
      {
        id: 'network-segments',
        title: 'Segments réseau (VLAN/DMZ)',
        roles: ['admin'],
        body: `
# Segments réseau — VLAN, DMZ, LAN, WAN

La page **Admin > Segments réseau** permet de modéliser la topologie réseau de votre infrastructure et d'y rattacher des CIs.

## Types de segments

| Type | Description |
|------|-------------|
| **VLAN** | Réseau logique avec identifiant VLAN (1–4094) |
| **DMZ** | Zone démilitarisée — services exposés Internet |
| **LAN** | Réseau local interne |
| **WAN** | Liaison opérateur ou réseau étendu |
| **Sous-réseau** | Plage d'adresses IP (CIDR) |
| **Autre** | Segment personnalisé |

## Créer un segment

1. Cliquez sur **Nouveau segment**
2. Renseignez : nom, type, VLAN ID (optionnel), plage CIDR (optionnel), description, couleur
3. Sauvegardez

## Rattacher des CIs à un segment

Depuis la **fiche d'un CI** (onglet Relations ou Général), sélectionnez le segment réseau auquel appartient l'équipement.

Le segment apparaît alors comme un nœud distinct dans la **Cartographie CI** (graphe), avec une icône réseau et la couleur configurée, relié aux CIs membres.

## Import / Export CSV

Pour un déploiement massif, utilisez l'import CSV :

\`\`\`
name,type,vlan_id,subnet,description,color
VLAN 10 — Production,vlan,10,10.10.10.0/24,Serveurs de production,#3B82F6
DMZ Publique,dmz,100,192.168.100.0/28,Services exposés Internet,#EF4444
\`\`\`

Le bouton **Exporter CSV** télécharge tous les segments existants dans ce format.

## Filtrer par segment dans l'inventaire

Dans les listes CI (**Matériel**, **Logiciels**), le filtre **Segment réseau** permet d'afficher uniquement les CIs appartenant à un segment donné.
        `,
      },
      {
        id: 'api',
        title: 'API REST',
        roles: ['admin'],
        body: `
# API REST

La CMDB expose une API REST complète documentée avec OpenAPI.

## Documentation interactive

Accédez à la documentation Swagger depuis :
\`\`\`
https://<votre-domaine>/docs
\`\`\`

La documentation ReDoc (lecture seule, plus lisible) est disponible sur :
\`\`\`
https://<votre-domaine>/redoc
\`\`\`

## Authentification

Toutes les routes (sauf \`/api/token\` et \`/api/branding\`) nécessitent un token Bearer :

\`\`\`bash
curl -H "Authorization: Bearer <token>" https://<domaine>/api/ci
\`\`\`

## Principaux endpoints

| Ressource | GET | POST | PATCH | DELETE |
|-----------|-----|------|-------|--------|
| \`/api/ci\` | Liste | Créer | — | — |
| \`/api/ci/{id}\` | Détail | — | Modifier | Supprimer |
| \`/api/alerts\` | Liste | Créer | — | — |
| \`/api/incidents\` | Liste | Créer | — | — |
| \`/api/changes\` | Liste | Créer | — | — |
| \`/api/search\` | Recherche | — | — | — |
        `,
      },
      {
        id: 'backup',
        title: 'Sauvegardes & Restauration',
        roles: ['admin'],
        body: `
# Sauvegardes & Restauration

La page **Administration > Sauvegardes** permet de gérer les sauvegardes automatiques et manuelles de la base de données et des fichiers uploadés.

## Jobs de sauvegarde

Un **job** est une règle de sauvegarde : fréquence, rétention, destination optionnelle. Vous pouvez créer plusieurs jobs (ex. "Quotidien local" + "Hebdo SFTP").

### Créer un job

1. Cliquez sur **Nouveau job**
2. Donnez-lui un nom
3. Choisissez la fréquence : **Manuel**, **Quotidien**, **Hebdomadaire** ou **Mensuel**
4. Si fréquence ≠ Manuel : saisissez l'**heure de déclenchement** au format **HH:MM**
   - Quotidien : ex. \`02:30\` pour 2h30 du matin
   - Hebdomadaire : choisissez aussi le **jour de la semaine**
   - Mensuel : choisissez aussi le **jour du mois** (si > dernier jour du mois, exécuté le dernier jour)
5. Définissez la **rétention** (nombre d'archives à conserver, défaut : 7)
6. Cochez **Inclure les fichiers uploadés** pour inclure les avatars et pièces jointes
7. Sauvegardez

### Déclenchement automatique

Les jobs planifiés se déclenchent **à la minute exacte** configurée (heure Paris). Le système vérifie chaque minute si un job est dû — le backup ne démarre que lorsque l'heure **ET** la minute correspondent.

> Si vous configurez \`22:30\`, le backup démarrera à exactement 22h30 chaque jour/semaine/mois selon la fréquence.

### Lancer manuellement

Le bouton **▶ Lancer** déclenche une sauvegarde immédiate, indépendamment de la planification.

## Archive produite

Chaque sauvegarde crée une archive \`cmdb_backup_YYYYMMDD_HHMMSS.tar.gz\` contenant :

| Fichier dans l'archive | Contenu |
|------------------------|---------|
| \`db.dump\` | Dump PostgreSQL format custom (\`pg_dump -Fc\`) |
| \`uploads/\` | Fichiers uploadés (avatars, pièces jointes) — si option activée |
| \`metadata.json\` | Version, date, options utilisées |

## Rétention

La rétention s'applique sur les **archives réussies** uniquement. Les archives en erreur sont conservées dans l'historique sans compter dans le quota de rétention.

## Historique des runs

Chaque exécution affiche :
- **Statut** : ✅ Réussi / ❌ Erreur / 🔵 En cours
- **Taille** de l'archive
- **Durée** d'exécution
- **Message d'erreur** en cas d'échec

Les sparklines (petits carrés colorés) sous le nom du job donnent un aperçu visuel des 7 dernières exécutions.

## Destination distante (optionnelle)

Chaque job peut envoyer l'archive vers un serveur distant après la sauvegarde locale :

| Type | Protocole | Port défaut |
|------|-----------|-------------|
| **SFTP** | SSH File Transfer | 22 |
| **SMB** | Partage réseau Windows | 445 |

L'échec de l'envoi distant ne fait **pas** échouer la sauvegarde locale : l'archive reste disponible en local.

Utilisez le bouton **Tester la connexion** pour valider les paramètres avant de sauvegarder.

## Restauration

### Depuis une archive locale

1. Dans l'onglet **Historique**, cliquez sur **Restaurer** à côté d'un run réussi
2. Confirmez — la restauration remplace intégralement la base de données et les uploads
3. La page se recharge automatiquement après restauration

### Depuis un fichier externe

Utilisez le bouton **Importer une archive** pour restaurer depuis un fichier \`.tar.gz\` téléchargé localement.

> ⚠️ **La restauration est irréversible.** Toutes les données actuelles sont écrasées. Assurez-vous d'avoir une sauvegarde récente avant de procéder.

## Télécharger une archive

Le bouton **⬇ Télécharger** permet de récupérer l'archive localement pour la stocker hors du serveur ou l'inspecter.
        `,
      },
    ],
  },

  // ─── Connecteurs ──────────────────────────────────────────────────────────
  {
    id: 'connectors',
    title: 'Connecteurs',
    icon: '🔌',
    roles: ['admin'],
    articles: [
      {
        id: 'connectors-overview',
        title: 'Vue d\'ensemble',
        roles: ['admin'],
        body: `
# Connecteurs — Vue d'ensemble

Les connecteurs permettent à la CMDB de s'intégrer avec vos annuaires, outils ITSM, hyperviseurs et sources de données externes.

## Principes fondamentaux

### Priorité DB > variables d'environnement

La configuration des connecteurs est **stockée en base de données** et chiffrée (AES-256). Elle prend toujours le pas sur les variables d'environnement du fichier \`.env\`. Ce mécanisme s'applique notamment aux connecteurs LDAP et EntraID pour les authentifications SSO.

### Chiffrement des configurations

Tous les secrets (mots de passe, tokens, clés API) sont chiffrés avant persistence via une clé serveur configurée dans \`SECRET_KEY\`. Les valeurs ne sont jamais exposées en clair via l'API.

### Synchronisation manuelle vs automatique

| Mode | Déclencheur | Usage |
|------|-------------|-------|
| **Manuelle** | Bouton "Synchroniser" dans Admin > Connecteurs | Tests, synchronisation ponctuelle |
| **Automatique** | Celery Beat (planification configurable) | Production, sync régulière |

La fréquence par défaut des syncs automatiques est configurable par connecteur (hourly, daily, weekly).

### Historique des synchronisations

Chaque synchronisation génère un enregistrement dans l'historique (Admin > Connecteurs > onglet "Historique") avec :
- Date et heure
- Statut (succès / erreur)
- Détail du résultat (éléments créés, mis à jour, désactivés)
- Message d'erreur en cas d'échec

## Types de connecteurs disponibles

| Type | Catégorie | Résultat principal |
|------|-----------|--------------------|
| **LDAP** | Annuaire on-prem | Sync utilisateurs + auth login |
| **EntraID** | Annuaire cloud Microsoft | Sync utilisateurs + SSO OIDC |
| **Intune** | MDM Microsoft | Sync équipements (CIs matériel) |
| **GLPI** | ITSM open-source | Sync CIs, alertes, logiciels |
| **SSH Discovery** | Découverte réseau | Collecte agentless Linux/macOS |
| **PostgreSQL / MySQL / MSSQL / Oracle / MongoDB** | Bases de données | Import données métier custom |
| **SMTP** | Messagerie | Envoi notifications email |
| **ServiceNow / Jira / Atera / Freshservice / Zendesk** | Ticketing cloud | Import incidents et tickets |
        `,
      },
      {
        id: 'connector-ldap',
        title: 'LDAP on-prem (Active Directory)',
        roles: ['admin'],
        body: `
# Connecteur LDAP — Active Directory on-prem

Permet de synchroniser les utilisateurs depuis un annuaire LDAP/Active Directory et d'activer l'authentification LDAP sur la page de connexion.

## Paramètres de configuration

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Hôte** (\`host\`) | Nom DNS ou IP du contrôleur de domaine | \`dc01.entreprise.local\` |
| **Port** (\`port\`) | Port LDAP (auto si vide) | \`389\` (LDAP), \`636\` (LDAPS) |
| **SSL / LDAPS** (\`use_ssl\`) | Activer la connexion chiffrée | \`true\` / \`false\` |
| **DN de service** (\`bind_dn\`) | Compte technique pour lire l'annuaire | \`CN=svc-cmdb,OU=Services,DC=corp,DC=local\` |
| **Mot de passe service** (\`bind_password\`) | Mot de passe du compte technique | \`••••••••\` |
| **Base de recherche** (\`base_dn\`) | Nœud LDAP de départ | \`DC=corp,DC=local\` |
| **Filtre utilisateurs** (\`user_filter\`) | Filtre LDAP pour les comptes à importer | \`(objectClass=user)\` |
| **Attribut login** (\`search_attr\`) | Attribut utilisé pour le login | \`sAMAccountName\` (AD) ou \`uid\` (OpenLDAP) |

## Ports par défaut (auto-détection)

Si le champ **Port** est laissé vide :
- **LDAPS activé** → port **636**
- **LDAPS désactivé** → port **389**

## Résultat attendu après synchronisation

- Les comptes AD correspondant au filtre sont créés dans la CMDB avec \`auth_source = ldap\`
- Les utilisateurs existants (même email) sont mis à jour (nom complet, statut actif)
- Les comptes désactivés dans AD sont désactivés dans la CMDB

## Authentification LDAP

Une fois le connecteur configuré et actif, la page de connexion CMDB accepte les identifiants AD directement :
1. L'utilisateur saisit son \`sAMAccountName\` et son mot de passe AD
2. La CMDB tente d'abord une auth locale (compte CMDB natif), puis LDAP en fallback
3. Si l'authentification LDAP réussit, le compte est créé ou mis à jour automatiquement

## Attributs AD typiques

| Attribut AD | Rôle dans CMDB |
|-------------|----------------|
| \`sAMAccountName\` | Login (identifiant) |
| \`mail\` | Email |
| \`displayName\` | Nom complet |
| \`userAccountControl\` | Statut actif/inactif |
| \`department\` | Service |
| \`title\` | Poste |

> **Recommandation** : Créez un compte de service dédié en lecture seule pour le \`bind_dn\`, avec uniquement les droits de lecture sur l'OU concernée.
        `,
      },
      {
        id: 'connector-entra',
        title: 'Microsoft EntraID (Azure AD)',
        roles: ['admin'],
        body: `
# Connecteur Microsoft EntraID (Azure AD)

Permet de synchroniser les utilisateurs depuis Microsoft Entra ID (anciennement Azure Active Directory) et d'activer le **SSO Microsoft** (bouton "Se connecter avec Microsoft" sur la page de login).

## Prérequis Azure — App Registration

Dans le portail Azure (portal.azure.com) → **Azure Active Directory** → **Inscriptions d'applications** :

1. Créer une nouvelle inscription d'application
2. Donner un nom : ex. \`CMDB-Prod\`
3. Sous **Authentification** → ajouter une URI de redirection de type **Web** :
   \`\`\`
   https://cmdb.votre-domaine.com/api/auth/oidc/callback
   \`\`\`
4. Sous **Certificats & secrets** → créer un **secret client** (noter sa valeur immédiatement)
5. Sous **API Autorisations** → ajouter les permissions **Microsoft Graph** :
   - \`User.Read.All\` (lecture des utilisateurs)
   - \`Group.Read.All\` (lecture des groupes, si filtre sync_groups utilisé)
   → Accorder le **consentement administrateur**

## Paramètres de configuration

| Champ | Description | Exemple |
|-------|-------------|---------|
| **ID Locataire** (\`tenant_id\`) | GUID du tenant Azure | \`a1b2c3d4-e5f6-....\` |
| **ID Application** (\`client_id\`) | GUID de l'App Registration | \`f7e8d9c0-....\` |
| **Secret client** (\`client_secret\`) | Valeur du secret (expire selon config Azure) | \`••••••••\` |
| **Groupes sync** (\`sync_groups\`) | Filtrer par groupes (optionnel, CSV) | \`Admins-IT,Equipe-Dev\` |

## Résultat attendu après synchronisation

- Utilisateurs Entra créés/mis à jour avec \`auth_source = entra\`
- Champs synchronisés : email, nom complet, poste, service, statut actif
- Comptes désactivés dans Azure → désactivés dans CMDB
- Si \`sync_groups\` configuré : seuls les membres des groupes listés sont importés (membres **transitifs** des sous-groupes inclus)

## SSO Microsoft (bouton login)

Une fois le connecteur Entra **actif**, un bouton **"Se connecter avec Microsoft"** apparaît automatiquement sur la page de connexion CMDB. Le flux :

1. Clic sur le bouton → redirection vers Microsoft login
2. Authentification Microsoft (MFA inclus si configuré dans Azure)
3. Retour automatique vers la CMDB avec session ouverte
4. Compte CMDB créé/mis à jour automatiquement

## Filtre par groupes (\`sync_groups\`)

Laisser vide pour synchroniser **tous les utilisateurs** du tenant. Si renseigné :
- Seuls les membres des groupes listés (séparés par des virgules) sont synchronisés
- Les membres des **sous-groupes** sont automatiquement inclus (résolution transitive via l'API Graph)
- Les utilisateurs hors-groupes ne sont **ni importés ni désactivés** (exclus silencieusement)

> **Sécurité** : le secret client expire selon la durée configurée dans Azure (recommandé : 12 mois). Pensez à le renouveler avant expiration pour éviter toute interruption du SSO.
        `,
      },
      {
        id: 'connector-intune',
        title: 'Microsoft Intune',
        roles: ['admin'],
        body: `
# Connecteur Microsoft Intune

Synchronise les équipements gérés par Microsoft Intune (MDM) comme CIs matériel dans la CMDB.

## Prérequis Azure

Même App Registration que pour EntraID, avec les permissions supplémentaires :
- \`DeviceManagementManagedDevices.Read.All\` (lecture des appareils gérés)

## Paramètres de configuration

| Champ | Description |
|-------|-------------|
| **ID Locataire** (\`tenant_id\`) | GUID du tenant Azure (identique à EntraID) |
| **ID Application** (\`client_id\`) | GUID de l'App Registration |
| **Secret client** (\`client_secret\`) | Valeur du secret client |

## Résultat attendu après synchronisation

Pour chaque appareil Intune géré, un CI matériel est créé ou mis à jour avec :
- **Nom** : nom de l'appareil (hostname)
- **Type** : ordinateur portable, desktop, smartphone selon le type Intune
- **OS** : système d'exploitation + version
- **Numéro de série**
- **Utilisateur principal** : email de l'utilisateur assigné
- **Statut conformité** : compliant / non-compliant / unknown
- **Date dernier check-in**

Les appareils supprimés ou désinscrits d'Intune sont **marqués inactifs** (non supprimés) dans la CMDB.
        `,
      },
      {
        id: 'connector-glpi',
        title: 'GLPI',
        roles: ['admin'],
        body: `
# Connecteur GLPI

Synchronise les éléments de configuration, logiciels et alertes depuis une instance GLPI (Gestionnaire Libre de Parc Informatique).

## Prérequis GLPI

Dans GLPI, générer deux tokens :
1. **App token** (Administration → API REST → Ajouter un client API)
2. **User token** (Préférences → Clé API distante d'un utilisateur ayant accès en lecture)

Vérifier que l'API REST GLPI est activée (Configuration → Générale → API).

## Paramètres de configuration

| Champ | Description | Exemple |
|-------|-------------|---------|
| **URL** (\`url\`) | URL de base de l'instance GLPI | \`https://glpi.entreprise.com\` |
| **App Token** (\`app_token\`) | Token de l'application API | \`abc123....\` |
| **User Token** (\`user_token\`) | Token de l'utilisateur API | \`xyz789....\` |

## Résultat attendu après synchronisation

| Entité GLPI | CI créé dans CMDB |
|-------------|-------------------|
| Ordinateurs | CI matériel (type: computer) |
| Imprimantes | CI matériel (type: printer) |
| Équipements réseau | CI matériel (type: network) |
| Logiciels | CI logiciel avec version |
| Problèmes / Tickets | Alertes CMDB |

Les CIs importés de GLPI incluent : nom, localisation, utilisateur assigné, fabricant, modèle, numéro de série.
        `,
      },
      {
        id: 'connector-ssh',
        title: 'SSH Discovery (agentless)',
        roles: ['admin'],
        body: `
# SSH Discovery — Découverte agentless

Découvre et inventorie automatiquement des serveurs Linux / macOS via SSH, **sans installer d'agent** sur les machines cibles.

## Principe

La CMDB se connecte en SSH à chaque hôte cible, exécute des commandes de collecte (lecture système uniquement), et crée ou met à jour le CI correspondant.

## Paramètres de configuration

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Hôtes** (\`hosts\`) | Liste d'IPs ou hostnames, séparés par des virgules ou sauts de ligne | \`192.168.1.10, srv-web01.local\` |
| **Port SSH** (\`port\`) | Port SSH des cibles (défaut : 22) | \`22\` |
| **Utilisateur** (\`username\`) | Compte SSH (lecture seule suffisant) | \`cmdb-agent\` |
| **Mot de passe** (\`password\`) | Mot de passe SSH (optionnel si clé) | \`••••••••\` |
| **Clé privée** (\`private_key\`) | Contenu de la clé privée SSH (RSA/ED25519) | \`-----BEGIN OPENSSH PRIVATE KEY-----\n....\` |

## Données collectées

Pour chaque hôte accessible :
- **Hostname** et FQDN
- **OS** : distribution, version du noyau
- **Architecture** : x86_64, arm64...
- **CPU** : modèle, nombre de cœurs
- **RAM** : capacité totale
- **Disques** : points de montage, capacité, utilisation
- **Interfaces réseau** : IP, MAC
- **Paquets installés** : (apt/yum/dnf selon distribution)
- **Services actifs**

## Résultat attendu

Un CI de type **Serveur** est créé ou mis à jour pour chaque hôte SSH accessible. Les hôtes inaccessibles (timeout, refus de connexion, erreur auth) sont enregistrés dans l'historique avec le message d'erreur correspondant.

## Recommandations sécurité

- Utiliser une **clé SSH dédiée** plutôt qu'un mot de passe
- Créer un **compte en lecture seule** sur les cibles (\`useradd cmdb-agent --shell /bin/bash\`)
- Restreindre les commandes autorisées via \`authorized_keys\` avec l'option \`command=\`
        `,
      },
      {
        id: 'connector-databases',
        title: 'Bases de données (PostgreSQL, MySQL, MSSQL, Oracle, MongoDB)',
        roles: ['admin'],
        body: `
# Connecteurs Bases de données

Permettent d'importer des données depuis vos bases de données métier existantes pour alimenter la CMDB.

## Types de connecteurs supportés

- **PostgreSQL** (port défaut : 5432)
- **MySQL / MariaDB** (port défaut : 3306)
- **Microsoft SQL Server / MSSQL** (port défaut : 1433)
- **Oracle Database** (port défaut : 1521)
- **MongoDB** (port défaut : 27017)

## Paramètres communs (SQL)

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Hôte** (\`host\`) | Adresse du serveur de base de données | \`db.entreprise.local\` |
| **Port** (\`port\`) | Port d'écoute | \`5432\` |
| **Base de données** (\`database\`) | Nom de la base cible | \`production\` |
| **Utilisateur** (\`username\`) | Compte de connexion (lecture seule) | \`cmdb_reader\` |
| **Mot de passe** (\`password\`) | Mot de passe | \`••••••••\` |
| **SSL** (\`use_ssl\`) | Connexion chiffrée | \`true\` / \`false\` |

## Paramètres spécifiques MongoDB

| Champ | Description |
|-------|-------------|
| **URI** (\`uri\`) | Chaîne de connexion complète | \`mongodb://user:pass@host:27017/db?authSource=admin\` |
| **Collection** (\`collection\`) | Collection MongoDB à lire | \`assets\` |

## Paramètre spécifique Oracle

| Champ | Description |
|-------|-------------|
| **Service name** (\`service_name\`) | Nom du service Oracle | \`ORCLPDB1\` |

## Résultat attendu

Le connecteur peut être configuré avec une **requête SQL personnalisée** pour extraire les données souhaitées. Les colonnes résultantes sont mappées sur les champs CI de la CMDB. Exemples d'usages :
- Import du parc depuis un outil maison
- Synchronisation d'un référentiel d'applications métier
- Alimentation depuis un ERP (SAP, etc.)
        `,
      },
      {
        id: 'connector-smtp',
        title: 'SMTP — Notifications email',
        roles: ['admin'],
        body: `
# Connecteur SMTP — Notifications email

Configure le serveur d'envoi d'emails pour toutes les notifications de la CMDB.

## Paramètres de configuration

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Hôte SMTP** (\`host\`) | Serveur d'envoi | \`smtp.office365.com\` / \`smtp.gmail.com\` |
| **Port** (\`port\`) | Port SMTP | \`587\` (STARTTLS) / \`465\` (SSL) / \`25\` (non chiffré) |
| **SSL/TLS** (\`use_ssl\`) | Connexion chiffrée | \`true\` pour le port 465 |
| **STARTTLS** (\`use_tls\`) | Upgrade vers TLS | \`true\` pour le port 587 |
| **Utilisateur** (\`username\`) | Compte SMTP | \`notifications@entreprise.com\` |
| **Mot de passe** (\`password\`) | Mot de passe / App Password | \`••••••••\` |
| **Expéditeur** (\`from_addr\`) | Adresse d'expédition | \`cmdb-noreply@entreprise.com\` |
| **Nom expéditeur** (\`from_name\`) | Libellé affiché | \`CMDB Notifications\` |

## Configurations courantes

### Office 365
\`\`\`
host      = smtp.office365.com
port      = 587
use_tls   = true
username  = notifications@votre-tenant.onmicrosoft.com
\`\`\`

### Gmail (App Password requis)
\`\`\`
host      = smtp.gmail.com
port      = 587
use_tls   = true
username  = votre-compte@gmail.com
password  = [App Password 16 caractères]
\`\`\`

### Serveur SMTP interne (Exchange)
\`\`\`
host      = mail.entreprise.local
port      = 25
use_ssl   = false
use_tls   = false
\`\`\`

## Événements déclenchant un email

| Événement | Destinataires |
|-----------|---------------|
| Alerte critique créée | Utilisateurs avec \`notify_critical_alerts = true\` |
| CVE critique détectée | Administrateurs + référents CI concernés |
| Incident ouvert / escaladé | Assigné + équipe |
| Contrat SLA expiré (J-30, J-7, J-0) | Contacts SLA |
| Licence expirée ou dépassement | Contacts Licence |
| Rapport planifié généré | Destinataires configurés |
| Changement RFC approuvé | Demandeur |

La configuration des notifications par type d'événement se fait dans **Admin > Notifications**.

## Test de la configuration

Après avoir sauvegardé le connecteur SMTP, utilisez le bouton **"Tester"** pour envoyer un email de test à l'adresse de l'administrateur connecté.
        `,
      },
      {
        id: 'connector-saml',
        title: 'SSO SAML 2.0 (Okta, ADFS, Azure AD direct)',
        roles: ['admin'],
        body: `
# SSO SAML 2.0

Le module **SAML 2.0** permet de configurer un fournisseur d'identité externe (IdP) pour l'authentification unique sur la page de connexion CMDB. Compatible avec Okta, Microsoft ADFS, Azure AD (via App Registration SAML), OneLogin, etc.

## Prérequis côté IdP

Dans votre fournisseur d'identité, créez une nouvelle application SAML avec ces paramètres :

| Paramètre IdP | Valeur à configurer |
|--------------|---------------------|
| **ACS URL** (Assertion Consumer Service) | \`https://cmdb.votre-domaine.com/api/auth/saml/acs\` |
| **Entity ID** (SP Entity ID) | \`https://cmdb.votre-domaine.com\` (ou valeur personnalisée) |
| **NameID Format** | \`EmailAddress\` |
| **Binding** | HTTP POST |

## Configuration dans l'application

Accédez à **Admin > SAML** pour configurer :

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Entity ID (IdP)** | Identifiant unique de votre IdP | \`https://idp.entreprise.com/saml\` |
| **SSO URL (IdP)** | URL de connexion SAML de l'IdP | \`https://idp.entreprise.com/sso\` |
| **Certificat IdP** | Certificat X.509 public (PEM) de l'IdP | \`-----BEGIN CERTIFICATE-----\\n....\` |
| **Attribut email** | Nom de l'attribut SAML contenant l'email | \`email\` ou \`http://schemas.xmlsoap.org/.../emailaddress\` |
| **Attribut nom** | Nom de l'attribut SAML contenant le nom | \`displayName\` |
| **Attribut groupes** | Attribut SAML contenant les groupes (optionnel) | \`groups\` |

## Récupérer les métadonnées SP

Une fois la configuration sauvegardée, téléchargez le fichier **metadata SP** (bouton "Télécharger le XML") pour l'importer dans votre IdP — certains IdP (Okta, ADFS) acceptent ce fichier pour configurer automatiquement l'application.

L'URL de métadonnées est aussi disponible directement :
\`\`\`
https://cmdb.votre-domaine.com/api/auth/saml/metadata
\`\`\`

## Mappings groupes → rôles

Dans l'onglet **Mappings**, associez les groupes IdP à des rôles CMDB :

| Groupe IdP | Rôle CMDB |
|------------|-----------|
| \`IT-Admins\` | admin |
| \`IT-Operators\` | operator |
| \`IT-ReadOnly\` | viewer |

Lorsqu'un utilisateur se connecte via SAML, son rôle est attribué automatiquement selon le premier groupe correspondant. Si aucun mapping ne correspond, l'utilisateur reçoit le rôle **viewer** par défaut.

## Activation

Cochez **Activer** pour que le bouton "Se connecter avec SSO" apparaisse sur la page de login. Le bouton n'est visible que si le connecteur SAML est actif.

## Coexistence SAML + EntraID + LDAP

Les trois méthodes d'authentification peuvent être actives simultanément. La page de connexion affiche un bouton pour chaque méthode SSO active, en plus du formulaire local.

> **Note :** Les comptes créés via SAML ont \`auth_source = saml\`. Ils ne peuvent pas se connecter avec un mot de passe local.
        `,
      },
      {
        id: 'connector-m365-calendar',
        title: 'Calendrier M365 / Outlook',
        roles: ['admin'],
        body: `
# Calendrier Microsoft 365 / Outlook

Le connecteur **M365 Calendrier** synchronise les maintenances de la CMDB avec votre calendrier Outlook via l'API Microsoft Graph. Chaque maintenance devient un événement dans un calendrier partagé ou de groupe Office 365.

## Prérequis Azure

Dans le portail Azure → **App Registration** (peut être la même App que pour EntraID) :

1. Ajouter les permissions **Microsoft Graph** :
   - \`Calendars.ReadWrite\` (lecture/écriture des calendriers)
   - → Accorder le **consentement administrateur**

## Configuration dans l'application

Accédez à **Admin > Calendrier M365** :

| Champ | Description | Exemple |
|-------|-------------|---------|
| **ID Locataire** (\`tenant_id\`) | GUID du tenant Azure | \`a1b2c3d4-...\` |
| **ID Application** (\`client_id\`) | GUID de l'App Registration | \`f7e8d9c0-...\` |
| **Secret client** (\`client_secret\`) | Valeur du secret Azure | \`••••••••\` |
| **Email calendrier** (\`calendar_email\`) | Adresse du calendrier cible | \`it-maintenances@entreprise.com\` |

## Tester la connexion

Après sauvegarde, cliquez sur **Tester** pour vérifier l'accès à Microsoft Graph. Un message de confirmation indique le nom d'affichage et l'email du compte autorisé.

## Synchronisation des maintenances

Deux modes de synchronisation :

### Synchronisation individuelle

Dans la liste des maintenances (onglet **Maintenances** de la page M365) :
- ▶ **Synchroniser** : pousse la maintenance dans Outlook (crée ou met à jour l'événement)
- ✕ **Désynchroniser** : supprime l'événement Outlook (la maintenance reste dans la CMDB)

### Synchronisation globale

Le bouton **"Tout synchroniser"** pousse toutes les maintenances CMDB actives (statuts \`planned\` et \`in_progress\`) vers Outlook en une seule opération.

## Données synchronisées

| Champ CMDB | Champ Outlook |
|------------|---------------|
| Titre maintenance | Objet de l'événement |
| Date début | Début de l'événement |
| Date fin | Fin de l'événement |
| CIs concernés | Corps de l'événement (liste) |
| Type (maintenance, patch, update, audit) | Catégorie Outlook |
| Statut | Mention dans le corps |

## Résultat

Les maintenances synchronisées affichent une coche verte ✅ dans la liste. Elles restent visibles dans Outlook pour les équipes IT sans accès à la CMDB.
        `,
      },
      {
        id: 'connector-ticketing',
        title: 'Ticketing cloud (ServiceNow, Jira, Atera, Freshservice, Zendesk)',
        roles: ['admin'],
        body: `
# Connecteurs Ticketing cloud

Permettent d'importer les incidents et tickets depuis vos outils ITSM cloud dans la CMDB.

## ServiceNow

| Champ | Description | Exemple |
|-------|-------------|---------|
| \`instance\` | Nom d'instance ServiceNow | \`entreprise\` (→ entreprise.service-now.com) |
| \`username\` | Compte API ServiceNow | \`cmdb_integration\` |
| \`password\` | Mot de passe | \`••••••••\` |

**Résultat** : les incidents (INC) et demandes de changement (CHG) sont importés comme incidents CMDB avec statut, priorité et assigné.

## Jira Service Management

| Champ | Description | Exemple |
|-------|-------------|---------|
| \`url\` | URL de l'instance Jira | \`https://entreprise.atlassian.net\` |
| \`email\` | Email du compte API | \`admin@entreprise.com\` |
| \`api_token\` | Token API Atlassian (jeton personnel) | \`ATATT3xFfGF0....\` |
| \`project_key\` | Clé du projet Jira à synchroniser | \`ITSM\` |

**Résultat** : les tickets Jira du projet configuré sont importés comme incidents, avec le statut, la priorité et le responsable.

## Atera

| Champ | Description |
|-------|-------------|
| \`api_key\` | Clé API Atera (Admin > API) |

**Résultat** : alertes agents et tickets supportés importés. Les équipements gérés peuvent être créés comme CIs matériel.

## Freshservice

| Champ | Description | Exemple |
|-------|-------------|---------|
| \`domain\` | Sous-domaine Freshservice | \`entreprise\` (→ entreprise.freshservice.com) |
| \`api_key\` | Clé API (Profil > API Key) | \`uXh7Kz....\` |

## Zendesk

| Champ | Description | Exemple |
|-------|-------------|---------|
| \`subdomain\` | Sous-domaine Zendesk | \`entreprise\` (→ entreprise.zendesk.com) |
| \`email\` | Email du compte API | \`admin@entreprise.com\` |
| \`api_token\` | Token API Zendesk (Admin > API > Tokens) | \`abc123....\` |

## Résultat commun à tous les connecteurs ticketing

- Les tickets importés apparaissent dans le module **Incidents** de la CMDB
- Les statuts sont normalisés (ouvert, en cours, résolu, fermé)
- La priorité est préservée (critique, haute, normale, basse)
- Les associations CI sont maintenues si l'outil source les fournit
        `,
      },
    ],
  },

  // ─── Agents CMDB ──────────────────────────────────────────────────────────
  {
    id: 'agents',
    title: 'Agents CMDB',
    icon: '🤖',
    roles: ['admin'],
    articles: [
      {
        id: 'agents-overview',
        title: 'Présentation des agents',
        roles: ['admin'],
        body: `
# Agents CMDB — Présentation

Les agents natifs sont des scripts légers à déployer sur vos équipements pour collecter automatiquement les informations système et les reporter dans la CMDB.

## Agent vs SSH Discovery — Quand utiliser quoi ?

| Critère | Agent natif | SSH Discovery (agentless) |
|---------|-------------|--------------------------|
| **Installation** | Script à déployer sur la cible | Aucune installation cible |
| **Réseau requis** | HTTPS sortant (cible → CMDB) | SSH entrant (CMDB → cible) |
| **Systèmes** | Linux, macOS, Windows | Linux, macOS uniquement |
| **Exécution** | Planifiée sur la cible | Planifiée côté CMDB |
| **Données** | Très complètes (paquets, services, logs) | Complètes mais limitées |
| **Idéal pour** | Parc hétérogène, Windows, DMZ | Petit parc, accès SSH existant |

## Téléchargement des agents

Les scripts agents sont disponibles dans **Admin > Agents**. Trois variantes :

- 🐧 **Agent Linux** (\`cmdb_agent_linux.sh\`) — Bash, compatible Debian/Ubuntu/RHEL/CentOS/Alma
- 🍎 **Agent macOS** (\`cmdb_agent_macos.sh\`) — Bash, compatible macOS 12+
- 🪟 **Agent Windows** (\`cmdb_agent_windows.ps1\`) — PowerShell 5.1+, compatible Windows 10/11/Server 2016+

Chaque script téléchargé est **pré-configuré** avec l'URL de votre instance CMDB et votre token d'agent.

## Architecture de communication

\`\`\`
[Équipement cible]
    Agent script (cron / Task Scheduler)
         │
         │  POST HTTPS
         ▼
[CMDB API]
    /api/agent/report
         │
         ▼
    CI créé ou mis à jour
\`\`\`

## Token d'agent

Un **token dédié** est généré pour les agents (distinct des tokens API utilisateurs). Ce token est automatiquement intégré dans les scripts téléchargés. Il peut être régénéré dans Admin > Agents sans affecter les autres tokens.
        `,
      },
      {
        id: 'agent-linux',
        title: 'Agent Linux & macOS (Shell)',
        roles: ['admin'],
        body: `
# Agent Linux & macOS — Script Bash

## Installation

### 1. Téléchargement

Dans Admin > Agents, cliquez sur **"Télécharger Agent Linux"** (ou macOS). Le script est pré-configuré.

Ou via curl depuis le serveur cible :
\`\`\`bash
curl -o /opt/cmdb-agent.sh https://cmdb.votre-domaine.com/api/agent/script/linux
chmod +x /opt/cmdb-agent.sh
\`\`\`

### 2. Configuration du script

Les variables de configuration sont en en-tête du script :

\`\`\`bash
CMDB_URL="https://cmdb.votre-domaine.com"   # URL de votre instance CMDB
AGENT_TOKEN="<votre-token>"                  # Token agent (pré-rempli au téléchargement)
\`\`\`

### 3. Test d'exécution manuelle

\`\`\`bash
sudo /opt/cmdb-agent.sh
\`\`\`

Vérifiez dans la CMDB que le CI apparaît ou est mis à jour (Inventaire > Matériel).

### 4. Planification (crontab)

Exécution quotidienne à 2h du matin :
\`\`\`bash
echo "0 2 * * * root /opt/cmdb-agent.sh >> /var/log/cmdb-agent.log 2>&1" | sudo tee /etc/cron.d/cmdb-agent
\`\`\`

## Données collectées

| Catégorie | Données |
|-----------|---------|
| **Système** | Hostname, FQDN, OS, version noyau, architecture |
| **CPU** | Modèle, nombre de cœurs, fréquence |
| **RAM** | Total, utilisée, disponible |
| **Disques** | Points de montage, taille, utilisation (%) |
| **Réseau** | Interfaces, adresses IP, adresses MAC |
| **Logiciels** | Paquets installés (apt/dpkg/rpm/brew selon OS) |
| **Services** | Services systemd actifs |
| **Uptime** | Durée de fonctionnement |

## Résultat dans la CMDB

Un CI de type **Serveur** est créé (ou mis à jour si le hostname correspond) avec :
- Tous les attributs système listés ci-dessus
- Statut : actif
- Source : agent
- Dernière mise à jour : timestamp de l'exécution
        `,
      },
      {
        id: 'agent-windows',
        title: 'Agent Windows (PowerShell)',
        roles: ['admin'],
        body: `
# Agent Windows — Script PowerShell

## Installation

### 1. Téléchargement

Dans Admin > Agents, cliquez sur **"Télécharger Agent Windows"**. Le script \`.ps1\` est pré-configuré.

### 2. Configuration du script

Les variables de configuration sont en en-tête du script :

\`\`\`powershell
$CMDB_URL    = "https://cmdb.votre-domaine.com"   # URL de votre instance CMDB
$AGENT_TOKEN = "<votre-token>"                     # Token agent (pré-rempli au téléchargement)
\`\`\`

### 3. Politique d'exécution PowerShell

Sur les systèmes avec politique restrictive, déverrouiller l'exécution :
\`\`\`powershell
Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned
\`\`\`

### 4. Test d'exécution manuelle (invite admin)

\`\`\`powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\\CMDB\\cmdb_agent.ps1"
\`\`\`

### 5. Planification (Planificateur de tâches Windows)

Via PowerShell (à exécuter en admin) :
\`\`\`powershell
$action  = New-ScheduledTaskAction -Execute "powershell.exe" \`
             -Argument "-ExecutionPolicy Bypass -File C:\\CMDB\\cmdb_agent.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "CMDB-Agent" -Action $action \`
             -Trigger $trigger -RunLevel Highest -Force
\`\`\`

Ou via l'interface graphique : **Ouvrir le Planificateur de tâches** → Créer une tâche de base.

## Données collectées

| Catégorie | Données |
|-----------|---------|
| **Système** | Hostname, domaine AD, OS Windows, édition, version build |
| **CPU** | Modèle, nombre de cœurs logiques/physiques |
| **RAM** | Total, disponible (GB) |
| **Disques** | Lettres de lecteur, taille, espace libre |
| **Réseau** | Cartes réseau, IP, MAC, DNS |
| **Logiciels** | Programmes installés (via Win32_Product / registre) |
| **Services** | Services Windows en cours d'exécution |
| **Rôles Windows** | Rôles Serveur installés (Windows Server uniquement) |

## Résultat dans la CMDB

Un CI de type **Poste de travail** ou **Serveur Windows** est créé ou mis à jour avec tous les attributs ci-dessus. Le CI est reconnu par son hostname — si un CI avec ce nom existe déjà, il est mis à jour plutôt que dupliqué.

## Déploiement en masse (GPO)

Pour déployer l'agent sur tout un parc via GPO :
1. Copier le script sur un partage réseau (\`\\\\srv-partage\\CMDB\\cmdb_agent.ps1\`)
2. Créer une GPO "Computer Configuration" → "Windows Settings" → "Scripts (Startup)"
3. Ajouter le script PowerShell comme script de démarrage
        `,
      },
    ],
  },

  // ─── Modules avancés ──────────────────────────────────────────────────────
  {
    id: 'advanced-modules',
    title: 'Modules avancés',
    icon: '⚡',
    roles: [],
    articles: [
      {
        id: 'virtual-park',
        title: 'Parc Virtuel',
        roles: [],
        body: `
# Parc Virtuel

Le module **Parc Virtuel** (menu "Parc Virtuel") offre une vue dédiée aux machines virtuelles et à leurs hôtes physiques.

## Fonctionnalités

- **Liste des VMs** avec leur hôte physique, état (running/stopped), OS, vCPU, RAM allouée
- **Liste des hôtes physiques** avec le nombre de VMs hébergées
- **KPIs** : total VMs, VMs actives, taux de consolidation

## Alimentation des données

Les VMs sont des CIs de type \`virtual_machine\` dans la CMDB. Elles sont créées par :
- Import manuel
- Connecteur Intune (pour les postes Hyper-V/Azure)
- Agent natif sur l'hyperviseur
- API REST

## Lien hôte / VM

La relation hôte ↔ VM est modélisable via les **relations CI** (onglet Relations dans le détail d'un CI). Le type de relation \`hosted_on\` (hébergé sur) représente ce lien.
        `,
      },
      {
        id: 'sla-contracts',
        title: 'Contrats SLA',
        roles: [],
        body: `
# Contrats SLA

Le module **Contrats SLA** (menu "Contrats SLA") centralise le suivi de vos accords de niveau de service.

## Fonctionnalités

- **Liste des contrats** avec fournisseur, type, période de validité, statut
- **Indicateurs de couverture** : pourcentage de CIs couverts
- **Alertes d'expiration** : J-30, J-7, J-0 (email + alerte in-app)
- **Tableau de bord SLA** : taux de couverture global, contrats expirant bientôt

## Champs d'un contrat SLA

| Champ | Description |
|-------|-------------|
| **Nom** | Libellé du contrat |
| **Fournisseur** | Prestataire ou éditeur |
| **Type** | Maintenance, support, MCO, infogérance... |
| **Date début / fin** | Période de validité |
| **CIs couverts** | Éléments de configuration couverts par ce contrat |
| **Contacts** | Emails destinataires des alertes expiration |

## Notifications SLA

Les emails d'alerte d'expiration sont envoyés aux contacts du contrat selon ce calendrier :
- **30 jours avant** : premier avertissement
- **7 jours avant** : alerte urgente
- **À la date d'expiration** : notification finale

Les notifications nécessitent un **connecteur SMTP** configuré et actif.
        `,
      },
      {
        id: 'licenses',
        title: 'Gestion des licences',
        roles: [],
        body: `
# Gestion des licences

Le module **Licences** (menu "Licences") permet de suivre la conformité de vos licences logicielles.

## Fonctionnalités

- **Inventaire des licences** par éditeur, produit, type (perpétuelle, abonnement, OEM...)
- **Sièges** : nombre acheté vs nombre utilisé vs écart
- **Expiration** : date de fin de validité avec alertes proactives
- **Conformité** : statut automatique (conforme / surallocation / expiré)

## Champs d'une licence (CI logiciel)

| Champ | Description |
|-------|-------------|
| **Produit** | Nom du logiciel (ex: Microsoft 365, Adobe CC) |
| **Éditeur** | Fournisseur |
| **Type de licence** | Catégorie générale |
| **Sous-type** | \`perpetual\` / \`subscription\` / \`oem\` / \`academic\` / \`saas\` / \`open_source\` |
| **Clé de licence** | Clé d'activation (stockée chiffrée) |
| **Sièges achetés** | Nombre de licences acquises |
| **Sièges utilisés** | Nombre d'installations/utilisateurs actifs |
| **Date expiration** | Pour les abonnements — alimente la page Fin de vie |
| **Pack de licences** | Regroupement multi-CIs (ex: EA Microsoft) |

## Packs de licences

Un **Pack** regroupe plusieurs CIs logiciels sous un même contrat (ex: un EA Microsoft couvrant Office, Teams et Exchange). Il centralise la clé de licence et le nombre de sièges total.

Gestion via **Administration > Paramètres > Packs de licences**.

## Intégrateur / contact éditeur (M41)

La fiche CI logiciel dispose d'un bloc **Intégrateur** pour enregistrer le contact revendeur ou intégrateur :

| Champ | Description |
|-------|-------------|
| **Société** | Nom de l'intégrateur ou revendeur |
| **Contact** | Nom du référent commercial |
| **Téléphone** | Numéro de contact |
| **Email** | Adresse email du contact |

## États de conformité

| État | Condition |
|------|-----------|
| ✅ **Conforme** | Sièges utilisés ≤ sièges achetés et non expiré |
| ⚠️ **Surallocation** | Sièges utilisés > sièges achetés |
| 🔴 **Expiré** | Date d'expiration dépassée |

## Alertes licence

Des emails sont envoyés J-30, J-7 et J-0 avant expiration d'une licence abonnement.
        `,
      },
      {
        id: 'keyusers-directory',
        title: 'Référents & Key Users',
        roles: [],
        body: `
# Référents & Key Users

Le module **Référents** (menu "Référents") offre une vue transversale de tous les référents et utilisateurs clés associés aux CIs de la CMDB.

## Concept

Chaque CI peut avoir des **Key Users** (utilisateurs clés / référents). Un référent est une personne :
- **Responsable technique** ou fonctionnel d'un CI
- **Interlocuteur privilégié** en cas d'incident
- **Personne de contact** pour les notifications

## Vue transversale (page /keyusers)

La page Référents affiche **tous les référents de tous les CIs** dans un seul tableau, avec :
- **Nom** et type de compte (local / EntraID / LDAP)
- **Rôle** du référent sur le CI (admin, viewer, support...)
- **Service** et poste
- **CI associé** avec lien direct et criticité
- **Type de CI** (matériel, logiciel, service...)

## Filtres disponibles

- Par **rôle** (admin, viewer, support...)
- Par **type de CI** (hardware, software, service...)
- **Recherche textuelle** : nom, email, CI

## Gestion des référents

Les référents se gèrent depuis le **détail d'un CI** → onglet **Key Users** :
1. Cliquer sur "Ajouter un référent"
2. Rechercher l'utilisateur CMDB
3. Sélectionner son rôle
4. Valider

> Les utilisateurs synchronisés depuis LDAP ou EntraID sont automatiquement disponibles dans la liste de sélection.
        `,
      },
      {
        id: 'ci-graph',
        title: 'Cartographie CI (graphe)',
        roles: [],
        body: `
# Cartographie CI — Graphe des dépendances

Le module **Cartographie** (menu "Cartographie") visualise les relations entre CIs sous forme de graphe interactif.

## Fonctionnalités

- **Graphe interactif** pan & zoom, repositionnement des nœuds par glisser-déposer
- **Layout automatique** concentrique BFS (nœud central → dépendances au second plan)
- **Types de relations** représentés par des couleurs différentes
- **Clic sur un nœud** → lien vers le détail du CI
- **Filtre par CI racine** : centrer la vue sur un CI spécifique

## Navigation par niveaux (jusqu'à 5 niveaux)

La cartographie supporte une exploration **jusqu'à 5 niveaux de dépendances** en partant d'un CI racine.

**Vue étoile (mode exploration) :**
1. Sélectionnez un CI racine dans le filtre de recherche
2. Le graphe affiche le CI central et ses dépendances directes (niveau 1)
3. Cliquez sur un nœud de niveau 1 pour **élargir** vers ses propres dépendances (niveau 2)
4. Répétez jusqu'au niveau 5 maximum

L'élargissement est progressif : les nœuds déjà affichés restent visibles. Pour les parcs complexes (> 200 nœuds à un niveau), la pagination limite automatiquement l'affichage pour maintenir les performances (< 2 secondes).

## Types de relations CI

| Type | Description |
|------|-------------|
| **depends_on** | Dépendance fonctionnelle (A dépend de B pour fonctionner) |
| **hosted_on** | Hébergement (VM hébergée sur hôte physique) |
| **connected_to** | Connexion réseau ou physique |
| **member_of** | Appartenance à un cluster ou groupe |

## Segments réseau dans le graphe

Les **segments réseau** (VLAN, DMZ…) configurés dans Admin > Segments réseau apparaissent comme des nœuds distincts dans le graphe, avec leur couleur et icône réseau. Les CIs rattachés à un segment y sont connectés par des arêtes en pointillés.

## Gestion des relations

Les relations se gèrent depuis le **détail d'un CI** → onglet **Relations** :
- **Ajouter une relation** : bouton "+ Ajouter une relation", sélectionner le CI cible et le type
- **Supprimer une relation** : bouton ✕ sur la ligne de la relation
- Les noms des CIs source et cible sont affichés en clair (pas d'identifiants techniques)

## Accès au graphe global

Depuis la page **/graph**, tous les CIs et leurs relations sont affichés. Pour les parcs importants (> 50 CIs), utilisez le filtre de recherche pour recentrer la vue sur un sous-ensemble cohérent.
        `,
      },
    ],
  },

  // ─── Environnement & Déploiement ──────────────────────────────────────────
  {
    id: 'environment',
    title: 'Environnement & Configuration',
    icon: '⚙️',
    roles: ['admin'],
    articles: [
      {
        id: 'env-variables',
        title: 'Variables d\'environnement',
        roles: ['admin'],
        body: `
# Variables d'environnement — Référence complète

Les variables d'environnement sont définies dans le fichier \`.env\` à la racine du projet. La plupart des paramètres de connexion (LDAP, EntraID) peuvent être gérés via l'UI (connecteurs DB) et n'ont pas besoin d'être définis en \`.env\`.

## Variables obligatoires

| Variable | Description | Exemple |
|----------|-------------|---------|
| \`DATABASE_URL\` | URL de connexion PostgreSQL | \`postgresql://cmdb:password@db:5432/cmdb\` |
| \`SECRET_KEY\` | Clé secrète serveur (JWT + chiffrement config) | Chaîne aléatoire ≥ 32 caractères |
| \`DOMAIN\` | Domaine public de l'instance | \`cmdb.votre-domaine.com\` |

## Variables optionnelles — Redis & Celery

| Variable | Description | Défaut |
|----------|-------------|--------|
| \`REDIS_URL\` | URL Redis pour Celery | \`redis://redis:6379/0\` |
| \`REDIS_PASSWORD\` | Mot de passe Redis | (vide) |
| \`CELERY_BROKER_URL\` | Broker Celery | Déduit de \`REDIS_URL\` |

## Variables optionnelles — EntraID / OIDC (fallback)

Ces variables ne sont utilisées que si **aucun connecteur Entra DB actif** n'est configuré.

| Variable | Description |
|----------|-------------|
| \`OIDC_ENABLED\` | Activer le SSO OIDC (\`true\`/\`false\`) |
| \`OIDC_ISSUER\` | URL issuer OIDC (ex: \`https://login.microsoftonline.com/<tenant>/v2.0\`) |
| \`OIDC_CLIENT_ID\` | Client ID de l'App Registration |
| \`OIDC_CLIENT_SECRET\` | Secret client |

> **Priorité** : si un connecteur Entra est actif en DB, ces variables sont ignorées.

## Variables optionnelles — SMTP (fallback)

Ces variables ne sont utilisées que si **aucun connecteur SMTP DB actif** n'est configuré.

| Variable | Description |
|----------|-------------|
| \`SMTP_HOST\` | Serveur SMTP |
| \`SMTP_PORT\` | Port (587 recommandé) |
| \`SMTP_USER\` | Utilisateur SMTP |
| \`SMTP_PASSWORD\` | Mot de passe SMTP |
| \`SMTP_FROM\` | Adresse expéditeur |

## Variables de sécurité

| Variable | Description | Défaut |
|----------|-------------|--------|
| \`ACCESS_TOKEN_EXPIRE_MINUTES\` | Durée de vie du JWT (minutes) | \`60\` |
| \`CORS_ORIGINS\` | Origines CORS autorisées | URL du domaine configuré |

## Variables de débogage

| Variable | Description | Production |
|----------|-------------|------------|
| \`DEBUG\` | Mode debug FastAPI | \`false\` |
| \`LOG_LEVEL\` | Niveau de log (\`DEBUG\`, \`INFO\`, \`WARNING\`) | \`INFO\` |
        `,
      },
      {
        id: 'deployment',
        title: 'Déploiement Docker Compose',
        roles: ['admin'],
        body: `
# Déploiement Docker Compose

La CMDB se déploie entièrement via Docker Compose. L'ensemble des services est orchestré dans \`docker-compose.yml\`.

## Services

| Service | Image | Rôle |
|---------|-------|------|
| \`backend\` | Python 3.12 / FastAPI | API REST, logique métier |
| \`frontend\` | Node.js + Nginx | SPA React servie en statique |
| \`db\` | PostgreSQL 16 | Base de données principale |
| \`redis\` | Redis 7 | Broker Celery, cache |
| \`celery_worker\` | Python 3.12 | Exécution tâches asynchrones |
| \`celery_beat\` | Python 3.12 | Planificateur tâches récurrentes |

## Commandes de déploiement

### Premier démarrage
\`\`\`bash
cp .env.example .env        # Configurer les variables
docker compose build
docker compose up -d
docker compose exec backend alembic upgrade head   # Migrations DB
\`\`\`

### Mise à jour
\`\`\`bash
git pull origin develop
docker compose build --no-cache
docker compose up -d
docker compose exec backend alembic upgrade head
\`\`\`

### Vérification de l'état
\`\`\`bash
docker compose ps
docker compose logs backend --tail=50
docker compose logs celery_worker --tail=50
\`\`\`

## Traefik (reverse proxy)

La CMDB est exposée via Traefik sur le réseau Docker \`clu-proxy\`. Les labels Traefik dans \`docker-compose.yml\` configurent :
- Le routage vers le frontend (port 80 Nginx) pour toutes les routes sauf \`/api\`
- Le routage vers le backend (port 8000 FastAPI) pour \`/api/*\`, \`/docs\`, \`/redoc\`
- Le certificat TLS automatique (Let's Encrypt via Traefik ACME)

## Sauvegardes

### Base de données PostgreSQL
\`\`\`bash
docker compose exec db pg_dump -U cmdb cmdb > backup_$(date +%Y%m%d).sql
\`\`\`

### Restauration
\`\`\`bash
docker compose exec -T db psql -U cmdb cmdb < backup_2026-01-01.sql
\`\`\`

### Fichiers de configuration

Les configurations des connecteurs sont chiffrées en base de données. La clé de chiffrement est la \`SECRET_KEY\` dans \`.env\`. **Sauvegardez votre \`.env\` de manière sécurisée** — sans la \`SECRET_KEY\`, les configurations chiffrées sont irrécupérables.
        `,
      },
      {
        id: 'celery-tasks',
        title: 'Tâches planifiées (Celery)',
        roles: ['admin'],
        body: `
# Tâches planifiées — Celery Beat

Les tâches récurrentes sont exécutées par **Celery Beat** (planificateur) et **Celery Worker** (exécuteur).

## Tâches planifiées par défaut

| Tâche | Fréquence | Description |
|-------|-----------|-------------|
| Sync connecteurs actifs | Configurable par connecteur | Synchronise LDAP, EntraID, GLPI, Intune... |
| Vérification CVE | Quotidienne (2h du matin) | Interroge le NVD NIST pour les nouvelles CVE |
| Alertes expirations | Quotidienne | Détecte les contrats SLA et licences expirant bientôt |
| Notifications email CVE | À la détection | Envoie un email pour les CVE critiques |
| Rapports planifiés | Configurable (hebdo/mensuel) | Génère et envoie les rapports PDF/CSV |
| Nettoyage logs | Hebdomadaire | Archive les anciens logs d'audit |

## Monitoring des tâches

L'état des workers et des tâches est visible dans **Admin > État système** (menu "État système") :
- Statut Redis (connecté / déconnecté)
- Statut workers Celery (actif / inactif)
- Dernières tâches exécutées avec durée et résultat
- File d'attente en cours

## Redémarrage des workers

En cas de problème :
\`\`\`bash
docker compose restart celery_worker celery_beat
\`\`\`

## Logs Celery

\`\`\`bash
docker compose logs celery_worker --tail=100 -f
docker compose logs celery_beat --tail=50 -f
\`\`\`
        `,
      },
      {
        id: 'security',
        title: 'Sécurité & Authentification',
        roles: ['admin'],
        body: `
# Sécurité & Authentification

## Méthodes d'authentification disponibles

| Méthode | Configuration | Cas d'usage |
|---------|---------------|-------------|
| **Local** | Compte créé dans Admin > Utilisateurs | Comptes techniques, admin local |
| **LDAP / AD** | Connecteur LDAP actif | Annuaire on-prem, authentification AD |
| **EntraID / SSO** | Connecteur Entra actif | Microsoft 365, Azure AD, SSO d'entreprise |

### Ordre de priorité à la connexion

1. **Local** : si un compte existe avec ce mot de passe
2. **LDAP** : si l'auth locale échoue et qu'un connecteur LDAP est actif
3. **SSO Microsoft** : via le bouton dédié sur la page de connexion (flux OIDC séparé)

## Authentification à deux facteurs (2FA)

La 2FA TOTP (Google Authenticator, Authy...) est disponible pour les **comptes locaux uniquement**.

Configuration par l'utilisateur (Profil → Sécurité) :
1. Scanner le QR code avec une application TOTP
2. Saisir le code à 6 chiffres pour confirmer
3. La 2FA est active à la prochaine connexion

Les comptes LDAP et EntraID ne disposent pas de 2FA CMDB (la 2FA est gérée au niveau du fournisseur d'identité).

## Tokens API

Les tokens API permettent l'accès programmatique à l'API REST sans passer par le login interactif.

- Gestion dans **Mon profil → Tokens API** (token personnel) ou **Admin > Tokens** (vue globale admin)
- Portée configurable : lecture seule, lecture/écriture, admin
- Date d'expiration optionnelle
- Usage via l'en-tête HTTP : \`Authorization: Bearer <token>\`

## Gestion des sessions

- Les JWT expirent après **60 minutes** par défaut (configurable via \`ACCESS_TOKEN_EXPIRE_MINUTES\`)
- Pas de refresh token — reconnexion requise à expiration
- La déconnexion via l'UI invalide le token côté client (le token serveur expire naturellement)

## Audit des accès

Toutes les actions d'authentification (connexion, échec, déconnexion) sont tracées dans le **Journal d'audit** (Admin > Audit) avec l'IP source et l'user-agent.
        `,
      },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Filtre les sections et articles visibles pour un ensemble de slugs de rôles */
export function filterDocsForRoles(userRoles: string[]): DocSection[] {
  const isAdmin = userRoles.includes('admin')

  return DOCS
    .filter(s => s.roles.length === 0 || s.roles.some(r => userRoles.includes(r)))
    .map(s => ({
      ...s,
      articles: s.articles.filter(a => a.roles.length === 0 || a.roles.some(r => userRoles.includes(r))),
    }))
    .filter(s => s.articles.length > 0 || isAdmin)
}

/** Recherche textuelle dans titre + body */
export function searchDocs(sections: DocSection[], query: string): DocSection[] {
  const q = query.toLowerCase().trim()
  if (!q) return sections

  return sections
    .map(s => ({
      ...s,
      articles: s.articles.filter(
        a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q),
      ),
    }))
    .filter(s => s.articles.length > 0 || s.title.toLowerCase().includes(q))
}
