/**
 * Export výkazu výměr (slepého rozpočtu) do CSV pro MS Excel / LibreOffice Calc (CZ).
 * Oddělovač sloupců `;`, desetinná čárka `,`, UTF-8 BOM, automatické vzorce v Excelu.
 */

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatNum(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const num = Number(value);
  // Zachovej přirozenou přesnost až do `decimals` desetinných míst bez zbytečných nul
  const rounded = Number(num.toFixed(decimals));
  return String(rounded).replace('.', ',');
}

function formatPct(waste) {
  if (!waste) return '0';
  return formatNum(waste * 100, 1);
}

/**
 * Vygeneruje CSV obsah slepého rozpočtu z výsledku `computeBillOfMaterials`.
 * @param {Object} bomResult
 * @param {Object} [options]
 * @param {'blank'|'self'|'turnkey'} [options.priceMode='blank']
 * @returns {string}
 */
export function generateBomCsv(bomResult, options = {}) {
  const { priceMode = 'blank' } = options;
  const { sections = [], summary = {}, warnings = [], assumptions = [] } = bomResult || {};
  const rows = [];

  const pushRow = (cells) => {
    rows.push(cells);
    return rows.length; // 1-based Excel row index
  };

  const modeLabel =
    priceMode === 'turnkey'
      ? 'ORIENTAČNÍ ROZPOČET – DODAVATELSKY (NA KLÍČ 2026)'
      : priceMode === 'self'
      ? 'ORIENTAČNÍ ROZPOČET – SVÉPOMOCÍ (MATERIÁL + SUBDODÁVKY 2026)'
      : 'SOUPIS MATERIÁLU A PRACÍ – SLEPÝ ROZPOČET (VÝKAZ VÝMĚR)';

  // Hlavička dokumentu
  pushRow([modeLabel]);
  pushRow(['Projekt', 'Dream House – Novostavba RD + vedlejší stavba']);
  pushRow(['Varianta', summary.designLabel || summary.designId || '']);
  pushRow([
    'Zastavěná plocha domu',
    `${formatNum(summary.builtUpArea, 1)} m²`,
    '',
    'Čistá podlahová plocha',
    `${formatNum(summary.interiorArea, 1)} m²`,
  ]);
  pushRow([
    'Pokyny / poznámka',
    priceMode === 'blank'
      ? 'Vyplňte sloupec H (Jednotková cena bez DPH v Kč). Množství k objednání (sloupec G) již zahrnuje prořez / ztratné.'
      : `Jednotkové ceny ve sloupci H jsou orientační tržní odhad pro rok 2026 (${priceMode === 'self' ? 'svépomoc' : 'na klíč'}).`,
  ]);
  pushRow([]);

  // Hlavička tabulky (sloupce A–J)
  pushRow([
    'Kód',
    'Název položky',
    'Technická specifikace / standard',
    'MJ',
    'Čistá výměra z modelu',
    'Prořez %',
    'Množství k objednání',
    'Jedn. cena bez DPH (Kč)',
    'Cena celkem bez DPH (Kč)',
    'Výpočet z geometrie modelu',
  ]);

  const subtotalRows = [];

  for (const section of sections) {
    if (!section.items || section.items.length === 0) continue;

    // Řádek názvu oddílu
    pushRow([section.code, section.title.toUpperCase()]);

    const firstItemRow = rows.length + 1;
    for (const item of section.items) {
      const rowNum = rows.length + 1;
      const qtyDecimals = item.unit === 'm³' ? 3 : 2;
      const orderDecimals = item.unit === 'm³' ? 2 : 1;
      const unitPriceVal =
        priceMode === 'turnkey'
          ? (item.unitPriceTurnkey ? formatNum(item.unitPriceTurnkey, 0) : '')
          : priceMode === 'self'
          ? (item.unitPriceSelf ? formatNum(item.unitPriceSelf, 0) : '')
          : '';

      pushRow([
        item.code,
        item.name,
        item.spec || '',
        item.unit,
        formatNum(item.qty, qtyDecimals),
        formatPct(item.waste),
        formatNum(item.orderQty, orderDecimals),
        unitPriceVal,
        `=G${rowNum}*H${rowNum}`,
        item.calc || '',
      ]);
    }
    const lastItemRow = rows.length;

    const subtotalRow = pushRow([
      '',
      `Mezisoučet oddílu ${section.code} – ${section.title}`,
      '',
      '',
      '',
      '',
      '',
      '',
      `=SUM(I${firstItemRow}:I${lastItemRow})`,
      '',
    ]);
    subtotalRows.push(subtotalRow);

    pushRow([]);
  }

  // Rekapitulace
  pushRow(['', 'REKAPITULACE ROZPOČTU']);
  const totalExpr =
    subtotalRows.length > 0 ? `=SUM(${subtotalRows.map((r) => `I${r}`).join(';')})` : '0';
  const totalRow = pushRow(['', 'CELKEM BEZ DPH (Kč)', '', '', '', '', '', '', totalExpr]);
  const vatRow = pushRow([
    '',
    'DPH 12 % (stavba pro sociální bydlení)',
    '',
    '',
    '',
    '',
    '',
    '',
    `=I${totalRow}*0,12`,
  ]);
  pushRow([
    '',
    'CELKEM VČETNĚ DPH (Kč)',
    '',
    '',
    '',
    '',
    '',
    '',
    `=I${totalRow}+I${vatRow}`,
  ]);

  if (warnings.length > 0) {
    pushRow([]);
    pushRow(['', 'UPOZORNĚNÍ K MODELU A VÝMĚRÁM']);
    for (const w of warnings) {
      pushRow(['!', w]);
    }
  }

  if (assumptions.length > 0) {
    pushRow([]);
    pushRow(['', 'PŘEDPOKLADY VÝPOČTU']);
    assumptions.forEach((a, idx) => {
      pushRow([String(idx + 1), a]);
    });
  }

  const lines = rows.map((row) => row.map(escapeCsvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Spustí stažení CSV souboru v prohlížeči.
 * @param {Object} bomResult
 * @param {string} [filename]
 * @param {Object} [options]
 */
export function downloadBomCsv(bomResult, filename, options = {}) {
  const csv = generateBomCsv(bomResult, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const id = bomResult?.summary?.designId || 'model';
  const modeSuffix = options.priceMode && options.priceMode !== 'blank' ? `-${options.priceMode}` : '';
  const dateStr = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `dream-house-rozpocet-${id}${modeSuffix}-${dateStr}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
