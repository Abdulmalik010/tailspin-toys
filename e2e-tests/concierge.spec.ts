import { test, expect } from '@playwright/test';
import type { CatalogExport } from '../db/export-catalog';

const stubbedCatalog: CatalogExport = {
  source: 'Tailspin Toys crowdfunding catalog',
  note: 'Stubbed catalog for the concierge browser test.',
  gameCount: 2,
  categories: ['Puzzle', 'Strategy'],
  publishers: ['CodeForge Studios', 'DevMasters Inc.'],
  games: [
    {
      id: 1,
      title: 'Stubbed Strategy',
      description: 'A strategy game for the concierge browser test.',
      category: 'Strategy',
      publisher: 'CodeForge Studios',
      starRating: 4.9,
      ratingLabel: '★★★★★',
    },
    {
      id: 2,
      title: 'Stubbed Puzzle',
      description: 'A puzzle game for the concierge browser test.',
      category: 'Puzzle',
      publisher: 'DevMasters Inc.',
      starRating: 4.5,
      ratingLabel: '★★★★½',
    },
  ],
};

test.describe('Backer Concierge', () => {
  test('lets a backer ask a catalog question and see grounded recommendations', async ({ page }) => {
    let catalogRequests = 0;
    await page.route('**/concierge-catalog.json', async (route) => {
      catalogRequests++;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(stubbedCatalog) });
    });

    await test.step('Open the concierge from the main navigation', async () => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Toggle menu' }).click();
      await page.getByTestId('nav-concierge').click();
      await expect(page).toHaveURL('/concierge');
    });

    await test.step('Ask for the highest-rated strategy game', async () => {
      await page.getByLabel('What kind of game are you looking for?').fill('What is the highest-rated strategy game?');
      await page.getByRole('button', { name: 'Ask the concierge' }).click();

      await expect(page.getByTestId('concierge-status')).toHaveText('Answer ready.');
      await expect(page.getByTestId('concierge-answer-message')).toContainText('highest-rated Strategy game');
      await expect(page.getByTestId('concierge-game-link')).toHaveText('Stubbed Strategy');
      expect(catalogRequests).toBe(1);
    });
  });
});
