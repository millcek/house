/**
 * Exports Opening Schedules (Výpis výplní otvorů) and Area/Technical Summaries
 * to CZ Excel-compatible CSV (;-delimited, decimal comma, UTF-8 BOM, Excel formulas)
 * and print-ready A4 HTML/PDF sheets.
 */

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtNum(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const rounded = Number(Number(value).toFixed(decimals));
  return String(Object.is(rounded, -0) ? 0 : rounded).replace('.', ',');
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtElev(meters) {
  if (Math.abs(meters) < 0.0005) return '±0,000 m';
  const sign = meters >= 0 ? '+' : '-';
  return `${sign}${Math.abs(meters).toFixed(3).replace('.', ',')} m`;
}

function triggerDownload(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates a CZ Excel CSV opening schedule containing:
 * 1) Grouped supplier quotation summary by canonical mark (O1, DV1, D1...)
 * 2) Detailed per-opening schedule with rooms, orientation & L/P handing
 * 3) Glazing balance by cardinal orientation (PENB input)
 */
export function generateOpeningsCsv(openingSchedule, designConfig = {}) {
  const { items = [], groupedTypes = [], glazingByOrientation = [], summary = {} } =
    openingSchedule || {};
  const rows = [];
  const pushRow = (cells) => {
    rows.push(cells);
    return rows.length; // 1-based Excel row index
  };

  pushRow(['VÝPIS VÝPLNÍ OTVORŮ (OKNA, HS PORTÁLY, DVEŘE)']);
  pushRow(['Projekt', 'Rodinný dům 6+kk · Vojáčkovi Troubelice']);
  pushRow(['Varianta / zdroj', designConfig.label || designConfig.id || 'Vojáčkovi Troubelice']);
  pushRow([
    'Souhrn',
    `Okna a HS portály: ${summary.totalGlazingCount || 0} ks (${fmtNum(summary.windowAreaSqm, 2)} m²) | Vchodové dveře: ${summary.extDoorCount || 0} ks | Vnitřní dveře: ${summary.intDoorCount || 0} ks`,
  ]);
  pushRow([]);

  // Section 1: Supplier Quotation Summary
  pushRow(['1. POPTÁVKOVÁ REKAPITULACE DLE TYPŮ A ZNAČEK']);
  pushRow([
    'Značka',
    'Kategorie',
    'Typ / popis',
    'Šířka (mm)',
    'Výška (mm)',
    'Parapet / práh (mm)',
    'Počet (ks)',
    'Plocha 1 ks (m²)',
    'Plocha celkem (m²)',
    'Podlaží',
    'Místnosti',
    'Technický standard',
  ]);

  const firstGroupRow = rows.length + 1;
  for (const g of groupedTypes) {
    const r = rows.length + 1;
    pushRow([
      g.mark,
      g.categoryLabel,
      g.description,
      String(g.widthMm),
      String(g.heightMm),
      String(g.sillMm),
      String(g.count),
      fmtNum(g.unitAreaSqm, 2),
      `=G${r}*H${r}`,
      g.floorsText,
      g.roomsText,
      g.standard,
    ]);
  }
  const lastGroupRow = rows.length;
  if (groupedTypes.length > 0) {
    pushRow([
      '',
      'CELKEM VÝPLNÍ A OTVORŮ',
      '',
      '',
      '',
      '',
      `=SUM(G${firstGroupRow}:G${lastGroupRow})`,
      '',
      `=SUM(I${firstGroupRow}:I${lastGroupRow})`,
    ]);
  }

  pushRow([]);
  pushRow(['2. PODROBNÝ VÝPIS VŠECH VÝPLNÍ OTVORŮ PO KUSECH']);
  pushRow([
    'Značka',
    'Podlaží',
    'Místnosti',
    'Stěna',
    'Kategorie',
    'Název prvku',
    'Šířka (mm)',
    'Výška (mm)',
    'Parapet / práh (mm)',
    'Výška nadpraží (mm)',
    'Plocha (m²)',
    'Orientace (půdorys / skutečná)',
    'Azimut (°)',
    'Otevírání / orientace L-P',
    'Tloušťka stěny (mm)',
    'Doporučený překlad (mm)',
    'Technický standard',
  ]);

  for (const item of items) {
    const orientText =
      item.orientationSide === 'Interiér'
        ? 'Interiér'
        : `${item.orientationSide} (${item.trueDir})`;
    pushRow([
      item.mark,
      item.floor,
      item.roomsText,
      item.wallName,
      item.categoryLabel,
      item.name,
      String(item.widthMm),
      String(item.heightMm),
      String(item.sillMm),
      String(item.lintelHeightMm),
      fmtNum(item.areaSqm, 2),
      orientText,
      item.trueAzimuthDeg !== null ? String(item.trueAzimuthDeg) : '—',
      item.handing,
      String(item.wallThicknessMm),
      String(item.lintelLengthMm),
      item.standard,
    ]);
  }

  pushRow([]);
  pushRow(['3. BILANCE PROSKLENÍ DLE SVĚTOVÝCH STRAN (PODKLAD PRO PENB)']);
  pushRow([
    'Fasáda (půdorys)',
    'Skutečná orientace',
    'Azimut (°)',
    'Počet oken (ks)',
    'Plocha otvorů (m²)',
    'Podíl prosklení (%)',
  ]);

  const firstOrientRow = rows.length + 1;
  for (const o of glazingByOrientation) {
    pushRow([
      o.sideLabel,
      o.trueDir,
      String(o.trueAzimuthDeg),
      String(o.count),
      fmtNum(o.areaSqm, 2),
      fmtNum(o.sharePct, 1),
    ]);
  }
  const lastOrientRow = rows.length;
  if (glazingByOrientation.length > 0) {
    pushRow([
      'CELKEM PROSKLENÍ',
      '',
      '',
      `=SUM(D${firstOrientRow}:D${lastOrientRow})`,
      `=SUM(E${firstOrientRow}:E${lastOrientRow})`,
      `=SUM(F${firstOrientRow}:F${lastOrientRow})`,
    ]);
  }

  const lines = rows.map((row) => row.map(escapeCsvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadOpeningsCsv(openingSchedule, designConfig = {}, filename = null) {
  const csv = generateOpeningsCsv(openingSchedule, designConfig);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(
    csv,
    'text/csv;charset=utf-8;',
    filename || `vojackovi-troubelice-vypis-otvoru-${dateStr}.csv`
  );
}

/**
 * Generates a CZ Excel CSV architectural/technical summary containing:
 * geometry & elevation levels, site KZP balance, setbacks, room schedule
 * with perimeter/clear height/volume/finish, construction assemblies, and audit info.
 */
export function generateTechnicalSummaryCsv(techSummary) {
  const {
    meta = {},
    geometry = {},
    elevations = {},
    site = null,
    setbacks = null,
    rooms = {},
    roomTotals = {},
    glazing = {},
    assemblies = [],
    layoutAudit = {},
  } = techSummary || {};

  const rows = [];
  const pushRow = (cells) => {
    rows.push(cells);
    return rows.length;
  };

  pushRow(['SOUHRN PLOCH, BILANCÍ A TECHNICKÝCH ÚDAJŮ (PODKLAD PRO TZ)']);
  pushRow(['Projekt', meta.projectTitle || 'Rodinný dům 6+kk · Vojáčkovi Troubelice']);
  pushRow(['Varianta / zdroj', meta.designLabel || meta.designId || '']);
  pushRow(['Datum exportu', meta.generatedAt || '']);
  pushRow([]);

  pushRow(['1. ZÁKLADNÍ GEOMETRIE A VÝŠKOVÉ KÓTY HLAVNÍHO DOMU']);
  pushRow(['Ukazatel', 'Hodnota', 'Jednotka', 'Poznámka']);
  pushRow([
    'Půdorysné rozměry domu',
    `${fmtNum(geometry.footprintWidthM, 1)} × ${fmtNum(geometry.footprintLengthM, 1)}`,
    'm',
    'Vnější obrys zdiva 1.NP',
  ]);
  pushRow(['Zastavěná plocha hlavního domu', fmtNum(geometry.footprintAreaSqm, 1), 'm²']);
  pushRow(['Celková užitná (vnitřní) plocha', fmtNum(roomTotals.totalInteriorSqm, 1), 'm²', '1.NP + 2.NP']);
  pushRow(['Z toho plocha obytných místností', fmtNum(roomTotals.totalHabitableSqm, 1), 'm²']);
  pushRow(['Vnitřní objem místností', fmtNum(roomTotals.totalRoomVolumeM3, 1), 'm³']);
  pushRow(['Obestavěný prostor (ČSN 73 4055)', fmtNum(geometry.totalVolumeM3, 1), 'm³', `Nadzemní část ${fmtNum(geometry.aboveGroundVolumeM3, 1)} m³`]);
  pushRow(['Sklon a plocha sedlové střechy', `${fmtNum(geometry.roofPitchDeg, 1)}° / ${fmtNum(geometry.roofAreaSqm, 1)}`, '° / m²', `Přesahy okap ${fmtNum(geometry.roofOverhangEaveM, 2)} m, štít ${fmtNum(geometry.roofOverhangGableM, 2)} m`]);
  pushRow(['Kóta čisté podlahy 1.NP', fmtElev(elevations.floor1FinishM || 0), 'm', `Světlá výška ${fmtNum(geometry.f1ClearHeightM, 2)} m`]);
  pushRow(['Kóta nosné desky 2.NP', fmtElev(elevations.floor2StructM || 0), 'm']);
  pushRow(['Kóta čisté podlahy 2.NP', fmtElev(elevations.floor2FinishM || 0), 'm', `Světlá výška ${fmtNum(geometry.f2ClearHeightM, 2)} m`]);
  pushRow(['Úroveň pozednice / podhledu 2.NP', fmtElev(elevations.eaveWallPlateM || 0), 'm']);
  pushRow(['Výška hřebene střechy', fmtElev(elevations.ridgeM || 0), 'm', 'Nad základovou deskou ±0,000']);
  pushRow(['Plocha prosklených otvorů / poměr k podl. ploše', `${fmtNum(glazing.windowAreaSqm, 2)} m² (${fmtNum(glazing.glazingRatioPct, 1)} %)`, 'm² / %', `${glazing.totalGlazingCount || 0} ks oken a HS portálů`]);
  pushRow([]);

  if (site) {
    pushRow(['2. URBANISTICKÁ BILANCE POZEMKU (KZP)']);
    pushRow(['Položka', 'Plocha (m²)', 'Podíl z parcely (%)', 'Poznámka']);
    pushRow(['Výměra pozemku', fmtNum(site.plotAreaSqm, 1), '100,0', `${site.widthM} × ${site.depthM} m, zkosení ${fmtNum(site.chamferM, 1)} m, natočení +${fmtNum(site.parcelRotationDeg, 1)}°`]);
    pushRow(['Hlavní rodinný dům', fmtNum(site.houseSqm, 1), fmtNum(site.houseRatioPct, 1)]);
    pushRow(['Zahradní dílna', fmtNum(site.workshopSqm, 1), fmtNum(site.workshopRatioPct, 1)]);
    pushRow(['Kryté parkovací stání', fmtNum(site.parkingSqm, 1), fmtNum(site.parkingRatioPct, 1)]);
    pushRow(['Stavby pod střechou celkem', fmtNum(site.buildingsSqm, 1), fmtNum(site.buildingsRatioPct, 1)]);
    pushRow(['Zahradní terasa (JZ)', fmtNum(site.terraceSqm, 1), fmtNum(site.terraceRatioPct, 1)]);
    pushRow(['Krytý vstupní chodník', fmtNum(site.canopySqm, 1), fmtNum(site.canopyRatioPct, 1)]);
    pushRow(['Zastavěná plocha celkem (KZP)', fmtNum(site.totalBuiltUpSqm, 1), fmtNum(site.totalRatioPct, 1)]);
    pushRow(['Volná nezastavěná zahrada (zeleň)', fmtNum(site.freeGardenSqm, 1), fmtNum(site.freeRatioPct, 1)]);
    pushRow([]);
  }

  if (setbacks) {
    pushRow(['3. ODSTUPOVÉ VZDÁLENOSTI OD HRANIC POZEMKU A MEZI STAVBAMI']);
    pushRow(['Vztah / směr', 'Vzdálenost (m)', 'Poznámka']);
    pushRow(['Hlavní dům – východní ulice (vpravo)', fmtNum(setbacks.streetRight, 1), 'Od obvodové stěny ke komunikaci']);
    pushRow(['Hlavní dům – západní hranice (zahrada)', fmtNum(setbacks.neighborWest, 1), setbacks.terraceNeighborWest !== null ? `Okraj terasy ${fmtNum(setbacks.terraceNeighborWest, 1)} m od hranice` : '']);
    pushRow(['Hlavní dům – severní hranice (vrch parcely)', fmtNum(setbacks.houseTop, 1)]);
    pushRow(['Hlavní dům – jižní ulice (přední)', fmtNum(setbacks.houseFront, 1)]);
    pushRow(['Mezera dům – vedlejší stavba (dílna/stání)', fmtNum(setbacks.houseWorkshopGap, 1)]);
    pushRow(['Vedlejší stavba – východní ulice', fmtNum(setbacks.workshopStreetRight, 1)]);
    pushRow(['Vedlejší stavba – západní hranice (soused)', fmtNum(setbacks.workshopNeighborWest, 1)]);
    pushRow(['Vedlejší stavba – severní hranice', fmtNum(setbacks.workshopTop, 1)]);
    pushRow([]);
  }

  pushRow(['4. PODROBNÁ TABULKA MÍSTNOSTÍ (1.NP + 2.NP)']);
  pushRow([
    'Číslo',
    'Podlaží',
    'Název místnosti',
    'Plocha (m²)',
    'Obvod (m)',
    'Světlá výška (m)',
    'Objem (m³)',
    'Nášlapná vrstva podlahy',
    'Klasifikace',
    'Zařizovací předměty',
  ]);

  const emitRoomSection = (list, subtotalLabel) => {
    const intList = list.filter((r) => r.interior);
    const extList = list.filter((r) => !r.interior);
    const firstRow = rows.length + 1;
    for (const r of intList) {
      pushRow([
        r.id,
        r.floor,
        r.name,
        fmtNum(r.areaSqm, 1),
        fmtNum(r.perimeterM, 2),
        fmtNum(r.clearHeightM, 2),
        fmtNum(r.volumeM3, 1),
        r.floorFinish,
        r.classification,
        r.fixtures,
      ]);
    }
    const lastRow = rows.length;
    const subRow = pushRow([
      '',
      '',
      subtotalLabel,
      `=SUM(D${firstRow}:D${lastRow})`,
      '',
      '',
      `=SUM(G${firstRow}:G${lastRow})`,
    ]);
    for (const r of extList) {
      pushRow([
        r.id,
        r.floor,
        r.name,
        fmtNum(r.areaSqm, 1),
        fmtNum(r.perimeterM, 2),
        '—',
        '—',
        r.floorFinish,
        r.classification,
        r.fixtures,
      ]);
    }
    return subRow;
  };

  const sub1 = emitRoomSection(rooms.floor1 || [], 'Mezisoučet užitné plochy 1.NP');
  const sub2 = emitRoomSection(rooms.floor2 || [], 'Mezisoučet užitné plochy 2.NP');
  pushRow([
    '',
    '',
    'CELKOVÁ UŽITNÁ PLOCHA DOMU (1.NP + 2.NP)',
    `=D${sub1}+D${sub2}`,
    '',
    '',
    `=G${sub1}+G${sub2}`,
  ]);
  pushRow([]);

  pushRow(['5. PŘEHLED UVAŽOVANÝCH SKLADEB KONSTRUKCÍ']);
  pushRow(['Kód', 'Konstrukce', 'Technický popis a standard']);
  for (const a of assemblies) {
    pushRow([a.code, a.element, a.description]);
  }
  pushRow([]);

  pushRow(['6. AUTOMATICKÁ KONTROLA DISPOZICE']);
  pushRow([
    'Výsledek auditu',
    `${layoutAudit.errors || 0} kritických chyb, ${layoutAudit.warnings || 0} ergonomických upozornění, ${layoutAudit.infos || 0} informací`,
  ]);

  const lines = rows.map((row) => row.map(escapeCsvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadTechnicalSummaryCsv(techSummary, filename = null) {
  const csv = generateTechnicalSummaryCsv(techSummary);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(
    csv,
    'text/csv;charset=utf-8;',
    filename || `vojackovi-troubelice-bilance-tz-${dateStr}.csv`
  );
}

/**
 * Generates a standalone, print-ready A4 HTML document summarizing architectural
 * areas, setbacks, room schedules, window/door schedules, and construction assemblies.
 */
export function generateTechnicalReportHtml(techSummary, openingSchedule) {
  const {
    meta = {},
    geometry = {},
    elevations = {},
    site = null,
    setbacks = null,
    rooms = {},
    roomTotals = {},
    glazing = {},
    assemblies = [],
    layoutAudit = {},
  } = techSummary || {};
  const { groupedTypes = [], items = [], glazingByOrientation = [] } = openingSchedule || {};

  const renderRoomsRows = (list) =>
    list
      .map(
        (r) => `
      <tr class="${r.interior ? '' : 'row-ext'}">
        <td class="mono">${escHtml(r.id)}</td>
        <td>${escHtml(r.name)}</td>
        <td class="num"><strong>${fmtNum(r.areaSqm, 1)}</strong></td>
        <td class="num">${fmtNum(r.perimeterM, 2)}</td>
        <td class="num">${r.interior ? fmtNum(r.clearHeightM, 2) : '—'}</td>
        <td class="num">${r.interior ? fmtNum(r.volumeM3, 1) : '—'}</td>
        <td>${escHtml(r.floorFinish)}</td>
        <td>${escHtml(r.fixtures)}</td>
      </tr>`
      )
      .join('');

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(meta.projectTitle || 'Technický list')} – Podklady pro projektanta</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
      font-size: 11px;
      line-height: 1.4;
    }
    .sheet {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      padding: 24px 28px;
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
      border-radius: 6px;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #0f172a;
    }
    .btn-print {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    h1 { margin: 0; font-size: 19px; letter-spacing: -0.01em; }
    .subtitle { color: #475569; font-size: 11.5px; margin-top: 2px; }
    h2 {
      font-size: 12.5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #1e3a8a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin: 18px 0 8px 0;
      page-break-after: avoid;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .card h3 {
      margin: 0 0 6px 0;
      font-size: 11.5px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
    }
    .kv { width: 100%; border-collapse: collapse; }
    .kv td { padding: 2.5px 0; border-bottom: 1px dashed #e2e8f0; }
    .kv tr:last-child td { border-bottom: none; }
    .kv td:last-child { text-align: right; font-weight: 600; }
    table.data {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 10.2px;
    }
    table.data th {
      background: #0f172a;
      color: #ffffff;
      text-align: left;
      padding: 5px 6px;
      font-weight: 600;
    }
    table.data td {
      padding: 4px 6px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    table.data tr:nth-child(even) td { background: #f8fafc; }
    table.data tr.row-ext td { background: #fffbeb; }
    table.data tr.subtotal td {
      background: #eff6ff;
      font-weight: 700;
      border-top: 1.5px solid #2563eb;
      border-bottom: 1.5px solid #2563eb;
    }
    .num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; white-space: nowrap; }
    .badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      background: #dbeafe;
      color: #1e40af;
      font-weight: 700;
      font-family: ui-monospace, Menlo, monospace;
    }
    .audit-box {
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #86efac;
      background: #f0fdf4;
      color: #166534;
      font-weight: 600;
    }
    .page-break { page-break-before: always; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { box-shadow: none; padding: 0; max-width: none; }
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="toolbar">
      <div>
        <h1>${escHtml(meta.projectTitle || 'Rodinný dům 6+kk · Vojáčkovi Troubelice')}</h1>
        <div class="subtitle">${escHtml(meta.designLabel || '')} · Technický list podkladů pro architekta a projektanta · Datum: ${escHtml(meta.generatedAt || '')}</div>
      </div>
      <button class="btn-print" onclick="window.print()">🖨️ Vytisknout / Uložit PDF</button>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Základní údaje & Výškové kóty</h3>
        <table class="kv">
          <tr><td>Půdorys domu</td><td>${fmtNum(geometry.footprintWidthM, 1)} × ${fmtNum(geometry.footprintLengthM, 1)} m (${fmtNum(geometry.footprintAreaSqm, 1)} m²)</td></tr>
          <tr><td>Celková užitná plocha</td><td>${fmtNum(roomTotals.totalInteriorSqm, 1)} m² (obytná ${fmtNum(roomTotals.totalHabitableSqm, 1)} m²)</td></tr>
          <tr><td>Obestavěný prostor (ČSN 73 4055)</td><td>${fmtNum(geometry.totalVolumeM3, 1)} m³ (nadzemní ${fmtNum(geometry.aboveGroundVolumeM3, 1)} m³)</td></tr>
          <tr><td>Sedlová střecha</td><td>sklon ${fmtNum(geometry.roofPitchDeg, 1)}°, plocha ${fmtNum(geometry.roofAreaSqm, 1)} m²</td></tr>
          <tr><td>Čistá podlaha 1.NP / světlá v.</td><td>${fmtElev(elevations.floor1FinishM || 0)} / ${fmtNum(geometry.f1ClearHeightM, 2)} m</td></tr>
          <tr><td>Čistá podlaha 2.NP / světlá v.</td><td>${fmtElev(elevations.floor2FinishM || 0)} / ${fmtNum(geometry.f2ClearHeightM, 2)} m</td></tr>
          <tr><td>Pozednice / hřeben střechy</td><td>${fmtElev(elevations.eaveWallPlateM || 0)} / ${fmtElev(elevations.ridgeM || 0)}</td></tr>
          <tr><td>Prosklení celkem</td><td>${glazing.totalGlazingCount || 0} ks (${fmtNum(glazing.windowAreaSqm, 2)} m², ${fmtNum(glazing.glazingRatioPct, 1)} % podl. plochy)</td></tr>
        </table>
      </div>

      <div class="card">
        <h3>Urbanistická bilance (KZP) & Odstupy</h3>
        <table class="kv">
          ${site ? `
            <tr><td>Výměra pozemku (+${fmtNum(site.parcelRotationDeg, 1)}° od S)</td><td>${fmtNum(site.plotAreaSqm, 0)} m² (${site.widthM}×${site.depthM} m)</td></tr>
            <tr><td>Stavby pod střechou (dům + dílna + stání)</td><td>${fmtNum(site.buildingsSqm, 1)} m² (${fmtNum(site.buildingsRatioPct, 1)} %)</td></tr>
            <tr><td>Terasa + krytý vstupní chodník</td><td>${fmtNum(site.accessoriesSqm, 1)} m² (${fmtNum(site.accessoriesRatioPct, 1)} %)</td></tr>
            <tr><td>Zastavěná plocha celkem (KZP)</td><td>${fmtNum(site.totalBuiltUpSqm, 1)} m² (${fmtNum(site.totalRatioPct, 1)} %)</td></tr>
            <tr><td>Volná nezastavěná zahrada</td><td>${fmtNum(site.freeGardenSqm, 1)} m² (${fmtNum(site.freeRatioPct, 1)} %)</td></tr>
          ` : ''}
          ${setbacks ? `
            <tr><td>Odstup domu: východní ulice / západní hranice</td><td>${fmtNum(setbacks.streetRight, 1)} m / ${fmtNum(setbacks.neighborWest, 1)} m</td></tr>
            <tr><td>Odstup domu: severní hranice / jižní ulice</td><td>${fmtNum(setbacks.houseTop, 1)} m / ${fmtNum(setbacks.houseFront, 1)} m</td></tr>
            <tr><td>Mezera dům–dílna / dílna od severu</td><td>${fmtNum(setbacks.houseWorkshopGap, 1)} m / ${fmtNum(setbacks.workshopTop, 1)} m</td></tr>
          ` : ''}
        </table>
      </div>
    </div>

    <h2>Tabulka místností — 1.NP (Přízemí)</h2>
    <table class="data">
      <thead>
        <tr>
          <th>Č.</th><th>Místnost</th><th class="num">Plocha (m²)</th><th class="num">Obvod (m)</th>
          <th class="num">Sv. v. (m)</th><th class="num">Objem (m³)</th><th>Povrch podlahy</th><th>Vybavení</th>
        </tr>
      </thead>
      <tbody>
        ${renderRoomsRows(rooms.floor1 || [])}
        <tr class="subtotal">
          <td></td><td>Užitná plocha 1.NP celkem (bez terasy)</td>
          <td class="num">${fmtNum(roomTotals.floor1InteriorSqm, 1)}</td><td></td><td></td>
          <td class="num">${fmtNum((rooms.floor1 || []).reduce((s, r) => s + r.volumeM3, 0), 1)}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <h2>Tabulka místností — 2.NP (Patro)</h2>
    <table class="data">
      <thead>
        <tr>
          <th>Č.</th><th>Místnost</th><th class="num">Plocha (m²)</th><th class="num">Obvod (m)</th>
          <th class="num">Sv. v. (m)</th><th class="num">Objem (m³)</th><th>Povrch podlahy</th><th>Vybavení</th>
        </tr>
      </thead>
      <tbody>
        ${renderRoomsRows(rooms.floor2 || [])}
        <tr class="subtotal">
          <td></td><td>Užitná plocha 2.NP celkem (1.NP + 2.NP = ${fmtNum(roomTotals.totalInteriorSqm, 1)} m²)</td>
          <td class="num">${fmtNum(roomTotals.floor2InteriorSqm, 1)}</td><td></td><td></td>
          <td class="num">${fmtNum((rooms.floor2 || []).reduce((s, r) => s + r.volumeM3, 0), 1)}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <div class="page-break"></div>

    <h2>Výpis výplní otvorů — Poptávková rekapitulace dle značek</h2>
    <table class="data">
      <thead>
        <tr>
          <th>Značka</th><th>Kategorie</th><th>Rozměr š×v (mm)</th><th class="num">Parapet (mm)</th>
          <th class="num">Počet</th><th class="num">Plocha 1 ks</th><th class="num">Plocha celkem</th><th>Místnosti</th>
        </tr>
      </thead>
      <tbody>
        ${groupedTypes
          .map(
            (g) => `
          <tr>
            <td><span class="badge">${escHtml(g.mark)}</span></td>
            <td>${escHtml(g.categoryLabel)}</td>
            <td class="mono">${g.widthMm} × ${g.heightMm}</td>
            <td class="num">${g.sillMm}</td>
            <td class="num"><strong>${g.count} ks</strong></td>
            <td class="num">${fmtNum(g.unitAreaSqm, 2)} m²</td>
            <td class="num"><strong>${fmtNum(g.totalAreaSqm, 2)} m²</strong></td>
            <td>${escHtml(g.roomsText)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2>Podrobný výpis výplní otvorů (po kusech)</h2>
    <table class="data">
      <thead>
        <tr>
          <th>Zn.</th><th>NP</th><th>Místnosti</th><th>Rozměr (mm)</th><th>Parapet</th>
          <th>Otevírání L/P</th><th>Orientace</th><th class="num">Překlad</th><th>Název prvku</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (i) => `
          <tr>
            <td><span class="badge">${escHtml(i.mark)}</span></td>
            <td>${escHtml(i.floor)}</td>
            <td>${escHtml(i.roomsText)}</td>
            <td class="mono">${i.widthMm}×${i.heightMm}</td>
            <td class="num">${i.sillMm}</td>
            <td>${escHtml(i.handing)}</td>
            <td>${i.orientationSide === 'Interiér' ? 'Interiér' : `${escHtml(i.orientationSide)} (${escHtml(i.trueDir)} ${i.trueAzimuthDeg}°)`}</td>
            <td class="num">${i.lintelLengthMm}</td>
            <td>${escHtml(i.name)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <div class="grid-2">
      <div>
        <h2>Prosklení dle světových stran (PENB)</h2>
        <table class="data">
          <thead>
            <tr><th>Fasáda</th><th>Skutečná or.</th><th class="num">Počet</th><th class="num">Plocha</th><th class="num">Podíl</th></tr>
          </thead>
          <tbody>
            ${glazingByOrientation
              .map(
                (o) => `
              <tr>
                <td>${escHtml(o.sideLabel)}</td>
                <td>${escHtml(o.trueDir)} (${o.trueAzimuthDeg}°)</td>
                <td class="num">${o.count} ks</td>
                <td class="num">${fmtNum(o.areaSqm, 2)} m²</td>
                <td class="num">${fmtNum(o.sharePct, 1)} %</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Kontrola dispozice a ergonomie</h2>
        <div class="audit-box">
          ✓ Automatický geometrický audit: ${layoutAudit.errors || 0} chyb, ${layoutAudit.warnings || 0} upozornění, ${layoutAudit.infos || 0} poznámek.
        </div>
      </div>
    </div>

    <h2>Přehled uvažovaných skladeb konstrukcí</h2>
    <table class="data">
      <thead><tr><th>Kód</th><th>Konstrukce</th><th>Standard a skladba</th></tr></thead>
      <tbody>
        ${assemblies
          .map(
            (a) => `
          <tr>
            <td class="mono">${escHtml(a.code)}</td>
            <td><strong>${escHtml(a.element)}</strong></td>
            <td>${escHtml(a.description)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Opens a print-ready A4 HTML window for saving as PDF, falling back to HTML file
 * download if the browser blocks pop-up windows.
 */
export function openTechnicalReportPrintWindow(techSummary, openingSchedule) {
  const html = generateTechnicalReportHtml(techSummary, openingSchedule);
  const win = window.open('', '_blank');
  if (!win) {
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(html, 'text/html;charset=utf-8;', `vojackovi-troubelice-technicky-list-${dateStr}.html`);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
