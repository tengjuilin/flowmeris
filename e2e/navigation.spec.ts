import { type Page, expect, test } from '@playwright/test';
import { importDesign, loadWells, waitForAutosave } from './helpers.ts';

/** A tab of the main tab bar (views have tabs of their own, e.g. the Gate view's settings). */
const tab = (page: Page, name: string) =>
  page.locator('[role="tablist"]:not([aria-label])').getByRole('tab', { name, exact: true });
const current = (page: Page) => page.locator('[role="tablist"]:not([aria-label]) [aria-selected="true"]');
const sample = (page: Page) => page.locator('.sample-list button.on .name');
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true });
const forward = (page: Page) => page.getByRole('button', { name: 'Forward', exact: true });

test('Back and Forward return to the tab and sample left, by button and Alt+←/→', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200, B01: 110 });
  await expect(back(page)).toBeDisabled();
  await expect(forward(page)).toBeDisabled();
  await expect(current(page)).toHaveText('Gate');

  // Gate (A01) → Tiles → open A02 in the Gate view → Statistics.
  await tab(page, 'Tiles').click();
  await page.getByRole('button', { name: 'Open A02 in the Gate view' }).click();
  await expect(sample(page)).toHaveText('A02');
  await tab(page, 'Statistics').click();
  await expect(back(page)).toHaveAttribute('title', 'Back to Gate (Alt+←)');

  await back(page).click();
  await expect(current(page)).toHaveText('Gate');
  await expect(sample(page)).toHaveText('A02');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(current(page)).toHaveText('Tiles');
  await expect(forward(page)).toHaveAttribute('title', 'Forward to Gate (Alt+→)');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(current(page)).toHaveText('Gate');
  await expect(sample(page)).toHaveText('A01');
  await expect(back(page)).toBeDisabled();

  await forward(page).click();
  await expect(current(page)).toHaveText('Tiles');
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(current(page)).toHaveText('Statistics');
  await expect(forward(page)).toBeDisabled();

  // Choosing another sample within a tab is not a step of its own.
  await tab(page, 'Gate').click();
  await page.locator('.sample-list button', { hasText: 'B01' }).click();
  await page.locator('.sample-list button', { hasText: 'A01' }).click();
  await back(page).click();
  await expect(current(page)).toHaveText('Statistics');

  // Alt+← in a text field moves the caret, not the tab.
  await tab(page, 'Metadata').click();
  const field = page.getByRole('textbox', { name: 'Well of A01', exact: true });
  await field.click();
  await field.press('Alt+ArrowLeft');
  await expect(current(page)).toHaveText('Metadata');
});

test('the workspace, tab and settings are restored after a reload', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200, B01: 110, B02: 220 });
  await importDesign(page, 'Well,Dose\nA1,1\nA2,10\nB1,1\nB2,10\n', 1);
  await tab(page, 'Statistics').click();
  const add = page.locator('.add-stat');
  await add.locator('label', { hasText: 'Channel' }).locator('select').selectOption('FL1-A');
  await page.getByRole('button', { name: 'Add statistic' }).click();
  await expect(page.locator('table.stats tbody tr').first()).toContainText('100');
  await waitForAutosave(page, 4);
  // The statistic is saved too (autosave runs 1 s after the last change).
  await page.waitForTimeout(1500);

  await page.reload();
  // Same tab and workspace. The app renders once the autosave is read and each sample's event data
  // found in browser storage, which takes a few seconds in Firefox on CI.
  await expect(current(page)).toHaveText('Statistics', { timeout: 20_000 });
  const rows = page.locator('table.stats tbody tr');
  await expect(rows).toHaveCount(4);
  // Event data is kept in the origin-private file system where the browser offers one (not in
  // Playwright's WebKit); then statistics are recomputed, else the samples are marked missing.
  const opfs = await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      for await (const _ of (root as unknown as { keys(): AsyncIterable<string> }).keys()) return true;
      return false;
    } catch {
      return false;
    }
  });
  if (opfs) {
    await expect(rows.first()).toContainText('100');
    await expect(rows.nth(1)).toContainText('200');
    await expect(page.locator('.badge.danger', { hasText: 'missing' })).toHaveCount(0);
  } else {
    await expect(page.locator('table.stats .badge.danger', { hasText: 'missing' })).toHaveCount(4);
  }
  await tab(page, 'Metadata').click();
  await expect(page.getByRole('textbox', { name: 'Dose of A02', exact: true })).toHaveValue('10');

  // Undo history starts fresh with the restored workspace.
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
});
