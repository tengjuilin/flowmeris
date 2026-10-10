import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import { loadWells, waitForAutosave } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => resolve(here, '../fixtures', rel);

/** A tab of the main tab bar (views have tabs of their own, e.g. the Gate view's settings). */
const tab = (page: Page, name: string) =>
  page.locator('[role="tablist"]:not([aria-label])').getByRole('tab', { name, exact: true });
const slider = (page: Page) => page.getByRole('slider', { name: 'Plot size' });
/** Number of grid tracks in an element's `grid-template-columns`. */
const tracks = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

/** Set a range input to its min or max, as dragging it to the end does. */
async function slideTo(page: Page, end: 'min' | 'max') {
  const s = slider(page);
  const v = await s.getAttribute(end);
  await s.fill(v!);
}

/** Draw a rectangle gate across the given fraction of the Gate view's plot. */
async function drawGate(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const b = (await page.locator('svg.plot-overlay').boundingBox())!;
  await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 8 });
  await page.mouse.up();
}

test('tiles: plot size slider, tiles per row, and opening a tile in another tab', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200, B01: 110, B02: 220 });
  await tab(page, 'Tiles').click();
  const tiles = page.locator('.tiles-grid .tile');
  await expect(tiles).toHaveCount(4);

  // Largest size: two per row; smallest: the most that fit, each smaller.
  await slideTo(page, 'max');
  await expect.poll(() => tracks(page, '.tiles-grid')).toBe(2);
  const big = (await tiles.first().boundingBox())!.width;
  await slideTo(page, 'min');
  await expect.poll(() => tracks(page, '.tiles-grid')).toBeGreaterThan(4);
  const n = await tracks(page, '.tiles-grid');
  const small = (await tiles.first().boundingBox())!.width;
  expect(small).toBeLessThan(big / 2);
  // Tiles fill the row: n tiles and their gaps are as wide as the grid.
  const grid = (await page.locator('.tiles').boundingBox())!.width;
  expect(n * small).toBeLessThanOrEqual(grid);
  expect(n * (small + 12)).toBeGreaterThan(grid - small);

  // The picked size is kept across tabs.
  await tab(page, 'Gate').click();
  await tab(page, 'Tiles').click();
  await expect.poll(() => tracks(page, '.tiles-grid')).toBe(n);

  // A narrower window keeps the tile size near the pick: fewer per row.
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(() => tracks(page, '.tiles-grid')).toBeLessThan(n);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Plot: opens the tile as a new plot of the Plot view (once).
  await page.getByRole('button', { name: 'Open A02 in the Plot view' }).click();
  await expect(tab(page, 'Plot')).toHaveAttribute('aria-selected', 'true');
  const cells = page.locator('.plot-grid .grid-cell:not(.empty-cell)');
  const before = await cells.count();
  await expect(cells.locator('.cell-sample', { hasText: 'A02' })).toHaveCount(1);
  await tab(page, 'Tiles').click();
  await page.getByRole('button', { name: 'Open A02 in the Plot view' }).click();
  await expect(cells).toHaveCount(before);

  // Gate: opens the tile's sample in the Gate view.
  await tab(page, 'Tiles').click();
  await page.getByRole('button', { name: 'Open B01 in the Gate view' }).click();
  await expect(tab(page, 'Gate')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sample-list button.on .name')).toHaveText('B01');
});

test('plot grid: add, size, settings, delete, open in another tab', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200 });
  await tab(page, 'Plot').click();
  const cells = page.locator('.plot-grid .grid-cell:not(.empty-cell)');
  const start = await cells.count();

  // Add a dot plot and a histogram in empty cells.
  await page.locator('.plot-grid .empty-cell').first().getByRole('button', { name: 'Dot' }).click();
  await page.locator('.plot-grid .empty-cell').first().getByRole('button', { name: 'Histogram' }).click();
  await expect(cells).toHaveCount(start + 2);

  // The size slider: at least two columns, more at the smallest size; cells stay square.
  await slideTo(page, 'max');
  await expect.poll(() => tracks(page, '.plot-grid')).toBe(2);
  await slideTo(page, 'min');
  await expect.poll(() => tracks(page, '.plot-grid')).toBeGreaterThan(2);
  const box = (await cells.first().boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  // The pick is part of the workspace: undo restores the size.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => tracks(page, '.plot-grid')).toBe(2);

  // Settings panel for the selected plot.
  const settingsBtn = page.locator('.grid-view').getByRole('button', { name: 'Settings' });
  const was = await settingsBtn.getAttribute('aria-expanded');
  await settingsBtn.click();
  await expect(settingsBtn).toHaveAttribute('aria-expanded', was === 'true' ? 'false' : 'true');

  // Delete removes the selected plot (not while typing in a field).
  const last = cells.last();
  await last.locator('.cell-title').click();
  await expect(last).toHaveClass(/\bon\b/);
  await page.keyboard.press('Delete');
  await expect(cells).toHaveCount(start + 1);

  // A plot's sample can be pinned from its title; it no longer follows the sidebar.
  const first = cells.first();
  await first.locator('.cell-sample').click();
  await page.getByRole('dialog').getByText('A02', { exact: true }).click();
  await expect(first.locator('.cell-sample')).toHaveText('A02');
  await expect(first.locator('.badge', { hasText: 'follows' })).toHaveCount(0);

  // Open in the Gate view with that sample.
  await first.getByRole('button', { name: 'Open this plot in the Gate view' }).click();
  await expect(tab(page, 'Gate')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sample-list button.on .name')).toHaveText('A02');
});

test('plot grid: open a plot in Tiles with its sample, type and axes', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200, B01: 110 });
  await tab(page, 'Plot').click();
  await page.locator('.plot-grid .empty-cell').first().getByRole('button', { name: 'Histogram' }).click();
  const cell = page.locator('.plot-grid .grid-cell.on');
  await cell.locator('.cell-sample').click();
  await page.getByRole('dialog').getByText('A02', { exact: true }).click();
  await expect(cell.locator('.cell-sample')).toHaveText('A02');
  // By keyboard: WebKit misplaces the hit box of rotated SVG text.
  await cell.getByRole('button', { name: /^Y axis: % of max/ }).press('Enter');
  await page
    .getByRole('dialog', { name: 'Y axis shows' })
    .getByRole('button', { name: /^Count/ })
    .click();
  await expect(cell.locator('text.axis-title', { hasText: /^Count$/ })).toBeVisible();
  const xTitle = await cell.locator('text.axis-title').first().textContent();

  // Tiles: the plot's sample is highlighted and every tile is a histogram on the same x and y axes.
  await cell.getByRole('button', { name: 'Open this plot in the Tiles view' }).click();
  await expect(tab(page, 'Tiles')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tiles-grid .tile')).toHaveCount(3);
  await expect(page.locator('.tiles-grid .tile.on .tile-title')).toContainText('A02');
  for (const t of await page.locator('.tiles-grid .tile').all()) {
    await expect(
      t.getByRole('button', { name: /^Y axis: Count\. Change what the y axis shows/ }),
    ).toBeVisible();
    await expect(t.locator('text.axis-title').first()).toHaveText(xTitle!);
  }

  // A sample unchecked in the sidebar has no tile: a toast says to check it.
  await page.getByRole('checkbox', { name: 'Show A02 in Tiles, Ridge and Statistics' }).uncheck();
  await tab(page, 'Plot').click();
  await cell.getByRole('button', { name: 'Open this plot in the Tiles view' }).click();
  await expect(tab(page, 'Tiles')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tiles-grid .tile')).toHaveCount(2);
  await expect(page.locator('.toast').filter({ hasText: 'A02 is unchecked in the sidebar' })).toBeVisible();
});

test('gate: open the plot in Plot and in Tiles from its title', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200, B01: 110 });
  await page.locator('.sample-list button', { hasText: 'A02' }).click();
  const title = page.locator('.gate-plot-title');
  await expect(title).toContainText('All events – A02');

  // Plot: a grid plot pinned to A02, added once.
  await title.getByRole('button', { name: 'Open this plot in the Plot view' }).click();
  await expect(tab(page, 'Plot')).toHaveAttribute('aria-selected', 'true');
  const pinned = page.locator('.plot-grid .grid-cell.on');
  await expect(pinned.locator('.cell-sample')).toHaveText('A02');
  await expect(pinned.locator('.badge', { hasText: 'follows' })).toHaveCount(0);
  const cells = page.locator('.plot-grid .grid-cell:not(.empty-cell)');
  const before = await cells.count();
  await tab(page, 'Gate').click();
  await title.getByRole('button', { name: 'Open this plot in the Plot view' }).click();
  await expect(tab(page, 'Plot')).toHaveAttribute('aria-selected', 'true');
  await expect(cells).toHaveCount(before);

  // Tiles: A02 highlighted, every tile a histogram as in the Gate view.
  await tab(page, 'Gate').click();
  await page.getByLabel('Plot type').selectOption('histogram');
  await title.getByRole('button', { name: 'Open this plot in the Tiles view' }).click();
  await expect(tab(page, 'Tiles')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tiles-grid .tile.on .tile-title')).toContainText('A02');
  for (const t of await page.locator('.tiles-grid .tile').all())
    await expect(t.getByRole('button', { name: /^Y axis: .*Change what the y axis shows/ })).toBeVisible();
});

test('gating path: steps, plot size, Path and Tree each with their own size, panel resizing', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles([fixture('flowkit/gate_ref/data1.fcs')]);
  await expect(page.getByRole('button', { name: 'All events', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // Gate 1 of All events, Gate 2 of Gate 1.
  await drawGate(page, 0.15, 0.85, 0.7, 0.2);
  await expect(page.locator('.pop-row', { hasText: 'Gate 1' })).toBeVisible();
  await page.locator('.pop-row', { hasText: 'Gate 1' }).locator('.pop-name').click();
  await drawGate(page, 0.3, 0.7, 0.6, 0.4);
  await expect(page.locator('.pop-row', { hasText: 'Gate 2' })).toBeVisible();
  await page.locator('.pop-row', { hasText: 'Gate 2' }).locator('.pop-name').click();

  await tab(page, 'Gating path').click();
  // All events and Gate 1, each with the gate leading on, then Gate 2's own plot.
  const cards = page.locator('.path-row .path-card');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('.path-arrow')).toHaveCount(2);
  await expect(page.locator('.path-arrow').nth(0)).toContainText('Gate 1');
  await expect(page.locator('.path-arrow').nth(1)).toContainText('Gate 2');

  // Smallest size: every step in one row; largest: one per row.
  await slideTo(page, 'min');
  await expect.poll(() => tracks(page, '.path-row')).toBeGreaterThanOrEqual(3);
  const small = (await cards.first().boundingBox())!.width;
  await slideTo(page, 'max');
  await expect.poll(() => tracks(page, '.path-row')).toBe(1);
  const large = (await cards.first().boundingBox())!.width;
  expect(large).toBeGreaterThan(2 * small);
  const pathValue = await slider(page).inputValue();

  // Tree: a node per population with gates; its slider has its own value.
  await page.getByRole('button', { name: 'Tree', exact: true }).click();
  await expect(page.locator('.path-tree .path-node')).toHaveCount(2);
  await expect(page.locator('.path-tree .path-chip.on')).toContainText('Gate 2');
  expect(await slider(page).inputValue()).not.toBe(pathValue);
  await slideTo(page, 'min');
  const treeValue = await slider(page).inputValue();
  await page.getByRole('button', { name: 'Path', exact: true }).click();
  expect(await slider(page).inputValue()).toBe(pathValue);
  await page.getByRole('button', { name: 'Tree', exact: true }).click();
  expect(await slider(page).inputValue()).toBe(treeValue);

  // Picking a population in the panel changes the path.
  await page.getByRole('button', { name: 'Path', exact: true }).click();
  await page.locator('.path-panel .pop-row', { hasText: 'Gate 1' }).locator('.pop-name').click();
  await expect(cards).toHaveCount(2);
  await expect(page.locator('.path-arrow')).toHaveCount(1);

  // The populations panel: arrow keys on its edge resize it; Enter fits it, then minimises it.
  const edge = page.getByRole('separator', { name: 'Resize the populations panel' });
  const h0 = Number(await edge.getAttribute('aria-valuenow'));
  await edge.focus();
  await edge.press('ArrowUp');
  await expect(edge).toHaveAttribute('aria-valuenow', String(h0 + 10));
  await edge.press('Shift+ArrowDown');
  await expect(edge).toHaveAttribute('aria-valuenow', String(h0 - 40));
  await edge.press('Enter');
  const fit = Number(await edge.getAttribute('aria-valuenow'));
  await edge.press('Enter');
  const min = Number(await edge.getAttribute('aria-valuenow'));
  expect(min).toBeLessThan(fit);
  expect(min).toBeGreaterThan(10);
  // The panel's height is kept across tabs.
  await tab(page, 'Gate').click();
  await tab(page, 'Gating path').click();
  await expect(edge).toHaveAttribute('aria-valuenow', String(min));

  // Path or Tree is remembered across a reload.
  await page.getByRole('button', { name: 'Tree', exact: true }).click();
  await waitForAutosave(page, 1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tree', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
    {
      timeout: 20_000,
    },
  );
});
