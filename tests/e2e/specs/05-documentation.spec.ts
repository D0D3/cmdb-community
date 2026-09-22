/**
 * Parcours 5 — Documentation intégrée
 * Couvre : chargement de /docs, affichage des sections, navigation vers un article,
 * et fonctionnalité de recherche.
 */
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Documentation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('affiche la liste des sections', async ({ page }) => {
    await page.goto('/docs')
    await expect(page).toHaveURL(/\/docs/)

    // Au moins une section "Prise en main" est visible
    await expect(page.locator('text=Prise en main')).toBeVisible({ timeout: 10_000 })
  })

  test('ouvre un article et affiche son contenu Markdown', async ({ page }) => {
    await page.goto('/docs')

    // Cliquer sur le premier article disponible
    const firstArticle = page.locator('button').filter({ hasText: /qu'est-ce que cmdb|navigation|prise en main/i }).first()
    await expect(firstArticle).toBeVisible({ timeout: 8_000 })
    await firstArticle.click()

    // Un contenu Markdown est rendu (paragraphe ou titre)
    await expect(page.locator('h1, h2, p').first()).toBeVisible({ timeout: 5_000 })
  })

  test('la recherche filtre les articles', async ({ page }) => {
    await page.goto('/docs')

    const searchInput = page.locator('input[placeholder*="Rechercher" i], input[type="search"]').first()
    await expect(searchInput).toBeVisible({ timeout: 8_000 })

    await searchInput.fill('CI')
    // Des résultats liés à "CI" / "Inventaire" doivent apparaître
    await expect(page.locator('text=/CI|Inventaire|configuration/i').first()).toBeVisible({ timeout: 5_000 })
  })
})
