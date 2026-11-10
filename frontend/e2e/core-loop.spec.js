import { test, expect } from '@playwright/test';

/**
 * The one loop that must never break:
 *   sign up → type a topic → sources-first graph renders → click a concept →
 *   details (image/facts) appear → save → it's in the Library → share link opens logged-out.
 * Hits real Wikipedia/Wikidata through the backend.
 */
test('sign up, map a topic, inspect, save, share', async ({ page, browser }) => {
  const id = Date.now().toString(36);
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Explorer');
  await page.getByLabel('Username').fill(`e2e_${id}`);
  await page.getByLabel('Email').fill(`e2e_${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('Explore-2026a!');
  await page.getByLabel('Confirm password').fill('Explore-2026a!');
  await page.getByRole('button', { name: /create|sign up|register/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|explore)/);

  // Map a topic — the graph must render from sources before any AI finishes.
  await page.goto('/explore?topic=Photosynthesis');
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible({ timeout: 45_000 });
  expect(await nodes.count()).toBeGreaterThan(4);
  await expect(page.getByText(/Verified \(Wikidata\)/)).toBeVisible();

  // Click a concept → inspector with details.
  await nodes.nth(1).click();
  const inspector = page.getByRole('complementary', { name: /Details for/ });
  await expect(inspector).toBeVisible();

  // Explicit save → appears in the library.
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByRole('button', { name: /^Saved$/ })).toBeVisible();
  await page.goto('/graphs');
  await expect(page.getByText('Photosynthesis').first()).toBeVisible();

  // Share → link opens for a logged-out visitor.
  await page.getByRole('button', { name: /share/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Create share link/ }).click();
  const urlBox = dialog.locator('#share-url');
  await expect(urlBox).toHaveValue(/\/g\/[A-Za-z0-9_-]{8,}/);
  const link = await urlBox.inputValue();

  const anon = await browser.newContext();
  const visitor = await anon.newPage();
  await visitor.goto(link);
  await expect(visitor.locator('.react-flow__node').first()).toBeVisible();
  await expect(visitor.getByText(/read-only/)).toBeVisible();
  await anon.close();
});

test('anonymous trial renders a graph without an account', async ({ page }) => {
  await page.goto('/try?topic=Stoicism');
  // Either the graph renders, or (after QUOTA_TRY_PER_IP maps today from this IP) the limit screen does.
  const graph = page.locator('.react-flow__node').first();
  const limit = page.getByText("That's today's free maps");
  await expect(graph.or(limit)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('link', { name: /free account/i }).first()).toBeVisible();
});
