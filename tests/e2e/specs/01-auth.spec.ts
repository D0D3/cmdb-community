/**
 * Parcours 1 — Authentification
 * Couvre : login email/password, redirection dashboard, logout.
 */
import { test, expect } from '@playwright/test'
import { loginAs, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers'

test.describe('Authentification', () => {
  test('affiche la page de login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[name="username"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toContainText('Se connecter')
  })

  test('redirige vers /login sur accès non authentifié', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('refuse un mot de passe invalide', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[name="username"]').fill(ADMIN_EMAIL)
    await page.locator('input[name="password"]').fill('mauvais-mot-de-passe-xyz')
    await page.locator('button[type="submit"]').click()
    // L'URL reste /login et un message d'erreur apparaît
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('text=/Identifiant|Mot de passe|incorrect|invalide/i')).toBeVisible({ timeout: 5_000 })
  })

  test('login valide → dashboard → logout', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)

    // Dashboard chargé
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('body')).not.toContainText('Se connecter')

    // Bouton logout dans la Topbar (title="Déconnexion")
    await page.locator('button[title="Déconnexion"]').click()
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })
})
