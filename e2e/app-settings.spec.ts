import { type Page, expect, test } from '@playwright/test';
import { downloadText, loadWells } from './helpers.ts';

/** The app Settings dialog (header gear): defaults, hotkeys and the settings file. */

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

async function openSettings(page: Page, tab?: string) {
  await page.getByRole('button', { name: 'App settings' }).click();
  await expect(dialog(page)).toBeVisible();
  if (tab) await dialog(page).getByRole('tab', { name: tab }).click();
}

async function closeSettings(page: Page) {
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}

test('the header has the settings gear, then GitHub, then the docs, at its right', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header.app-header');
  const gear = header.getByRole('button', { name: 'App settings' });
  const github = header.getByRole('link', { name: 'GitHub' });
  const docs = header.getByRole('link', { name: 'Docs' });
  await expect(github).toHaveAttribute('href', 'https://github.com/tengjuilin/flowmeris');
  await expect(github).toHaveAttribute('target', '_blank');
  const x = async (l: typeof gear) => (await l.boundingBox())!.x;
  expect(await x(gear)).toBeLessThan(await x(github));
  expect(await x(github)).toBeLessThan(await x(docs));

  await gear.click();
  await expect(dialog(page).getByRole('tab')).toHaveText([
    'Plots',
    'Ridges',
    'Charts',
    'Hotkeys',
    'Import and export',
  ]);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test('a changed hotkey selects the tool, and the key it replaced no longer does', async ({ page }) => {
  await loadWells(page, { A1: 100 });
  await openSettings(page, 'Hotkeys');
  await dialog(page).getByRole('button', { name: 'Change Rectangle' }).click();
  await page.keyboard.press('KeyV');
  await expect(dialog(page).getByText('V moved from Select to Rectangle.')).toBeVisible();
  await expect(dialog(page).getByLabel('Rectangle keys')).toHaveText('V');
  await closeSettings(page);

  const rect = page.getByRole('button', { name: 'Rectangle' });
  await expect(rect).toHaveAttribute('title', /\(V\)$/);
  await page.locator('body').press('v');
  await expect(rect).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ellipse' }).click();
  await page.locator('body').press('v');
  await expect(rect).toHaveAttribute('aria-pressed', 'true');

  // Kept for the next visit.
  await page.reload();
  await openSettings(page, 'Hotkeys');
  await expect(dialog(page).getByLabel('Select keys')).toHaveText('None');
});

test('a changed default restyles saved plots still at the old default, and keeps what was set otherwise', async ({
  page,
}) => {
  await loadWells(page, { A1: 100 });
  const gateTab = (name: string) =>
    page.getByRole('tablist', { name: 'Gate settings' }).getByRole('tab', { name }).click();
  const pointSize = page.getByLabel('Point size (px)');
  const outlier = page.getByLabel('Outlier size (px)');
  await gateTab('Figure');
  await expect(pointSize).toHaveValue('3');
  // An edit saves the plot, with its point size still at the default.
  await page.getByRole('combobox', { name: 'Plot type' }).selectOption('contour');
  await outlier.fill('4');

  await openSettings(page, 'Plots');
  const field = (name: string) => dialog(page).getByRole('spinbutton', { name, exact: true });
  await field('Point size (px)').fill('5');
  await field('Outlier size (px)').fill('3');
  await expect(dialog(page).getByRole('button', { name: 'Reset Point size (px)' })).toBeEnabled();
  await closeSettings(page);
  await gateTab('Figure');
  await page.getByRole('combobox', { name: 'Plot type' }).selectOption('dot');
  await expect(pointSize).toHaveValue('5');
  await page.getByRole('combobox', { name: 'Plot type' }).selectOption('contour');
  await expect(outlier).toHaveValue('4');

  await openSettings(page, 'Plots');
  await dialog(page).getByRole('button', { name: 'Reset Point size (px)' }).click();
  await expect(field('Point size (px)')).toHaveValue('3');
  await closeSettings(page);
});

test('settings export to a file and import from it', async ({ page }) => {
  await page.goto('/');
  await openSettings(page, 'Charts');
  await dialog(page).getByRole('spinbutton', { name: 'Mean marker size (px)', exact: true }).fill('9');
  await dialog(page).getByRole('tab', { name: 'Import and export' }).click();
  const { name, text } = await downloadText(page, () =>
    dialog(page).getByRole('button', { name: 'Export settings…' }).click(),
  );
  expect(name).toBe('flowmeris-settings.json');
  expect(JSON.parse(text)).toMatchObject({
    schema: 'flowmeris.settings',
    defaults: { chart: { markerSize: 9 } },
  });

  page.once('dialog', (d) => d.accept());
  await dialog(page).getByRole('button', { name: 'Reset all settings' }).click();
  await dialog(page).getByRole('tab', { name: 'Charts' }).click();
  await expect(
    dialog(page).getByRole('spinbutton', { name: 'Mean marker size (px)', exact: true }),
  ).toHaveValue('5');

  await dialog(page).getByRole('tab', { name: 'Import and export' }).click();
  await page.getByTestId('settings-file-input').setInputFiles({
    name: 'mine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(dialog(page).getByText('Imported mine.json.')).toBeVisible();
  await dialog(page).getByRole('tab', { name: 'Charts' }).click();
  await expect(
    dialog(page).getByRole('spinbutton', { name: 'Mean marker size (px)', exact: true }),
  ).toHaveValue('9');

  await dialog(page).getByRole('tab', { name: 'Import and export' }).click();
  await page.getByTestId('settings-file-input').setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"flowmeris.workspace"}'),
  });
  await expect(dialog(page).getByRole('alert')).toHaveText(/not a Flowmeris settings file/);
});
