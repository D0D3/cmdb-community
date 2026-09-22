# UI/UX — Capybara CMDB — Design System & Parcours

**Voir aussi :** [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
**Stack :** React 18 + TypeScript + Tailwind CSS + shadcn/ui (Radix) + Lucide Icons + TanStack Query/Table

---

## 1. Principes directeurs

1. **Densité maîtrisée** : public principalement IT — tableaux denses et raccourcis clavier,
   lisibles pour le rôle lecture seule.
2. **L'échéance est l'information reine** : badge couleur + icône + texte partout sur les CI.
3. **4 états systématiques** sur chaque vue : loading (skeleton), vide (explication + CTA),
   erreur (message + action), succès (toast).
4. **Accessible WCAG 2.1 AA** : contraste ≥ 4.5:1, navigation clavier, labels explicites.
5. **Rôle = visibilité** : sidebar, boutons d'action, sections d'admin filtrés par rôle.

---

## 2. Structure de l'application

### Topbar
```
┌──────────────────────────────────────────────────────────────┐
│ [Logo]  CMDB    [🔍 Ctrl+K]      [↻]  [🔔 alertes]  [Avatar] │
└──────────────────────────────────────────────────────────────┘
           ↓ (après ingestion CVE manuelle — disparaît après 2 min 30 s)
┌──────────────────────────────────────────────────────────────┐
│ ✓  Ingestion terminée — 42 CVE analysées, 7 nouvelles liaisons│
└──────────────────────────────────────────────────────────────┘
```
- **Logo** : uploadable, utilisé aussi comme favicon (multi-résolutions auto-générées).
- **Recherche globale `Ctrl+K`** : command palette — CI par nom/série/produit, navigation directe.
- **Icône ↻ (spinning)** : visible uniquement pendant une ingestion CVE en cours (`IngestContext`).
- **Bannière verte "Ingestion terminée"** : s'affiche juste sous la topbar à la fin d'une sync
  CVE déclenchée manuellement. Indique le nombre de CVE analysées et de nouvelles liaisons
  CI ↔ CVE créées. Disparaît automatiquement après **2 min 30 s**. Réapparaît à chaque nouveau
  déclenchement manuel. Non affichée au chargement de page si aucune sync récente.
- **Cloche** : alertes non lues (CVE, échéances, MAJ app), badge de comptage.
- **Avatar** : photo de profil uploadable, clic → `/profile` ; bouton déconnexion intégré.

### Sidebar — 6 groupes accordéon

```
┌──────────────┐
│ ⬡ Tableau de bord              │ ← groupe 1
│   • Vue d'ensemble             │
│   • Opérationnel               │
│   • Exécutif                   │
│   • Qualité des données        │
│                                │
│ ⬡ Inventaire                   │ ← groupe 2
│   • Matériel                   │
│   • Logiciels                  │
│   • Parc Virtuel               │
│   • Relations / Graphe         │
│   • Key Users                  │
│   • Échéances                  │
│                                │
│ ⬡ Exploitation                 │ ← groupe 3
│   • Incidents                  │
│   • Changements / RFC          │
│   • Maintenances               │
│   • Vulnérabilités             │
│   • Alertes                    │
│                                │
│ ⬡ Contrats & Licences          │ ← groupe 4
│   • SLA                        │
│   • Licences                   │
│                                │
│ ⬡ Administration               │ ← groupe 5
│   • Utilisateurs & Rôles       │
│   • Connecteurs                │
│   • Paramètres globaux         │
│   • Personnalisation (thème)   │
│   • Tokens API                 │
│   • Rapports                   │
│   • Sauvegardes                │
│   • Mise à jour                │
│                                │
│ ─────────────────────          │
│ Documentation                  │
└──────────────────────────────┘
```

- **Mode mini** : sidebar rétractable → icônes uniquement + popovers au survol.
- Entrées filtrées par rôle.

### Plan complet des écrans

| Écran | Route | Rôles |
|-------|-------|-------|
| Vue d'ensemble | `/` | tous |
| Dashboard opérationnel | `/dashboard/ops` | it-*, admin |
| Dashboard exécutif | `/executive` | admin |
| Qualité des données | `/quality` | admin |
| Matériel (liste) | `/hardware` | tous |
| Logiciels (liste) | `/software` | tous |
| Parc Virtuel | `/virtual` | it-*, admin |
| Fiche CI | `/ci/:id` | tous |
| Graphe CI | `/ci/:id/graph` | tous |
| Relations | `/relations` | tous |
| Key Users | `/keyusers` | tous |
| Vue Échéances | `/deadlines` | tous |
| Incidents | `/incidents` | it-*, admin |
| Changements RFC | `/changes` | it-*, admin |
| Maintenances (calendrier) | `/maintenance` | it-*, admin |
| Vulnérabilités | `/vulnerabilities` | it-*, admin |
| Centre d'alertes | `/alerts` | tous |
| SLA | `/sla` | it-*, admin |
| Licences | `/licenses` | it-*, admin |
| Utilisateurs & Rôles | `/admin/users` | admin |
| Matrice des droits | `/admin/permissions` | admin |
| Connecteurs | `/admin/connectors` | admin |
| Paramètres globaux | `/admin/settings` | admin |
| Personnalisation | `/admin/branding` | admin |
| Tokens API | `/admin/tokens` | admin |
| Rapports | `/admin/reports` | admin |
| Sauvegardes | `/admin/backup` | admin |
| Profil utilisateur | `/profile` | tous |
| Documentation | `/docs` | tous |

---

## 3. Thème personnalisable

Le thème est piloté par **variables CSS injectées au runtime** depuis `settings` en base.

```css
:root {
  --brand-primary: 222 84% 48%;
  --brand-primary-foreground: 0 0% 100%;
  --brand-accent: …;
  --radius: 0.5rem;
}
```

- Variables consommées par Tailwind/shadcn — pas de rebuild pour changer les couleurs.
- **Logo** : upload PNG/SVG → favicon auto-généré (32/180/512 px). URL cache-bustée par `updated_at`.
- **Fond de page connexion** : mock dynamique (sidebar + cards floutés), activable depuis
  Admin > Personnalisation. Overlay 82%, logo centré h-48.
- **Mode sombre** : fourni d'office, `prefers-color-scheme` + bascule manuelle.
- **Garde-fou accessibilité** : ratio de contraste vérifié à la sauvegarde, avertissement si < 4.5:1.
- Aperçu en direct dans l'admin avant publication.

> **Bug connu (M24) :** les couleurs personnalisées ne s'enregistrent pas correctement — correctif dans M-RELEASE.

---

## 4. Composants métier clés

### Badge d'échéance (omniprésent)
| État | Style | Règle |
|------|-------|-------|
| 🔴 `Expiré` | rouge + icône alerte | date passée |
| 🟠 `J-30` | orange + icône horloge | ≤ 30 jours |
| 🟡 `J-90` | jaune + icône calendrier | ≤ 90 jours |
| 🟢 `OK` | vert discret | > 90 jours |
| ⚪ `Non renseigné` | gris + pointillé | invite à compléter |

Toujours icône + texte + couleur (jamais couleur seule). Tooltip avec la date exacte.

### Badge sévérité CVE
`CRITICAL` rouge plein / `HIGH` orange / `MEDIUM` jaune / `LOW` gris — score CVSS affiché.
Marqueur **KEV** (exploitée activement, CISA) : bordure épaisse + icône éclair.

### Avatar utilisateur
- Photo de profil uploadable (base64 en DB).
- Endpoint public `GET /users/{id}/avatar` avec cache-buster (`?v=updated_at`).
- Composant `Avatar` réutilisable (initiales si pas de photo).

### DataTable CI (TanStack Table)
- Pagination keyset serveur, tri serveur, 50 lignes par défaut.
- Filtres facettés (statut, type, équipe, criticité, état d'échéance).
- **Sélection multiple → actions de masse** : changer statut, assigner, exporter, supprimer.
- Colonnes configurables, persistées par utilisateur.
- Ligne cliquable → fiche CI ; survol → aperçu rapide (popover).

### Fiche CI
- En-tête : nom, type, sous-type, statut (workflow cycle de vie), criticité, badges d'échéance.
- Onglet **Général** : IP, hôte, intégrateur, leasing, affectation, équipe.
- Onglet **Relations** : liste typée + graphe CI jusqu'à 3 niveaux (5 niveaux en M48).
- Onglet **Échéances** : toutes les dates avec badge + bouton "créer une maintenance".
- Onglet **CVE** (software) : CVE matchées, statut triage, badge KEV.
- Onglet **Incidents** : incidents liés, timeline des actions, lien ticket externe.
- Onglet **Key Users** (software) : référents métier associés.
- Onglet **Historique** : audit trail lisible ("Marie a changé le statut le …").

### Graphe CI
- Vue relations depuis un CI, nœuds colorés par type, arêtes typées.
- 3 niveaux au MVP (élargissement par clic sur nœud).
- Ajout/suppression de relations depuis le graphe directement.
- *(M48 : extension à 5 niveaux, vue étoile, élargissement par niveau sans zoom)*

### Calendrier des maintenances
- Vue mois (défaut) / semaine / liste. Pastilles par type.
- Clic → détail + "Marquer comme réalisée" → log + recalcul occurrence.
- Récurrence via constructeur simple (RRULE masqué).
- *(M51 : sync avec calendrier M365/Outlook via Microsoft Graph)*

### Dashboard Exécutif
- Score de gouvernance global (0–100).
- 4 piliers : disponibilité, sécurité, conformité, obsolescence.
- Recommandations automatiques priorisées.
- KPIs : CI actifs, incidents ouverts, CVE critiques, licences en dépassement.

### Dashboard Vulnérabilités
- CVE ouvertes par sévérité (donut), CI les plus exposés, tendance 30 j, flux KEV en évidence.
- Triage : ouvert / pris en compte / corrigé / non affecté.
- Bouton "créer ticket GLPI" depuis une CVE.

### Admin — Utilisateurs (`/admin/users`)
- Liste paginée avec colonnes : Utilisateur, Rôles, Source, Dernière connexion, Statut, Actions.
- Colonne **Source** : `local` / `entra` / `ldap` / `saml` — les boutons "Reset MDP" et
  "Déconnexion" sont masqués ou désactivés pour les comptes non locaux.
- **Création locale** : formulaire inline email + nom + mot de passe + rôle.
- **Import depuis un annuaire** *(M54)* : bouton "Importer depuis un annuaire" ouvre un modal en 3 étapes :
  1. Sélection du connecteur EntraID ou LDAP/AD configuré (auto-sélectionné si un seul).
  2. Recherche temps réel (debounce 400 ms, min. 2 caractères) dans l'annuaire distant — les
     utilisateurs déjà présents dans le CMDB apparaissent grisés avec badge "Existant".
  3. Sélection multiple + choix du rôle CMDB → bouton "Importer N utilisateurs" → résumé
     (X créés, Y mis à jour). Aucune sync globale déclenchée, import unitaire uniquement.

---

## 5. Parcours critiques

1. **"Quel est l'état de X ?"** : `Ctrl+K` → frappe → fiche CI. Cible < 5 s.
2. **Triage CVE du matin** : Dashboard Vulnérabilités → filtre CRITICAL+KEV → fiche CI →
   marquer "pris en compte" → créer ticket GLPI. Cible < 2 min par CVE.
3. **Revue mensuelle des échéances** : /deadlines trié par urgence → export CSV → actions groupées.
4. **Saisie d'un nouveau CI** : formulaire avec champs minimaux (nom, type, série), le reste
   complétable plus tard — la friction de saisie est l'ennemi de l'adoption.
5. **Onboarding admin J1** : assistant premier lancement → compte admin → connexion annuaire →
   thème/logo → premier import CSV. Cible : CMDB utilisable en < 30 min.

---

## 6. Documentation intégrée par rôle

- Entrée "Documentation" dans la sidebar : articles Markdown embarqués, versionnés avec le code.
- **Tous les rôles** : manuel utilisateur.
- **Admin** : + manuel technique (installation, API, connecteurs, sauvegardes, restauration).
- Rendu `react-markdown`, toggle utilisateur/technique, recherche plein texte.
- Liens contextuels "?" dans l'UI vers la section concernée.
- Article "Plans & modules disponibles" dans Documentation > Prise en main.

---

## 7. Responsive & raccourcis

- Desktop d'abord (usage IT majoritaire) ; consultation fiche CI, dashboards et alertes
  lisibles sur mobile (≥ 375 px) — adaptation tablette/mobile à finaliser (M-RELEASE).
- Raccourcis : `Ctrl+K` recherche, `g h` matériel, `g s` logiciels, `g v` vulnérabilités,
  `n` nouveau CI (selon rôle), `?` aide raccourcis.

---

## 8. Checklist de validation UI/UX

- [x] Tokens design system branchés sur variables CSS runtime
- [ ] Garde-fou contraste thème personnalisé — bug M24 à corriger
- [x] 4 états (loading/vide/erreur/succès) sur les écrans principaux
- [x] Navigation clavier sur les 5 parcours critiques
- [x] DataTable pagination serveur fluide
- [x] Favicon généré depuis le logo uploadé
- [x] Mode sombre avec thème personnalisé
- [x] Sidebar 6 groupes accordéon + mode mini
- [x] Contrôle d'accès UI (canWrite/canDelete via AuthContext)
- [x] Badge Superadmin masqué dans la liste utilisateurs standard
- [x] Bannière ingestion CVE (IngestContext) — disparition auto 2 min 30 s
- [x] Import unitaire depuis annuaire EntraID/LDAP (modal recherche + sélection + rôle)
- [ ] Tests E2E Playwright sur les 5 parcours critiques *(M-RELEASE)*
- [ ] Adaptation responsive mobile complète *(M-RELEASE)*
- [ ] Fix bug branding couleurs *(M-RELEASE)*
