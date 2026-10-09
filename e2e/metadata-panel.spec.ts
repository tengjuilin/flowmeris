import { type Page, expect, test } from '@playwright/test';
import { downloadText, importDesign, loadWells, parseCsv, statsColumn } from './helpers.ts';

const WELLS = { A01: 100, A02: 200, B01: 110, B02: 220 };

const settings = (page: Page) => page.getByRole('complementary', { name: 'Metadata settings' });
const cell = (page: Page, column: string, sample: string) =>
  page.getByRole('textbox', { name: `${column} of ${sample}`, exact: true });
const wellButton = (page: Page, well: string) =>
  page.locator('.plate .well').filter({ has: page.locator(`xpath=self::*[starts-with(@title, "${well}")]`) });
const toast = (page: Page, text: string | RegExp) => expect(page.locator('.toast').filter({ hasText: text }));

/** Paste text into an element as a clipboard paste does. */
async function paste(page: Page, target: ReturnType<Page['locator']>, text: string) {
  await target.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

async function openMetadata(page: Page) {
  await loadWells(page, WELLS);
  await page.getByRole('tab', { name: 'Metadata' }).click();
  await expect(page.locator('table.meta-table tbody tr')).toHaveCount(4);
}

test('table: typed values, linked well row and column, invalid text rejected', async ({ page }) => {
  await openMetadata(page);
  // Wells read from the file names, split into row and column.
  await expect(cell(page, 'Well', 'A02')).toHaveValue('A02');
  await expect(cell(page, 'Row', 'A02')).toHaveValue('A');
  await expect(cell(page, 'Column', 'A02')).toHaveValue('2');

  // Values tab is only for the plate map.
  await expect(settings(page).getByRole('tab', { name: 'Values' })).toBeDisabled();

  // A numeric variable, renamed and with a unit: the header and chip follow.
  await settings(page).getByRole('button', { name: '+ Numeric' }).click();
  const card = settings(page).locator('.variable-fields');
  await card.getByRole('textbox', { name: 'Name' }).fill('Conc');
  await card.getByRole('textbox', { name: 'Unit' }).fill('nM');
  await expect(page.locator('table.meta-table thead')).toContainText('Conc (nM)');
  await expect(page.locator('.variable-bar .chip')).toHaveText(/Conc \(nM\)/);

  // Enter commits and moves down; the next row's cell has the focus.
  await cell(page, 'Conc', 'A01').fill('2.5');
  await cell(page, 'Conc', 'A01').press('Enter');
  await expect(cell(page, 'Conc', 'A02')).toBeFocused();
  await cell(page, 'Conc', 'A02').fill('10');
  await cell(page, 'Conc', 'A02').press('Enter');
  await expect(cell(page, 'Conc', 'A01')).toHaveValue('2.5');
  await expect(cell(page, 'Conc', 'A02')).toHaveValue('10');

  // Not a number: rejected with a message, the cell goes back to its value.
  await cell(page, 'Conc', 'A02').fill('ten');
  await cell(page, 'Conc', 'A02').press('Tab');
  await toast(page, '“ten” is not a number (Conc is numeric).').toBeVisible();
  await expect(cell(page, 'Conc', 'A02')).toHaveValue('10');
  // Escape abandons an edit.
  await cell(page, 'Conc', 'A01').fill('999');
  await cell(page, 'Conc', 'A01').press('Escape');
  await expect(cell(page, 'Conc', 'A01')).toHaveValue('2.5');

  // Well, row and column are linked.
  await cell(page, 'Well', 'A01').fill('c3');
  await cell(page, 'Well', 'A01').press('Tab');
  await expect(cell(page, 'Well', 'A01')).toHaveValue('C03');
  await expect(cell(page, 'Row', 'A01')).toHaveValue('C');
  await expect(cell(page, 'Column', 'A01')).toHaveValue('3');
  await cell(page, 'Row', 'A01').fill('d');
  await cell(page, 'Row', 'A01').press('Tab');
  await expect(cell(page, 'Well', 'A01')).toHaveValue('D03');
  await cell(page, 'Column', 'A01').fill('12');
  await cell(page, 'Column', 'A01').press('Tab');
  await expect(cell(page, 'Well', 'A01')).toHaveValue('D12');
  for (const [col, bad, msg] of [
    ['Well', 'Z9', '“Z9” is not a well of a 96-well plate (A01–H12).'],
    ['Row', 'J', '“J” is not a plate row (A–H).'],
    ['Column', '13', '“13” is not a plate column (1–12).'],
  ] as const) {
    await cell(page, col, 'A01').fill(bad);
    await cell(page, col, 'A01').press('Tab');
    await toast(page, msg).toBeVisible();
  }
  await expect(cell(page, 'Well', 'A01')).toHaveValue('D12');

  // The changes reach the Statistics table, values as entered (not rounded).
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await expect(page.locator('table.stats tbody tr').first()).toContainText('D12');
  await expect.poll(() => statsColumn(page, 'Conc (nM)')).toEqual(['2.5', '10', '', '']);
});

test('table: a block selected by dragging takes a paste, and Delete clears it', async ({ page }) => {
  await openMetadata(page);
  await importDesign(page, 'Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n', 2);
  const a01 = cell(page, 'Dose', 'A01').locator('..');
  const b02 = cell(page, 'Replicate', 'B02').locator('..');
  // Drag from Dose of A01 to Replicate of B02: a 4 × 2 block.
  const from = (await a01.boundingBox())!;
  const to = (await b02.boundingBox())!;
  await page.mouse.move(from.x + 5, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('table.meta-table td.sel')).toHaveCount(8);

  // A 2 × 2 block fits the selection twice and is repeated across it.
  await paste(page, cell(page, 'Dose', 'A01'), '5\tx\n6\ty\n');
  await expect(cell(page, 'Dose', 'A01')).toHaveValue('5');
  await expect(cell(page, 'Replicate', 'A02')).toHaveValue('y');
  await expect(cell(page, 'Dose', 'B01')).toHaveValue('5');
  await expect(cell(page, 'Replicate', 'B02')).toHaveValue('y');

  // Text that is not a number is skipped in the numeric column.
  await paste(page, cell(page, 'Dose', 'A01'), 'n/a\tz');
  await toast(page, '4 pasted value(s) did not fit their column and were skipped.').toBeVisible();
  await expect(cell(page, 'Dose', 'A01')).toHaveValue('5');
  await expect(cell(page, 'Replicate', 'A01')).toHaveValue('z');

  await cell(page, 'Dose', 'A01').press('Delete');
  for (const s of ['A01', 'A02', 'B01', 'B02']) {
    await expect(cell(page, 'Dose', s)).toHaveValue('');
    await expect(cell(page, 'Replicate', s)).toHaveValue('');
  }
});

test('categorical values: value menu, category order, and retyping', async ({ page }) => {
  await openMetadata(page);
  await settings(page).getByRole('button', { name: '+ Categorical' }).click();
  await expect(page.locator('table.meta-table thead')).toContainText('Group');
  await cell(page, 'Group', 'A01').fill('ctrl');
  await cell(page, 'Group', 'A01').press('Enter');
  await cell(page, 'Group', 'A02').fill('drug');
  await cell(page, 'Group', 'A02').press('Enter');

  // Clicking a categorical cell lists the values in use; typing filters them.
  await cell(page, 'Group', 'B01').click();
  const menu = page.locator('.level-menu');
  await expect(menu.locator('.picker-item')).toHaveText(['ctrl', 'drug']);
  await menu.getByRole('button', { name: 'drug' }).click();
  await expect(cell(page, 'Group', 'B01')).toHaveValue('drug');
  await cell(page, 'Group', 'B02').click();
  await cell(page, 'Group', 'B02').pressSequentially('ct');
  await expect(menu.locator('.picker-item')).toHaveText(['ctrl']);
  await cell(page, 'Group', 'B02').press('ArrowDown');
  await cell(page, 'Group', 'B02').press('Enter');
  await expect(cell(page, 'Group', 'B02')).toHaveValue('ctrl');

  // Category order: Alt+↓ moves a category down; the value menu follows the order.
  const order = settings(page).locator('.level-list li');
  await expect(order).toHaveText(['ctrl', 'drug'].map((t) => new RegExp(t)));
  await order.first().focus();
  await order.first().press('Alt+ArrowDown');
  await expect(order).toHaveText(['drug', 'ctrl'].map((t) => new RegExp(t)));
  await cell(page, 'Group', 'A01').click();
  await expect(menu.locator('.picker-item')).toHaveText(['drug', 'ctrl']);
  await cell(page, 'Group', 'A01').press('Escape');

  // Grouped statistics follow the category order.
  await page.getByRole('tab', { name: 'Statistics' }).click();
  const stats = page.getByRole('complementary', { name: 'Statistics settings' });
  await stats.getByRole('tab', { name: 'Replicates' }).click();
  await stats.getByRole('checkbox', { name: 'Group', exact: true }).check();
  await expect(page.locator('table.stats tbody tr th')).toHaveText(['drug', 'ctrl']);
  await stats.getByRole('checkbox', { name: 'Combine replicates' }).uncheck();

  // Categorical → numeric clears text that is not a number, and says how many; undo restores them.
  await page.getByRole('tab', { name: 'Metadata' }).click();
  await settings(page)
    .locator('.variable-fields')
    .getByRole('combobox', { name: 'Type' })
    .selectOption('numeric');
  await toast(page, '4 value(s) were not numbers and were cleared (undo to restore).').toBeVisible();
  await expect(cell(page, 'Group', 'A01')).toHaveValue('');
  await page.locator('body').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cell(page, 'Group', 'A01')).toHaveValue('ctrl');
});

test('plate map: selecting wells, setting values and filling series', async ({ page }) => {
  await openMetadata(page);
  await settings(page).getByRole('button', { name: '+ Numeric' }).click();
  await page.getByRole('button', { name: 'Plate map' }).click();
  // The plate map opens on Values.
  await expect(settings(page).getByRole('tab', { name: 'Values' })).toHaveAttribute('aria-selected', 'true');
  const count = settings(page).locator('.meta-selection');
  await expect(count).toHaveText('0 wells, 0 samples');
  await expect(settings(page).getByRole('button', { name: 'Set', exact: true })).toBeDisabled();
  await expect(settings(page).getByRole('button', { name: 'Fill selection' })).toBeDisabled();

  // Click one; ⌘/Ctrl-click adds; Esc clears.
  await wellButton(page, 'A01').click();
  await expect(count).toHaveText('1 well, 1 sample');
  await wellButton(page, 'C05').click({ modifiers: ['ControlOrMeta'] });
  await expect(count).toHaveText('2 wells, 1 sample');
  await page.keyboard.press('Escape');
  await expect(count).toHaveText('0 wells, 0 samples');

  // Row and column headers, and the corner for every well.
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(count).toHaveText('8 wells, 2 samples');
  await page.getByRole('button', { name: 'B', exact: true }).click({ modifiers: ['Shift'] });
  await expect(count).toHaveText('19 wells, 3 samples');
  await page.getByTitle('Select all wells').click();
  await expect(count).toHaveText('96 wells, 4 samples');

  // Set a value on every selected sample; text in a numeric variable is refused.
  const value = settings(page).getByRole('textbox', { name: 'Value of Dose' });
  await value.fill('abc');
  await value.press('Enter');
  await toast(page, '“abc” is not a number.').toBeVisible();
  await value.fill('7');
  await value.press('Enter');
  for (const w of Object.keys(WELLS)) await expect(wellButton(page, w)).toHaveText('7');

  // Drag a rectangle A01–B02, then fill a ×0.5 series along columns.
  const a = (await wellButton(page, 'A01').boundingBox())!;
  const b = (await wellButton(page, 'B02').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(count).toHaveText('4 wells, 4 samples');
  const series = settings(page);
  await expect(series.getByLabel('Series preview')).toHaveText('Values: 100, 50');
  await series.getByRole('button', { name: 'Fill selection' }).click();
  await expect(wellButton(page, 'A01')).toHaveText('100');
  await expect(wellButton(page, 'B01')).toHaveText('100');
  await expect(wellButton(page, 'A02')).toHaveText('50');
  await expect(wellButton(page, 'B02')).toHaveText('50');
  // The legend shows the range.
  await expect(page.locator('.plate-legend')).toContainText('50');
  await expect(page.locator('.plate-legend')).toContainText('100');

  // An added step along rows.
  await series.getByRole('button', { name: '+', exact: true }).click();
  await series.getByRole('textbox', { name: 'Step' }).fill('10');
  await series.getByRole('button', { name: 'Rows ↓' }).click();
  await expect(series.getByLabel('Series preview')).toHaveText('Values: 100, 110');
  await series.getByRole('button', { name: 'Fill selection' }).click();
  await expect(wellButton(page, 'A02')).toHaveText('100');
  await expect(wellButton(page, 'B02')).toHaveText('110');
  // A step that is not a number disables the fill.
  await series.getByRole('textbox', { name: 'Step' }).fill('x');
  await expect(series.getByRole('button', { name: 'Fill selection' })).toBeDisabled();

  // Clear removes the values of the selected samples.
  await series.getByRole('button', { name: 'Clear', exact: true }).click();
  for (const w of Object.keys(WELLS)) await expect(wellButton(page, w)).toHaveText('');

  // Wells hold the samples' names and value in their tooltip.
  await expect(wellButton(page, 'A01')).toHaveAttribute('title', /^A01\nA01\nDose: $/);
  await expect(wellButton(page, 'H12')).toHaveAttribute('title', /\(no sample\)/);
  await page.screenshot({ path: 'test-results/plate-map.png' });
});

test('plate map: categorical values from the chips and their colours', async ({ page }) => {
  await openMetadata(page);
  await importDesign(page, 'Well,Group\nA1,ctrl\nA2,drug\n', 1);
  await page.getByRole('button', { name: 'Plate map' }).click();
  const legend = page.locator('.plate-legend');
  await expect(legend).toContainText('ctrl');
  await expect(legend).toContainText('drug');
  const color = (w: string) => wellButton(page, w).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await color('A01')).not.toBe(await color('A02'));

  // Set B01 and B02 to an existing value with its chip.
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await settings(page).getByRole('button', { name: 'drug', exact: true }).click();
  await expect(wellButton(page, 'B01')).toHaveText('drug');
  expect(await color('B01')).toBe(await color('A02'));
});

test('variables are deleted from their card or chip after confirming', async ({ page }) => {
  await openMetadata(page);
  await importDesign(page, 'Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n', 2);
  const chips = page.locator('.variable-bar .chip');
  await expect(chips).toHaveCount(2);

  // Dismissed: nothing changes.
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Delete “Dose” and its values in all groups?');
    void d.dismiss();
  });
  await settings(page).getByRole('button', { name: 'Delete variable Dose' }).click();
  await expect(chips).toHaveCount(2);

  page.once('dialog', (d) => void d.accept());
  await settings(page).getByRole('button', { name: 'Delete variable Dose' }).click();
  await expect(chips).toHaveCount(1);
  await expect(page.locator('table.meta-table thead')).not.toContainText('Dose');

  // Delete on a focused chip.
  page.once('dialog', (d) => void d.accept());
  await chips.first().focus();
  await chips.first().press('Delete');
  await expect(chips).toHaveCount(0);
});

test('export the sample variables and import them again', async ({ page }) => {
  await openMetadata(page);
  await importDesign(page, 'Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n', 2);
  const out = await downloadText(page, () => page.getByRole('button', { name: 'Export' }).click());
  expect(out.name).toMatch(/_sample_variables\.csv$/);
  const rows = parseCsv(out.text);
  expect(rows[0]).toEqual(['file_name', 'sample', 'well', 'Dose', 'Replicate']);
  expect(rows.slice(1)).toEqual([
    ['Specimen_001_A01.fcs', 'A01', 'A01', '1', 'r1'],
    ['Specimen_001_A02.fcs', 'A02', 'A02', '10', 'r1'],
    ['Specimen_001_B01.fcs', 'B01', 'B01', '1', 'r2'],
    ['Specimen_001_B02.fcs', 'B02', 'B02', '10', 'r2'],
  ]);

  // Edited outside and imported: matched by file name, the values replace the old ones.
  const edited = out.text.replace(',10,r1', ',20,r1');
  await page.getByTestId('meta-input').setInputFiles({
    name: 'edited.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(edited),
  });
  await expect(page.getByText('4 of 4 samples matched')).toBeVisible();
  // The columns that identify samples are not imported as variables; Dose and Replicate go to the
  // existing variables of those names.
  await page.getByRole('button', { name: 'Import 2 variable(s)' }).click();
  await expect(cell(page, 'Dose', 'A02')).toHaveValue('20');
  await expect(page.locator('.variable-bar .chip')).toHaveCount(2);
});
