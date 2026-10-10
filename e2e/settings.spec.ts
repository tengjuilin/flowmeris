import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => resolve(here, '../fixtures', rel);

async function open(page: Page) {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles([fixture('flowkit/gate_ref/data1.fcs')]);
  await expect(page.getByText('All events')).toBeVisible({ timeout: 20_000 });
  // A child population, so there are two populations to move between.
  const b = (await page.locator('svg.plot-overlay').boundingBox())!;
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.6, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.pop-row', { hasText: 'Gate 1' })).toBeVisible();
}

const tab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: 'Gate settings' }).getByRole('tab', { name }).click();
const visit = (page: Page, pop: string) =>
  page.locator('.pop-row', { hasText: pop }).locator('.pop-name').click();
const pointSize = (page: Page) => page.getByLabel('Point size (px)');

test('carrying settings applies them to the population opened next, not on toggling', async ({ page }) => {
  await open(page);
  await visit(page, 'Gate 1');
  await visit(page, 'All events');
  await tab(page, 'Settings');
  await page.getByLabel('Carry settings to next populations').uncheck();
  await tab(page, 'Figure');
  await pointSize(page).fill('2');
  await visit(page, 'Gate 1');
  await expect(pointSize(page)).toHaveValue('3');

  // Ticking the toggle changes nothing by itself...
  await tab(page, 'Settings');
  await page.getByLabel('Carry settings to next populations').check();
  await tab(page, 'Figure');
  await expect(pointSize(page)).toHaveValue('3');
  // ...the population opened next takes the settings of the one left.
  await pointSize(page).fill('4');
  await visit(page, 'All events');
  await expect(pointSize(page)).toHaveValue('4');
});

test('apply and reset buttons in the Settings tab', async ({ page }) => {
  await open(page);
  await visit(page, 'Gate 1');
  // Opening a population saves no plot; an edit does. Apply reaches only saved plots.
  await tab(page, 'Figure');
  await pointSize(page).fill('5');
  await pointSize(page).press('Enter');
  await pointSize(page).fill('3');
  await pointSize(page).press('Enter');
  await visit(page, 'All events');
  await tab(page, 'Settings');
  await page.getByLabel('Carry settings to next populations').uncheck();
  const applyAll = page.getByRole('button', {
    name: /Give every population's plot this plot's settings now/,
  });
  const resetThis = page.getByRole('button', { name: /Reset the settings of this plot/ });
  await expect(applyAll).toBeDisabled();
  await expect(resetThis).toBeDisabled();

  await tab(page, 'Figure');
  await pointSize(page).fill('2');
  await tab(page, 'Settings');
  await expect(resetThis).toBeEnabled();
  await applyAll.click();
  await expect(applyAll).toBeDisabled();
  await visit(page, 'Gate 1');
  await tab(page, 'Figure');
  await expect(pointSize(page)).toHaveValue('2');

  // The header reset clears only the open panel's settings.
  await page.getByRole('button', { name: 'Reset the settings in this panel' }).click();
  await expect(pointSize(page)).toHaveValue('3');
  await visit(page, 'All events');
  await expect(pointSize(page)).toHaveValue('2');
  await tab(page, 'Settings');
  await resetThis.click();
  await tab(page, 'Figure');
  await expect(pointSize(page)).toHaveValue('3');
});

test('opening a population saves its plot only with the first edit, in one undo step', async ({ page }) => {
  await open(page);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toHaveAttribute('title', /^Undo: Add gate/);
  await visit(page, 'Gate 1');
  await tab(page, 'Figure');
  await expect(pointSize(page)).toHaveValue('3');
  await expect(undo).toHaveAttribute('title', /^Undo: Add gate/);

  await pointSize(page).fill('5');
  await pointSize(page).press('Enter');
  await expect(undo).toHaveAttribute('title', /^Undo: Add plot and /);
  await undo.click();
  await expect(undo).toHaveAttribute('title', /^Undo: Add gate/);
  await expect(pointSize(page)).toHaveValue('3');
});
