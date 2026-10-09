import { type Page, expect, test } from '@playwright/test';
import {
  downloadText,
  importDesign,
  loadWells,
  parseCsv,
  statsColumn,
  statsColumns,
  waitForAutosave,
} from './helpers.ts';

// Rows A and B are replicates; columns 1 and 2 are doses 1 and 10.
const MEDIANS = { A01: 100, A02: 200, B01: 110, B02: 220 };
const DESIGN = 'Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n';
const MEDIAN = 'All events | Median GFP (FL1-A)';

const settings = (page: Page) => page.getByRole('complementary', { name: 'Statistics settings' });

/** An export button of the settings panel's Export tab, by the label beside it. */
const exportButton = (page: Page, label: string) =>
  settings(page).locator('.field', { hasText: label }).getByRole('button');

async function addStat(page: Page, stat: string, channel: string) {
  const form = page.locator('.add-stat');
  await form.locator('label', { hasText: 'Statistic' }).locator('select').selectOption({ label: stat });
  await form.locator('label', { hasText: 'Channel' }).locator('select').selectOption(channel);
  await page.getByRole('button', { name: 'Add statistic' }).click();
}

test.beforeEach(async ({ page }) => {
  // A fresh settings panel (its tab and sections are remembered in this browser).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.removeItem('flowmeris.statsPanel');
      sessionStorage.setItem('e2e-init', '1');
    }
  });
});

test('statistics: added, formatted per kind, and removed from their header', async ({ page }) => {
  await loadWells(page, MEDIANS);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await expect.poll(() => statsColumn(page, 'All events | Count')).toEqual(['200', '200', '200', '200']);

  // Without a channel, nothing is added and a toast says why.
  await page.getByRole('button', { name: 'Add statistic' }).click();
  await expect(page.getByText('Choose a channel for this statistic.')).toBeVisible();
  expect(await statsColumns(page)).toEqual(['Sample', 'Well', 'All events | Count']);

  await addStat(page, 'Median', 'FL1-A');
  // CV of FSC-A = 100 · SD / mean of 1000…1199 = 100 · 57.88 / 1099.5 = 5.26 %.
  await addStat(page, 'CV (%)', 'FSC-A');
  await addStat(page, 'Percentile…', 'FSC-A');
  await expect(page.locator('table.stats tbody tr')).toHaveCount(4);
  await expect.poll(() => statsColumn(page, MEDIAN)).toEqual(['100', '200', '110', '220']);
  await expect.poll(() => statsColumn(page, 'All events | CV FSC-A')).toEqual(['5.3', '5.3', '5.3', '5.3']);
  // P50 of 1000…1199 is 1099.5, shown as an integer.
  await expect
    .poll(() => statsColumn(page, 'All events | P50 FSC-A'))
    .toEqual(['1100', '1100', '1100', '1100']);
  await expect.poll(() => statsColumn(page, 'Well')).toEqual(['A01', 'A02', 'B01', 'B02']);

  // Removing from the header drops the statistic, the others stay.
  const head = page.locator('table.stats thead tr').nth(1).locator('th', { hasText: 'CV FSC-A' });
  await head.getByRole('button', { name: 'Remove statistic' }).click();
  expect(await statsColumns(page)).toEqual([
    'Sample',
    'Well',
    'All events | Count',
    MEDIAN,
    'All events | P50 FSC-A',
  ]);
  // Undo brings it back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => statsColumns(page)).toContain('All events | CV FSC-A');
});

test('derived columns: formula suggestions, errors, significant figures; normalization', async ({ page }) => {
  await loadWells(page, MEDIANS);
  await importDesign(page, DESIGN, 2);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await addStat(page, 'Median', 'FL1-A');
  await expect.poll(() => statsColumn(page, MEDIAN)).toEqual(['100', '200', '110', '220']);

  const panel = settings(page);
  await panel.getByRole('button', { name: '+ Formula' }).click();
  const formula = panel.getByRole('combobox', { name: 'Formula' });

  // Inside “[”, numeric columns that match; categorical ones (Sample, Well) never.
  await formula.pressSequentially('[med');
  const options = panel.getByRole('listbox').getByRole('option');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText(MEDIAN);
  await formula.press('Enter');
  await expect(formula).toHaveValue(`[${MEDIAN}]`);
  await expect(options).toHaveCount(0);

  // A function name: suggestions, then Escape dismisses them without changing the text.
  await formula.pressSequentially(' / sq');
  await expect(options.first()).toContainText('sqrt(x)');
  await formula.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(formula).toHaveValue(`[${MEDIAN}] / sq`);

  // An unknown function is marked once the box is left, and Add is disabled until it is fixed.
  await formula.blur();
  const alert = panel.getByRole('alert');
  await expect(alert).toContainText('Unknown function “sq”');
  await expect(formula).toHaveAttribute('aria-invalid', 'true');
  const add = panel.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toBeDisabled();

  // Fixed as it is typed; an unknown column is caught too.
  await formula.fill('[Nope] / 4');
  await expect(alert).toContainText('Unknown column [Nope] (at character 1)');
  await formula.fill(`[${MEDIAN}] / 3`);
  await expect(alert).toHaveCount(0);
  await panel.getByRole('textbox', { name: 'Name' }).fill('Third');
  await add.click();

  // 3 significant figures by default.
  await expect.poll(() => statsColumn(page, 'Third')).toEqual(['33.3', '66.7', '36.7', '73.3']);
  await expect(panel.locator('.derived-list')).toContainText(`= [${MEDIAN}] / 3`);
  // Decimal points line up: every cell of the column keeps the same fraction width.
  await expect(page.locator('table.stats tbody td .frac').first()).toBeVisible();

  // Edit: fewer significant figures.
  await panel
    .locator('.derived-list li', { hasText: 'Third' })
    .getByRole('button', { name: 'Edit derived column' })
    .click();
  await panel.getByRole('spinbutton', { name: 'Significant figures' }).fill('2');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => statsColumn(page, 'Third')).toEqual(['33', '67', '37', '73']);

  // Normalization: median relative to dose 1 of the same replicate.
  await panel.getByRole('button', { name: '+ Normalization' }).click();
  const form = panel.locator('.derived-form');
  await form.locator('label', { hasText: 'Column' }).locator('select').selectOption({ label: MEDIAN });
  const rel = form.locator('label', { hasText: 'Relative to samples with' }).locator('select');
  await rel.first().selectOption({ label: 'Dose' });
  await rel.nth(1).selectOption({ label: '1' });
  await form.getByRole('checkbox', { name: 'Replicate' }).check();
  await expect(form.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
    'placeholder',
    'Median GFP (FL1-A) / Dose 1',
  );
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  const norm = 'Median GFP (FL1-A) / Dose 1';
  await expect.poll(() => statsColumn(page, norm)).toEqual(['1.00', '2.00', '1.00', '2.00']);
  await expect(panel.locator('.derived-list')).toContainText('ratio to Dose = 1 within Replicate');

  // Removing the statistic they use keeps the formula, marked as an error at the reference, and
  // removes the normalization of it; undo restores both.
  await page
    .locator('table.stats thead tr')
    .nth(1)
    .locator('th', { hasText: 'Median GFP' })
    .first()
    .getByRole('button', { name: 'Remove statistic' })
    .click();
  const third = panel.locator('.derived-list li', { hasText: 'Third' });
  await expect(third.getByRole('alert')).toContainText(`Unknown column [${MEDIAN}] (at character 1)`);
  await expect(third.locator('mark')).toHaveText(`[${MEDIAN}]`);
  await expect(panel.locator('.derived-list')).not.toContainText(norm);
  await expect.poll(() => statsColumn(page, 'Third')).toEqual(['NaN', 'NaN', 'NaN', 'NaN']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(panel.locator('.derived-list')).toContainText(norm);
  await expect(third.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => statsColumn(page, 'Third')).toEqual(['33', '67', '37', '73']);

  // Remove a derived column from the panel.
  await panel
    .locator('.derived-list li', { hasText: 'Third' })
    .getByRole('button', { name: 'Remove derived column' })
    .click();
  await expect.poll(() => statsColumns(page)).not.toContain('Third');
  await expect.poll(() => statsColumns(page)).toContain(norm);
});

test('replicates: grouped table, summaries, and pinned grouping columns', async ({ page }) => {
  await loadWells(page, MEDIANS);
  await importDesign(page, DESIGN, 2);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await addStat(page, 'Median', 'FL1-A');
  const panel = settings(page);
  await panel.getByRole('tab', { name: 'Replicates' }).click();
  await panel.getByRole('checkbox', { name: 'Dose', exact: true }).check();
  // Ticking a variable turns combining on.
  await expect(panel.getByRole('checkbox', { name: 'Combine replicates' })).toBeChecked();

  const rows = page.locator('table.stats tbody tr');
  await expect(rows).toHaveCount(2);
  // Three header rows: sections, source columns, summaries.
  await expect(page.locator('table.stats thead tr')).toHaveCount(3);
  // Mean and SD of 100, 110 and of 200, 220: 105 ± 7.07, 210 ± 14.1.
  await panel.getByRole('checkbox', { name: 'n', exact: true }).check();
  const summaries = page.locator('table.stats thead tr').nth(2);
  await expect(summaries).toContainText('Mean');
  await expect(rows.nth(0)).toContainText('105');
  await expect(rows.nth(1)).toContainText('210');
  await expect(rows.nth(0).locator('th')).toHaveText('1');
  // n: two replicates per dose.
  const n = await rows.evaluateAll((trs) =>
    trs.map((tr) => {
      const t = tr.closest('table')!;
      const heads = [...t.tHead!.rows[1]!.cells];
      const i = heads.findIndex((h) => h.title === 'n');
      return i < 0 ? null : (tr as HTMLTableRowElement).cells[i]!.textContent;
    }),
  );
  expect(n).toEqual(['2', '2']);

  // Grouped by both variables, each row is one sample again, and both grouping columns are pinned.
  await panel.getByRole('checkbox', { name: 'Replicate', exact: true }).check();
  await expect(rows).toHaveCount(4);
  await expect(rows.first().locator('.pin')).toHaveCount(2);
  await expect(rows.first().locator('.pin-last')).toHaveCount(1);

  // Switching combining off restores the per-sample table, with only the sample name pinned.
  await panel.getByRole('checkbox', { name: 'Combine replicates' }).uncheck();
  await expect(page.locator('table.stats thead tr')).toHaveCount(2);
  await expect(rows.first().locator('.pin')).toHaveCount(1);
  await expect(rows.first().locator('th.pin')).toContainText('A01');
});

test('pinned header rows and sample column stay in view as the table scrolls', async ({ page }) => {
  // Enough samples and statistics to scroll both ways.
  const medians: Record<string, number> = {};
  // Distinct files: identical ones would be one sample.
  for (const [i, r] of [...'ABCDEFGH'].entries())
    for (let c = 1; c <= 4; c++) medians[`${r}0${c}`] = 100 + 10 * i + c;
  await loadWells(page, medians);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  for (const s of ['Median', 'Mean', 'SD', 'Min', 'Max', 'Robust SD'])
    for (const ch of ['FL1-A', 'FSC-A']) await addStat(page, s, ch);
  await expect(page.locator('table.stats tbody tr')).toHaveCount(32);

  const scroller = page.locator('.stats-scroll');
  const first = page.locator('table.stats tbody tr').first().locator('th');
  const headCell = page.locator('table.stats thead tr').nth(1).locator('th').first();
  const lastHead = page.locator('table.stats thead tr').nth(1).locator('th').last();
  const before = { cell: (await first.boundingBox())!, head: (await headCell.boundingBox())! };
  const overflow = await scroller.evaluate((el) => [
    el.scrollWidth > el.clientWidth,
    el.scrollHeight > el.clientHeight,
  ]);
  expect(overflow).toEqual([true, true]);

  await scroller.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight));
  await expect(lastHead).toBeInViewport();
  const after = { cell: (await first.boundingBox())!, head: (await headCell.boundingBox())! };
  // The sample column stays at the left, the header row at the top.
  expect(after.cell.x).toBeCloseTo(before.cell.x, 0);
  expect(after.head.y).toBeCloseTo(before.head.y, 0);
  expect(after.head.x).toBeCloseTo(before.head.x, 0);
  // The last row is in view below the header, not under it.
  const lastRow = page.locator('table.stats tbody tr').last().locator('th');
  expect((await lastRow.boundingBox())!.y).toBeGreaterThan(after.head.y + after.head.height - 1);
  await page.screenshot({ path: 'test-results/stats-pinned.png' });
});

test('exports: table CSV with chosen columns, tidy and wide CSV, Gating-ML, events', async ({ page }) => {
  await loadWells(page, MEDIANS);
  await importDesign(page, DESIGN, 2);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await addStat(page, 'Median', 'FL1-A');
  await expect.poll(() => statsColumn(page, MEDIAN)).toEqual(['100', '200', '110', '220']);
  const panel = settings(page);
  await panel.getByRole('tab', { name: 'Export' }).click();

  // The table as shown, full precision.
  const table = await downloadText(page, () => exportButton(page, 'CSV (table)').click());
  expect(table.name).toMatch(/_statistics_samples\.csv$/);
  const t = parseCsv(table.text);
  expect(t[0]).toEqual(['Sample', 'Well', 'Dose', 'Replicate', 'All events | Count', MEDIAN]);
  expect(t.slice(1).map((r) => r[5])).toEqual(['100', '200', '110', '220']);

  // Leave out the variables: the checklist counts, and the export follows.
  await expect(panel.locator('.columns-menu')).toContainText('Columns (6/6)');
  await panel.locator('.columns-menu fieldset', { hasText: 'Variables' }).locator('legend input').uncheck();
  await expect(panel.locator('.columns-menu')).toContainText('Columns (4/6)');
  const fewer = parseCsv((await downloadText(page, () => exportButton(page, 'CSV (table)').click())).text);
  expect(fewer[0]).toEqual(['Sample', 'Well', 'All events | Count', MEDIAN]);
  await panel.locator('.columns-menu').getByRole('button', { name: 'none' }).click();
  await expect(panel.locator('.columns-menu')).toContainText('Columns (1/6)');
  await panel.locator('.columns-menu').getByRole('button', { name: 'all' }).click();
  await expect(panel.locator('.columns-menu')).toContainText('Columns (6/6)');

  // Grouped: the summary table, keeping its grouping columns.
  await panel.getByRole('tab', { name: 'Replicates' }).click();
  await panel.getByRole('checkbox', { name: 'Dose', exact: true }).check();
  await panel.getByRole('tab', { name: 'Export' }).click();
  const grouped = await downloadText(page, () => exportButton(page, 'CSV (table)').click());
  expect(grouped.name).toMatch(/_statistics_grouped\.csv$/);
  const g = parseCsv(grouped.text);
  expect(g).toHaveLength(3);
  expect(g[0]![0]).toBe('Dose');
  const meanCol = g[0]!.findIndex((h) => h.includes('Median GFP') && /mean/i.test(h));
  expect(meanCol).toBeGreaterThan(0);
  expect(g.slice(1).map((r) => Number(r[meanCol]))).toEqual([105, 210]);

  // Tidy: one row per sample × population × statistic.
  const tidy = parseCsv((await downloadText(page, () => exportButton(page, 'CSV (tidy)').click())).text);
  const head = tidy[0]!;
  const stat = head.indexOf('statistic');
  const value = head.indexOf('value');
  expect(stat).toBeGreaterThanOrEqual(0);
  const medians = tidy.slice(1).filter((r) => r[stat] === 'median');
  expect(medians.map((r) => Number(r[value])).sort((a, b) => a - b)).toEqual([100, 110, 200, 220]);
  expect(tidy.slice(1).filter((r) => r[stat] === 'count')).toHaveLength(4);

  // Wide: one row per sample.
  const wide = parseCsv((await downloadText(page, () => exportButton(page, 'CSV (wide)').click())).text);
  expect(wide).toHaveLength(5);

  // Gating-ML of the template.
  const gml = await downloadText(page, () => exportButton(page, 'Gating-ML').click());
  expect(gml.name).toMatch(/_template\.gating-ml\.xml$/);
  expect(gml.text).toContain('gating:Gating-ML');

  // Events of the selected sample: FCS and CSV.
  const [fcsDl] = await Promise.all([page.waitForEvent('download'), exportButton(page, 'FCS (raw)').click()]);
  expect(fcsDl.suggestedFilename()).toMatch(/^Specimen_001_A01_All_events\.fcs$/);
  const csv = parseCsv(
    (await downloadText(page, () => exportButton(page, 'CSV (compensated)').click())).text,
  );
  expect(csv).toHaveLength(201);
  expect(csv[0]).toEqual(expect.arrayContaining(['FSC-A', 'FL1-A']));
});

test('the settings panel remembers its tab and closed sections', async ({ page }) => {
  await loadWells(page, MEDIANS);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  const panel = settings(page);
  await panel.getByRole('button', { name: 'Derived columns', exact: true }).click();
  await expect(panel.getByRole('button', { name: '+ Formula' })).toHaveCount(0);
  await panel.getByRole('tab', { name: 'Export' }).click();
  await waitForAutosave(page, 4);
  await page.reload();
  await expect(panel.getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true', {
    timeout: 20_000,
  });
  await panel.getByRole('tab', { name: 'Statistics' }).click();
  await expect(panel.getByRole('button', { name: '+ Formula' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Add statistic' })).toBeVisible();
});
