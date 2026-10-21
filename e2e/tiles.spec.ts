import { type Page, expect, test } from '@playwright/test';
import { writeFcs } from '../packages/fcs/src/write.ts';

/** A small FCS file with two scatter and two fluorescence channels. */
function fcs(shift: number): Buffer {
  const n = 300;
  const ramp = (a: number) => Float32Array.from({ length: n }, (_, i) => a + shift + i * 10);
  return Buffer.from(
    writeFcs([
      { pnn: 'FSC-A', values: ramp(20_000), range: 262144 },
      { pnn: 'SSC-A', values: ramp(10_000), range: 262144 },
      { pnn: 'FL1-A', pns: 'GFP', values: ramp(500), range: 262144 },
      { pnn: 'FL2-A', pns: 'PE', values: ramp(2_000), range: 262144 },
    ]),
  );
}

async function load(page: Page) {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles(
      ['A01', 'A02'].map((well, i) => ({
        name: `Specimen_001_${well}.fcs`,
        mimeType: 'application/octet-stream',
        buffer: fcs(i * 1000),
      })),
    );
  await expect(page.getByRole('button', { name: 'All events', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

const tab = (page: Page, name: string) =>
  page.locator('[role="tablist"]:not([aria-label])').getByRole('tab', { name, exact: true });
const titles = (page: Page) => page.locator('.tiles-grid .tile .tile-title > span:first-child');

test('tiles by channel: one sample, one axis fixed, the other through the channels', async ({ page }) => {
  await load(page);
  await tab(page, 'Tiles').click();
  const toolbar = page.locator('.tiles-view .toolbar');
  await expect(titles(page)).toHaveText(['A01', 'A02']);

  // A tile's Channels button shows that sample's plot over its channels, with x (FSC-A) kept.
  await page.getByRole('button', { name: 'Tile A02 by channel' }).click();
  await expect(toolbar.getByRole('combobox', { name: 'Sample' }).locator('option:checked')).toHaveText('A02');
  await expect(titles(page)).toHaveText(['SSC-A', 'FL1-A · GFP', 'FL2-A · PE']);

  // Keeping y (SSC-A) varies x instead.
  await toolbar.getByRole('button', { name: 'Fix the y axis' }).click();
  await expect(titles(page)).toHaveText(['FSC-A', 'FL1-A · GFP', 'FL2-A · PE']);

  // The checklist hides a channel.
  await toolbar.getByRole('button', { name: /^Channels \(\d+\)$/ }).click();
  await page.getByRole('checkbox', { name: /FL2-A/ }).uncheck();
  await expect(titles(page)).toHaveText(['FSC-A', 'FL1-A · GFP']);
  await expect(toolbar.getByRole('button', { name: 'Channels (2)' })).toBeVisible();
  await page.getByRole('checkbox', { name: /FL2-A/ }).check();
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  // A gate drawn on a tile is on that tile's channels: it shows there and not on the others.
  const tile = page.locator('.tiles-grid .tile', { hasText: 'FL1-A · GFP' });
  await tile.locator('.tile-title > span').first().click();
  await expect(tile).toHaveClass(/\bon\b/);
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const b = (await tile.locator('svg.plot-overlay').boundingBox())!;
  // Inside the plot area: the tile's margins hold the axes.
  await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.85, b.y + b.height * 0.2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.pop-row', { hasText: 'Gate 1' })).toBeVisible();
  await expect(tile.locator('.gate-label')).toHaveCount(1);
  await expect(page.locator('.tiles-grid .tile', { hasText: 'FSC-A' }).locator('.gate-label')).toHaveCount(0);

  // Samples puts the tile's channel on the Tiles plot and tiles it over the samples again.
  await tile.getByRole('button', { name: 'Tile FL1-A · GFP by sample' }).click();
  await expect(titles(page)).toHaveText(['A01', 'A02']);
  await expect(page.locator('.tiles-grid .tile .gate-label')).toHaveCount(2);
});
