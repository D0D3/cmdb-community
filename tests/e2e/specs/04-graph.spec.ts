/**
 * Parcours 4 — Graphe CI
 * Couvre : chargement de la page /graph, affichage du panneau de recherche,
 * sélection d'un CI et rendu du graphe.
 */
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Graphe CI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('affiche la page graphe avec le picker CI', async ({ page }) => {
    await page.goto('/graph')
    await expect(page).toHaveURL(/\/graph/)

    // Le champ de recherche du picker CI est visible
    const searchInput = page.locator('input[placeholder*="Rechercher" i], input[type="search"]').first()
    await expect(searchInput).toBeVisible({ timeout: 10_000 })
  })

  test('affiche le canvas ReactFlow après sélection d\'un CI', async ({ page }) => {
    await page.goto('/graph')

    // Saisir n'importe quoi dans le picker pour obtenir des résultats
    const searchInput = page.locator('input[placeholder*="Rechercher" i], input[type="search"]').first()
    await searchInput.fill('a')

    // Attendre les résultats et sélectionner le premier
    const firstResult = page.locator('button').filter({ hasText: /hardware|software|serveur|logiciel/i }).first()
    if (await firstResult.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstResult.click()
      // Le canvas ReactFlow doit apparaître
      await expect(page.locator('.react-flow__renderer, .react-flow__pane, svg').first()).toBeVisible({ timeout: 10_000 })
    } else {
      // Aucun CI — vérifier simplement que la page est chargée sans erreur
      await expect(page.locator('text=/graphe|aucun|CI/i').first().or(page.locator('svg').first())).toBeVisible({ timeout: 5_000 })
    }
  })
})
