import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => resolve(here, '../fixtures', rel);

test('pseudocolor channel: points colored by a third channel, set in the Color axis card', async ({
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
  const plot = page.locator('.plot-panel svg[role="img"]').first();
  await expect(plot).toHaveAttribute('aria-label', /^pseudocolor density plot of /);

  await page.getByRole('tab', { name: 'Figure' }).click();
  await page.getByLabel('Plot type').selectOption('pseudocolor-channel');
  // The first fluorescence channel on neither axis colors the points, shown on the color bar.
  await expect(plot).toHaveAttribute('aria-label', /^pseudocolor channel plot of .*, colored by .+/);
  await expect(plot.locator('.color-bar')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Axis' }).click();
  const color = page
    .locator('.inspector .insp-section')
    .filter({ has: page.getByRole('button', { name: 'Color axis', exact: true }) });
  await expect(color.getByLabel('Color by')).toHaveValue('median');
  await color.getByLabel('Channel').selectOption('FL3-H');
  await expect(plot).toHaveAttribute('aria-label', /colored by .*FL3-H$/);
  await color.getByLabel('Color by').selectOption('max');
  // The color map, the bar's size and its ticks are set on the card too.
  await color.getByLabel('Color map').selectOption('magma');
  await color.getByLabel('Bar width (px)').fill('24');
  await color.getByLabel('Bar width (px)').press('Enter');
  await expect(plot.locator('.color-bar rect').first()).toHaveAttribute('width', '24');
  await color.getByLabel('Custom ticks').fill('10\n1000 = 1k');
  await color.getByLabel('Custom ticks').blur();
  await expect(plot.locator('.color-bar g text')).toHaveText(['10', '1k']);

  // Clicking the color bar's title picks another color channel.
  await plot.getByRole('button', { name: /^Color axis: .*Change channel/ }).press('Enter');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^FL2-H/ })
    .click();
  await expect(plot).toHaveAttribute('aria-label', /colored by .*FL2-H$/);
  await expect(color.getByLabel('Color by')).toHaveValue('max');
  await color.getByLabel('Color axis title').fill('Brightness');
  await expect(plot.locator('.color-bar .axis-title')).toHaveText('Brightness');

  await color.getByLabel('Show color bar').uncheck();
  await expect(plot.locator('.color-bar')).toHaveCount(0);

  // Another plot type keeps the color axis for when the plot is switched back.
  await page.getByRole('tab', { name: 'Figure' }).click();
  await page.getByLabel('Plot type').selectOption('dot');
  await page.getByLabel('Plot type').selectOption('pseudocolor-channel');
  await page.getByRole('tab', { name: 'Axis' }).click();
  await expect(color.getByLabel('Channel')).toHaveValue('FL2-H');
  await expect(color.getByLabel('Color map')).toHaveValue('magma');
  await expect(color.getByLabel('Color by')).toHaveValue('max');

  // Opened in the Plot view and the Tiles view, the plot keeps its color channel.
  const views = page.locator('[role="tablist"]:not([aria-label])');
  const title = page.locator('.gate-plot-title');
  await title.getByRole('button', { name: 'Open this plot in the Plot view' }).click();
  const cell = page.locator('.plot-grid .grid-cell.on svg[role="img"]');
  await expect(cell).toHaveAttribute('aria-label', /^pseudocolor channel plot of .*colored by .*FL2-H$/);
  await expect(page.locator('.plot-grid .grid-cell.on .plot-message')).toHaveCount(0);
  await views.getByRole('tab', { name: 'Gate', exact: true }).click();
  await title.getByRole('button', { name: 'Open this plot in the Tiles view' }).click();
  await expect(page.locator('.tiles-grid .tile svg[role="img"]').first()).toHaveAttribute(
    'aria-label',
    /colored by .*FL2-H$/,
  );
  await expect(page.locator('.tiles-grid .tile .plot-message')).toHaveCount(0);
});

test('pseudocolor density: its color map is on the Color axis card, not on Display', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles([fixture('flowkit/gate_ref/data1.fcs')]);
  await expect(page.getByRole('button', { name: 'All events', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('tab', { name: 'Figure' }).click();
  const display = page
    .locator('.inspector .insp-section')
    .filter({ has: page.getByRole('button', { name: 'Display', exact: true }) });
  await expect(display.getByLabel('Color map')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Axis' }).click();
  const color = page
    .locator('.inspector .insp-section')
    .filter({ has: page.getByRole('button', { name: 'Color axis', exact: true }) });
  await color.getByLabel('Color map').selectOption('gray');
  await expect(color.getByLabel('Channel')).toHaveCount(0);
  await expect(page.locator('.plot-panel .color-bar')).toHaveCount(0);
});
