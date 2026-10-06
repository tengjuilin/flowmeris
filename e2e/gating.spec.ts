import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => resolve(here, '../fixtures', rel);

/** Expected count of a rectangle on data1.fcs, computed from the ISAC truth file for "Rectangle1". */
function truthCount(id: string): number {
  return readFileSync(fixture(`flowkit/gate_ref/truth/Results_${id}.txt`), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() === '1').length;
}

test('ingest an FCS file, draw a gate, see statistics', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Flow cytometry analysis/ })).toBeVisible();

  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles([fixture('flowkit/gate_ref/data1.fcs')]);
  await expect(page.getByText('All events')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('13,367').first()).toBeVisible();

  // Axes SSC-H × FL1-H (linear, T = $PnR = 1024), as in the ISAC "Rectangle1" compliance gate.
  const pickers = page.locator('.axis-pickers select');
  await pickers.nth(0).selectOption('SSC-H');
  await pickers.nth(1).selectOption('FL1-H');
  await page.getByLabel('Scale').nth(1).selectOption('linear');

  await page.getByRole('button', { name: 'Rectangle' }).click();
  const svg = page.locator('svg.plot-overlay');
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.pop-row', { hasText: 'Gate 1' })).toBeVisible();

  // Type the exact Rectangle1 bounds in display units: flin(x) = x / 1024.
  const set = async (label: string, v: number) => {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(String(v / 1024));
    await input.press('Enter');
  };
  await set('SSC-H min', 20);
  await set('SSC-H max', 80);
  await set('FL1-H min', 70);
  await set('FL1-H max', 200);

  const expected = truthCount('Rectangle1');
  await expect(page.locator('.pop-row', { hasText: 'Gate 1' })).toContainText(
    expected.toLocaleString('en-US'),
  );

  await page.getByRole('tab', { name: 'Statistics' }).click();
  const row = page.locator('table.stats tbody tr').first();
  await expect(row).toContainText('13,367');
  await expect(row).toContainText(expected.toLocaleString('en-US'));
});

test('gating path shows each step and backgating for one sample', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles([fixture('flowkit/gate_ref/data1.fcs')]);
  await expect(page.getByText('All events')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Rectangle' }).click();
  const svg = page.locator('svg.plot-overlay');
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.pop-row', { hasText: 'Gate 1' })).toBeVisible();
  await page.locator('.pop-row', { hasText: 'Gate 1' }).getByRole('button', { name: 'Gate 1' }).click();

  await page.getByRole('tab', { name: 'Gating path' }).click();
  await expect(page.locator('.path-card')).toHaveCount(2);
  await expect(page.locator('.path-arrow')).toContainText('Gate 1');
  await expect(page.locator('.path-card').first().locator('.gate.focus').first()).toBeAttached();

  await page.getByLabel('Backgating').check();
  await expect(page.locator('.path-card').first().locator('canvas.plot-raster.faded')).toHaveCount(1);

  await page.getByRole('button', { name: 'Tree' }).click();
  // Gate 1 has no gates of its own, so the tree shows one plot (All events) and Gate 1 as a chip.
  await expect(page.locator('.path-tree .path-card')).toHaveCount(1);
  await expect(page.locator('.path-tree .path-chip.on')).toContainText('Gate 1');
});

test('privacy: production build declares a restrictive CSP', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self'");
});
