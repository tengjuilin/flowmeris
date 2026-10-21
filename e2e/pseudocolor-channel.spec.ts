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
  await color.getByLabel('Color axis title').fill('Brightness');
  await expect(plot.locator('.color-bar .axis-title')).toHaveText('Brightness');
  await color.getByLabel('Show color bar').uncheck();
  await expect(plot.locator('.color-bar')).toHaveCount(0);

  // Another plot type keeps the color axis for when the plot is switched back.
  await page.getByRole('tab', { name: 'Figure' }).click();
  await page.getByLabel('Plot type').selectOption('dot');
  await page.getByLabel('Plot type').selectOption('pseudocolor-channel');
  await page.getByRole('tab', { name: 'Axis' }).click();
  await expect(color.getByLabel('Channel')).toHaveValue('FL3-H');
  await expect(color.getByLabel('Color by')).toHaveValue('max');
});
