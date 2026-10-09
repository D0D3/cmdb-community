# Contribuer à Capybara CMDB

Merci de votre intérêt pour Capybara CMDB Community ! Ce projet est jeune et toute contribution est bienvenue : rapport de bug, correction, nouvelle fonctionnalité, documentation, traduction.

## Signaler un bug

Ouvrez une [issue GitHub](../../issues) avec :
- la version (`GET /api/version` ou pied de page de la sidebar),
- les étapes de reproduction,
- le comportement observé vs attendu,
- les logs pertinents (`docker compose logs api --tail=100`).

## Proposer une fonctionnalité

Ouvrez une issue avant de commencer à coder, pour valider l'approche ensemble et éviter le travail perdu.

## Développement local

```bash
git clone https://github.com/D0D3/cmdb-community.git
cd cmdb-community
cp .env.example .env   # renseignez les valeurs obligatoires
docker compose build
docker compose up -d
docker compose exec api alembic upgrade head
```

### Backend (FastAPI / Python 3.12)

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend (React / Vite / TypeScript)

```bash
cd frontend
npm install
npm run dev
```

### Tests end-to-end (Playwright)

```bash
./run-e2e.sh
```

## Pull requests

- Une PR = un sujet. Évitez de mélanger plusieurs changements sans rapport.
- Décrivez le **pourquoi** du changement, pas seulement le quoi.
- Les migrations Alembic doivent être réversibles (`upgrade`/`downgrade`).
- Pas de secret, de domaine ou de nom de client réel dans le code, les commentaires ou les fichiers d'exemple.

## Style de code

- Backend : suivez le style déjà en place dans `backend/app/` (FastAPI, SQLAlchemy 2.0, Pydantic).
- Frontend : TypeScript strict, composants fonctionnels, Tailwind CSS.
