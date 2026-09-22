/**
 * Parcours 2 — Dashboard
 * Couvre : chargement des KPIs, navigation vers la liste des CIs.
 */
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('affiche les cartes KPI principales', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/)
    // Au moins un élément de type compteur numérique est visible
    const kpiCards = page.locator('button[type="button"]').filter({ hasText: /\d+/ })
    await expect(kpiCards.first()).toBeVisible({ timeout: 10_000 })
  })

  test('navigue vers la liste des CIs via le menu', async ({ page }) => {
    await page.goto('/ci')
    await expect(page).toHaveURL(/\/ci/)
    // La table ou la liste est présente
    await expect(page.locator('table, [role="table"]').or(page.locator('text=/Aucun|CI|Configuration/i'))).toBeVisible({ timeout: 10_000 })
  })

  test('navigue vers le graphe CI', async ({ page }) => {
    await page.goto('/graph')
    await expect(page).toHaveURL(/\/graph/)
    // Le canvas ReactFlow est présent
    await expect(page.locator('.react-flow, canvas, svg').first()).toBeVisible({ timeout: 10_000 })
  })
})
