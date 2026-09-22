#!/usr/bin/env bash
# Lance les tests E2E Playwright dans un conteneur Docker isolé.
#
# Usage :
#   ./run-e2e.sh                          # cible prod par défaut
#   BASE_URL=http://localhost:8000 ./run-e2e.sh   # cible locale
#
# Variables d'environnement :
#   BASE_URL           URL de l'application (défaut : https://cmdb.capybara.example.com)
#   E2E_ADMIN_EMAIL    Email du compte admin de test (défaut : admin@example.com)
#   E2E_ADMIN_PASSWORD Mot de passe du compte admin (OBLIGATOIRE)

set -euo pipefail

BASE_URL="${BASE_URL:-https://cmdb.capybara.example.com}"
E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.com}"

if [[ -z "${E2E_ADMIN_PASSWORD:-}" ]]; then
  echo "❌  Erreur : E2E_ADMIN_PASSWORD est requis."
  echo "    Exemple : E2E_ADMIN_PASSWORD=monmotdepasse ./run-e2e.sh"
  exit 1
fi

IMAGE="cmdb-e2e:latest"

echo "🔨 Build de l'image E2E…"
docker build -t "$IMAGE" ./tests/e2e

echo "🚀 Lancement des tests contre $BASE_URL…"
docker run --rm \
  -e BASE_URL="$BASE_URL" \
  -e E2E_ADMIN_EMAIL="$E2E_ADMIN_EMAIL" \
  -e E2E_ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD" \
  -v "$(pwd)/tests/e2e/report:/e2e/report" \
  "$IMAGE" "$@"

echo "✅ Tests terminés. Rapport disponible dans tests/e2e/report/"
