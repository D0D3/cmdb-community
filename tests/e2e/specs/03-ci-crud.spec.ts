/**
 * Parcours 3 — Inventaire CI (CRUD)
 * Couvre : création d'un CI hardware serveur, vérification dans la liste, suppression.
 */
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

const CI_NAME = `E2E-Serveur-${Date.now()}`

test.describe('CI CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('crée un CI hardware et le retrouve dans la liste', async ({ page }) => {
    await page.goto('/ci/new')
    await expect(page).toHaveURL(/\/ci\/new/)

    // Choisir le type "Hardware"
    const hwBtn = page.locator('button[type="button"]').filter({ hasText: /hardware|matériel/i }).first()
    if (await hwBtn.isVisible()) {
      await hwBtn.click()
    }

    // Nom
    await page.locator('input[name="name"]').fill(CI_NAME)

    // Sous-type hardware → serveur
    const hwSubtype = page.locator('select[name="hw_subtype"]')
    if (await hwSubtype.isVisible()) {
      await hwSubtype.selectOption('server')
    }

    // Status : en service
    await page.locator('select[name="status"]').selectOption('in_service')

    // Criticité : faible
    await page.locator('select[name="criticality"]').selectOption('low')

    // Soumettre
    await page.locator('button[type="submit"]').click()

    // Après création, redirigé vers la fiche ou la liste
    await expect(page).toHaveURL(/\/ci\/\d+|\/ci$/, { timeout: 10_000 })
  })

  test('le CI créé apparaît dans la liste', async ({ page }) => {
    await page.goto('/ci')
    // Chercher dans la liste (peut nécessiter de chercher par nom)
    const searchInput = page.locator('input[placeholder*="Rechercher" i], input[type="search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill(CI_NAME)
      await page.waitForTimeout(500)
    }
    await expect(page.locator(`text=${CI_NAME}`)).toBeVisible({ timeout: 10_000 })
  })

  test('supprime le CI créé', async ({ page }) => {
    await page.goto('/ci')

    const searchInput = page.locator('input[placeholder*="Rechercher" i], input[type="search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill(CI_NAME)
      await page.waitForTimeout(500)
    }

    // Cliquer sur la ligne pour ouvrir la fiche
    await page.locator(`text=${CI_NAME}`).first().click()
    await expect(page).toHaveURL(/\/ci\/\d+/, { timeout: 8_000 })

    // Chercher un bouton de suppression
    const deleteBtn = page.locator('button').filter({ hasText: /supprimer|delete/i }).first()
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 })
    await deleteBtn.click()

    // Confirmer la suppression si une modale apparaît
    const confirmBtn = page.locator('button').filter({ hasText: /confirmer|confirm|supprimer/i }).last()
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    // Retour sur la liste
    await expect(page).toHaveURL(/\/ci/, { timeout: 8_000 })
    await expect(page.locator(`text=${CI_NAME}`)).not.toBeVisible({ timeout: 5_000 })
  })
})
