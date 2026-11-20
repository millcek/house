import { computeBillOfMaterials, filterBomByScope } from '../budget/BillOfMaterials.js';
import { downloadBomCsv } from '../budget/CsvExporter.js';
import { estimateBomPrices } from '../budget/priceEstimator.js';
import { defaultDesign } from '../designs/index.js';
import { downloadFloorPlanDxf } from '../exports/DxfGenerator.js';
import {
  buildAreaAndTechnicalSummary,
  buildOpeningSchedule,
} from '../exports/ProjectSchedules.js';
import {
  downloadOpeningsCsv,
  downloadTechnicalSummaryCsv,
  openTechnicalReportPrintWindow,
} from '../exports/ScheduleExporters.js';

const ALL_SCOPES = ['house', 'aux', 'exterior'];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const nfCache = new Map();
function fmtNum(val, maxFrac = 2) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '–';
  if (!nfCache.has(maxFrac)) {
    nfCache.set(
      maxFrac,
      new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: maxFrac })
    );
  }
  return nfCache.get(maxFrac).format(Number(val));
}

function fmtMoney(val) {
  if (!val || Number.isNaN(Number(val))) return '0 Kč';
  return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.round(val))} Kč`;
}

/**
 * Manages the Rozpočet / Výkaz výměr sidebar tab: live quantity takeoff from geometry,
 * scope filtering (house / aux / exterior), price mode (turnkey vs. self-build),
 * volume per m3 metrics, search, and CSV export.
 */
export function initBudgetController(store, { siteConfig, auxiliaryBuildingConfig }) {
  const ifcNoteEl = document.getElementById('budget-ifc-note');
  const btnCsv = document.getElementById('btn-budget-csv');
  const btnCsvPriced = document.getElementById('btn-budget-csv-priced');
  const btnExportOpeningsCsv = document.getElementById('btn-export-openings-csv');
  const btnExportTechCsv = document.getElementById('btn-export-tech-csv');
  const btnExportTechPrint = document.getElementById('btn-export-tech-print');
  const btnExportCadDxf = document.getElementById('btn-export-cad-dxf');
  const openingsSummaryEl = document.getElementById('architect-openings-summary');
  const openingsTableEl = document.getElementById('architect-openings-table');
  const scopeButtons = document.querySelectorAll('.budget-scope-chip');

  const btnModeTurnkey = document.getElementById('btn-mode-turnkey');
  const btnModeSelf = document.getElementById('btn-mode-self');
  const costHighlightEl = document.getElementById('budget-cost-highlight');
  const volumeGridEl = document.getElementById('budget-volume-grid');

  const summaryGrid = document.getElementById('budget-summary-grid');
  const searchInput = document.getElementById('budget-search');
  const btnToggleAll = document.getElementById('btn-budget-toggle-all');
  const sectionsContainer = document.getElementById('budget-sections-container');
  const warningsContainer = document.getElementById('budget-warnings-container');

  const activeScopes = new Set(ALL_SCOPES);
  const openSections = new Set();
  let currentPriceMode = 'turnkey'; // 'turnkey' | 'self'
  let searchQuery = '';
  let lastFilteredBom = null;
  let lastPricingResult = null;
  let lastOpeningSchedule = null;
  let lastTechSummary = null;

  function renderCostHighlight(pricing) {
    if (!costHighlightEl || !volumeGridEl) return;

    const isTurnkey = currentPriceMode === 'turnkey';
    const isAllScopes = activeScopes.size === 3;
    const hasHouse = activeScopes.has('house');
    const hasAux = activeScopes.has('aux');
    const hasExt = activeScopes.has('exterior');

    let netCost = 0;
    if (hasHouse) netCost += isTurnkey ? pricing.scopes.house.turnkey : pricing.scopes.house.self;
    if (hasAux) netCost += isTurnkey ? pricing.scopes.aux.turnkey : pricing.scopes.aux.self;
    if (hasExt) netCost += isTurnkey ? pricing.scopes.exterior.turnkey : pricing.scopes.exterior.self;

    const vatCost = Math.round(netCost * 0.12);
    const grossCost = netCost + vatCost;

    let scopeLabel = 'Celý areál (dům + dílna + pozemek)';
    if (!isAllScopes) {
      const parts = [];
      if (hasHouse) parts.push('Dům');
      if (hasAux) parts.push('Dílna a stání');
      if (hasExt) parts.push('Terasa a pozemek');
      scopeLabel = parts.join(' + ') || 'Žádná vybraná část';
    }

    const modeTitle = isTurnkey ? 'Dodavatelsky na klíč (2026)' : 'Stavba svépomocí (materiál + profese)';
    const modeDesc = isTurnkey
      ? 'Kompletní realizace generálním dodavatelem na klíč (materiál, práce, lešení, mechanizace, záruka, režie a zisk).'
      : 'Nákup materiálu svépomocí za stavební ceny + subdodávky odborných profesí (krov, okna, stříkaný potěr, instalace TČ, revize elektro).';

      const workshopArea = auxiliaryBuildingConfig
        ? Math.round(auxiliaryBuildingConfig.workshopDepth ? auxiliaryBuildingConfig.width * auxiliaryBuildingConfig.workshopDepth : auxiliaryBuildingConfig.workshopWidth * auxiliaryBuildingConfig.depth)
        : 26;
      const parkingArea = auxiliaryBuildingConfig
        ? Math.round(auxiliaryBuildingConfig.parkDepth ? auxiliaryBuildingConfig.width * auxiliaryBuildingConfig.parkDepth : auxiliaryBuildingConfig.parkWidth * auxiliaryBuildingConfig.depth)
        : 39;

      costHighlightEl.innerHTML = `
      <div class="budget-cost-top">
        <span class="budget-cost-title">${esc(modeTitle)}</span>
        <span class="budget-cost-scope-tag">${esc(scopeLabel)}</span>
      </div>
      <div class="budget-cost-main">${fmtMoney(netCost)} <span style="font-size:14px; font-weight:600; color:#9ca3af;">bez DPH</span></div>
      <div class="budget-cost-vat">včetně DPH 12 %: ${fmtMoney(grossCost)}</div>
      <div class="budget-cost-note">${esc(modeDesc)}</div>

      <div class="budget-breakdown-list">
        <div class="budget-breakdown-row">
          <span class="budget-breakdown-label">🏠 Hlavní dům (${fmtNum(pricing.interiorArea, 1)} m²):</span>
          <span class="budget-breakdown-val">${fmtMoney(isTurnkey ? pricing.scopes.house.turnkey : pricing.scopes.house.self)}</span>
        </div>
        <div class="budget-breakdown-row">
          <span class="budget-breakdown-label">🔧 Vedlejší stavba (dílna ${workshopArea} m² + stání ${parkingArea} m² + krytý chodník):</span>
          <span class="budget-breakdown-val">${fmtMoney(isTurnkey ? pricing.scopes.aux.turnkey : pricing.scopes.aux.self)}</span>
        </div>
        <div class="budget-breakdown-row">
          <span class="budget-breakdown-label">🌿 Terasa, pergola, oplocení, vjezd, přípojky:</span>
          <span class="budget-breakdown-val">${fmtMoney(isTurnkey ? pricing.scopes.exterior.turnkey : pricing.scopes.exterior.self)}</span>
        </div>
      </div>

      ${pricing.phasing ? `
      <div class="budget-phasing-box" style="margin-top: 12px; padding: 10px 12px; background: rgba(30, 41, 59, 0.7); border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.25);">
        <div style="font-size: 13px; font-weight: 700; color: #93c5fd; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <span>📅 Etapizace výstavby (vč. DPH 12 %)</span>
          <span style="font-size: 11px; font-weight: 600; color: #34d399; background: rgba(52, 211, 153, 0.15); padding: 2px 6px; border-radius: 4px;">Výchozí: Etapa 1 (opt.)</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(16, 185, 129, 0.15); padding: 5px 8px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.35);">
            <span style="color: #6ee7b7; font-weight: 700;">★ 1. etapa (Výchozí RD 6+kk – Spiroll + SPC vinyl + mokré zóny):</span>
            <span style="font-weight: 700; font-size: 13px; color: #34d399;">${fmtMoney(isTurnkey ? pricing.phasing.stages.stage1Optimized.turnkeyGross : pricing.phasing.stages.stage1Optimized.selfGross)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-left: 8px; font-size: 11px; color: #94a3b8;">
            <span>↳ dřívější varianta před optimalizací (monolitický ŽB strop + dubové podlahy):</span>
            <span style="font-weight: 500; color: #94a3b8; text-decoration: line-through;">${fmtMoney(isTurnkey ? pricing.phasing.stages.stage1.turnkeyGross : pricing.phasing.stages.stage1.selfGross)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 3px;">
            <span style="color: #cbd5e1;">2. etapa: Technologie & komfort (FVE, žaluzie, dešťovka, terasa):</span>
            <span style="font-weight: 600; color: #f59e0b;">${fmtMoney(isTurnkey ? pricing.phasing.stages.stage2.turnkeyGross : pricing.phasing.stages.stage2.selfGross)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #cbd5e1;">3. etapa: Vedlejší stavba & areál (dílna, stání, brána, oplocení):</span>
            <span style="font-weight: 600; color: #a78bfa;">${fmtMoney(isTurnkey ? pricing.phasing.stages.stage3.turnkeyGross : pricing.phasing.stages.stage3.selfGross)}</span>
          </div>
        </div>
      </div>
      ` : ''}
    `;

    // Benchmark karty pro Obestavěný prostor a m3 / m2
    const m3Price = isTurnkey ? pricing.houseMetrics.turnkeyPerM3 : pricing.houseMetrics.selfPerM3;
    const m2Price = isTurnkey ? pricing.houseMetrics.turnkeyPerM2 : pricing.houseMetrics.selfPerM2;

    volumeGridEl.innerHTML = `
      <div class="budget-stat-card">
        <div class="budget-stat-label">Obestavěný prostor domu</div>
        <div class="budget-stat-val">${fmtNum(pricing.volumeInfo.totalVolume, 0)} m³</div>
        <div class="budget-stat-sub">nadzemní část: ${fmtNum(pricing.volumeInfo.aboveGroundVolume, 0)} m³</div>
      </div>
      <div class="budget-stat-card">
        <div class="budget-stat-label">Cena za 1 m³ (hlavní dům)</div>
        <div class="budget-stat-val" style="color: #60a5fa;">${fmtMoney(m3Price)} / m³</div>
        <div class="budget-stat-sub">vč. DPH 12 %: ${fmtMoney(m3Price * 1.12)}</div>
      </div>
      <div class="budget-stat-card">
        <div class="budget-stat-label">Užitná podlahová plocha</div>
        <div class="budget-stat-val">${fmtNum(pricing.interiorArea, 1)} m²</div>
        <div class="budget-stat-sub">půdorys 8×12 m (96 m²)</div>
      </div>
      <div class="budget-stat-card">
        <div class="budget-stat-label">Cena za 1 m² užitné plochy</div>
        <div class="budget-stat-val" style="color: #34d399;">${fmtMoney(m2Price)} / m²</div>
        <div class="budget-stat-sub">vč. DPH 12 %: ${fmtMoney(m2Price * 1.12)}</div>
      </div>
    `;
  }

  function renderSummary(filteredBom, fullBom) {
    if (!summaryGrid) return;
    const { summary } = fullBom;
    const filteredItemsCount = filteredBom.sections.reduce((s, sec) => s + sec.items.length, 0);
    const hasHouse = activeScopes.has('house');

    const cards = [
      {
        label: 'Položek ve výkazu',
        value: `${fmtNum(filteredItemsCount, 0)}`,
        sub: `${filteredBom.sections.length} oddílů`,
      },
      {
        label: 'Čistá podl. plocha',
        value: `${fmtNum(summary.interiorArea, 1)} m²`,
        sub: `Zastavěná ${fmtNum(summary.builtUpArea, 1)} m²`,
      },
      {
        label: 'Zdivo celkem',
        value: hasHouse ? `${fmtNum(summary.masonryArea, 1)} m²` : '–',
        sub: 'čistá plocha bez otvorů',
      },
      {
        label: 'Beton (dům)',
        value: hasHouse ? `${fmtNum(summary.concreteVolume, 1)} m³` : '–',
        sub: 'základy, deska, věnce, schody',
      },
      {
        label: 'Okna / Dveře',
        value: hasHouse ? `${summary.windowCount} / ${summary.doorCount} ks` : '–',
        sub: hasHouse ? `okna ${fmtNum(summary.windowArea, 1)} m²` : '',
      },
      {
        label: 'Střecha domu',
        value: hasHouse ? `${fmtNum(summary.roofArea, 1)} m²` : '–',
        sub: 'vč. přesahů',
      },
    ];

    summaryGrid.innerHTML = cards
      .map(
        (c) => `
        <div class="budget-stat-card">
          <div class="budget-stat-label">${esc(c.label)}</div>
          <div class="budget-stat-val">${esc(c.value)}</div>
          <div class="budget-stat-sub">${esc(c.sub)}</div>
        </div>`
      )
      .join('');
  }

  function renderSections(filteredBom) {
    if (!sectionsContainer) return;

    if (activeScopes.size === 0) {
      sectionsContainer.innerHTML =
        '<div class="hint-card">Vyberte alespoň jednu část projektu (Hlavní dům, Dílna & stání nebo Terasa & pozemek).</div>';
      if (btnToggleAll) btnToggleAll.disabled = true;
      return;
    }

    const isTurnkey = currentPriceMode === 'turnkey';
    const q = searchQuery.trim().toLowerCase();
    const visibleSections = filteredBom.sections
      .map((sec) => {
        if (!q) return sec;
        const secMatches = `${sec.code} ${sec.title}`.toLowerCase().includes(q);
        if (secMatches) return sec;
        const items = sec.items.filter((i) =>
          `${i.code} ${i.name} ${i.spec} ${i.calc}`.toLowerCase().includes(q)
        );
        return { ...sec, items };
      })
      .filter((sec) => sec.items.length > 0);

    if (btnToggleAll) {
      btnToggleAll.disabled = visibleSections.length === 0;
      const allOpen =
        visibleSections.length > 0 &&
        (Boolean(q) || visibleSections.every((s) => openSections.has(s.code)));
      btnToggleAll.textContent = allOpen ? 'Sbalit vše' : 'Rozbalit vše';
    }

    if (visibleSections.length === 0) {
      sectionsContainer.innerHTML =
        '<div class="hint-card">Hledanému výrazu neodpovídá žádná položka.</div>';
      return;
    }

    sectionsContainer.innerHTML = visibleSections
      .map((sec) => {
        const isOpen = Boolean(q) || openSections.has(sec.code);
        const subtotal = isTurnkey ? sec.subtotalTurnkey : sec.subtotalSelf;
        const subtotalText = subtotal > 0 ? fmtMoney(subtotal) : '';

        return `
          <details class="budget-section" data-code="${esc(sec.code)}"${isOpen ? ' open' : ''}>
            <summary class="budget-section-summary">
              <span class="budget-section-title">
                <span class="budget-section-code">${esc(sec.code)}</span>
                <span>${esc(sec.title)}</span>
              </span>
              <span class="budget-section-right">
                ${subtotalText ? `<span class="budget-section-subtotal">${esc(subtotalText)}</span>` : ''}
                <span class="budget-section-count">${sec.items.length} pol.</span>
              </span>
            </summary>
            <div class="budget-items-list">
              ${sec.items
                .map((item) => {
                  const qtyDec = item.unit === 'm³' ? 3 : 2;
                  const ordDec = item.unit === 'm³' ? 2 : 1;
                  const wasteLabel = item.waste ? `+${fmtNum(item.waste * 100, 0)} %` : '0 %';
                  const unitP = isTurnkey ? item.unitPriceTurnkey : item.unitPriceSelf;
                  const totalP = isTurnkey ? item.costTurnkey : item.costSelf;

                  return `
                    <div class="budget-item">
                      <div class="budget-item-head">
                        <span class="budget-item-code">${esc(item.code)}</span>
                        <span class="budget-item-name">${esc(item.name)}</span>
                      </div>
                      ${item.spec ? `<div class="budget-item-spec">${esc(item.spec)}</div>` : ''}
                      ${item.calc ? `<div class="budget-item-calc">📐 ${esc(item.calc)}</div>` : ''}
                      <div class="budget-item-qty-row">
                        <span>Čistá: <strong>${fmtNum(item.qty, qtyDec)} ${esc(item.unit)}</strong></span>
                        <span>Prořez: <strong>${esc(wasteLabel)}</strong></span>
                        <span class="budget-item-order">Objednat: <strong>${fmtNum(item.orderQty, ordDec)} ${esc(item.unit)}</strong></span>
                        ${
                          unitP
                            ? `<span class="budget-item-price-tag">
                                 <span class="unit-price">${fmtMoney(unitP)} / ${esc(item.unit)}</span>
                                 <strong class="total-price">${fmtMoney(totalP)}</strong>
                               </span>`
                            : ''
                        }
                      </div>
                    </div>`;
                })
                .join('')}
            </div>
          </details>
        `;
      })
      .join('');
  }

  function renderWarningsAndAssumptions(bom) {
    if (!warningsContainer) return;
    const warningsHtml =
      bom.warnings.length > 0
        ? `
          <div class="budget-warnings">
            <div class="budget-meta-title">⚠️ Upozornění k modelu</div>
            <ul>
              ${bom.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}
            </ul>
          </div>`
        : '';

    const assumptionsHtml = `
      <details class="budget-assumptions">
        <summary>ℹ️ Předpoklady výpočtu (${bom.assumptions.length})</summary>
        <ul>
          ${bom.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}
        </ul>
      </details>
    `;

    warningsContainer.innerHTML = warningsHtml + assumptionsHtml;
  }

  function renderArchitectOpeningsPreview(openingSchedule, techSummary) {
    if (openingsSummaryEl) {
      const s = openingSchedule.summary;
      const gPct = techSummary?.glazing?.glazingRatioPct ?? 0;
      openingsSummaryEl.innerHTML =
        `🪟 <strong>${s.totalGlazingCount} ks</strong> oken a HS portálů (` +
        `<strong>${fmtNum(s.windowAreaSqm, 2)} m²</strong>, ${fmtNum(gPct, 1)} % podl. plochy) · ` +
        `🚪 <strong>${s.extDoorCount}</strong> vchodové + <strong>${s.intDoorCount}</strong> vnitřní dveře · ` +
        `🧱 <strong>${fmtNum(techSummary.roomTotals.totalInteriorSqm, 1)} m²</strong> užitné plochy`;
    }

    if (openingsTableEl) {
      const rowsHtml = openingSchedule.groupedTypes
        .map(
          (g) => `
          <tr>
            <td><span class="architect-openings-mark">${esc(g.mark)}</span></td>
            <td>${esc(g.categoryLabel)}</td>
            <td>${g.widthMm}×${g.heightMm}</td>
            <td class="num">${g.sillMm}</td>
            <td class="num"><strong>${g.count}×</strong></td>
            <td class="num">${fmtNum(g.totalAreaSqm, 2)} m²</td>
          </tr>`
        )
        .join('');

      openingsTableEl.innerHTML = `
        <table class="architect-openings-table">
          <thead>
            <tr>
              <th>Zn.</th>
              <th>Typ</th>
              <th>Rozměr</th>
              <th class="num">Par.</th>
              <th class="num">Ks</th>
              <th class="num">Plocha</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    }
  }

  function render(state) {
    const { activeModelId, activeDesign, site } = state;
    const currentDesign = activeDesign || defaultDesign;
    const isCustomIfc = !activeDesign && activeModelId !== defaultDesign.id;
    if (ifcNoteEl) {
      ifcNoteEl.style.display = isCustomIfc ? 'block' : 'none';
    }

    const fullBom = computeBillOfMaterials({
      design: currentDesign,
      auxConfig: auxiliaryBuildingConfig,
      siteConfig,
      housePos: site?.housePos,
    });

    const pricing = estimateBomPrices(fullBom, currentDesign);
    lastPricingResult = pricing;

    // Přeneseme naceněné položky do výkazu pro zobrazení a CSV export
    const pricedBom = {
      ...fullBom,
      sections: pricing.sections,
    };

    const filteredBom = filterBomByScope(pricedBom, activeScopes);
    lastFilteredBom = filteredBom;

    const openingSchedule = buildOpeningSchedule(currentDesign, {
      siteConfig,
      housePos: site?.housePos,
    });
    const techSummary = buildAreaAndTechnicalSummary({
      design: currentDesign,
      siteConfig,
      auxConfig: auxiliaryBuildingConfig,
      housePos: site?.housePos,
    });
    lastOpeningSchedule = openingSchedule;
    lastTechSummary = techSummary;

    if (btnCsv) {
      btnCsv.disabled = filteredBom.sections.length === 0;
    }
    if (btnCsvPriced) {
      btnCsvPriced.disabled = filteredBom.sections.length === 0;
    }

    renderArchitectOpeningsPreview(openingSchedule, techSummary);
    renderCostHighlight(pricing);
    renderSummary(filteredBom, fullBom);
    renderSections(filteredBom);
    renderWarningsAndAssumptions(fullBom);
  }

  // Event handlers
  btnExportOpeningsCsv?.addEventListener('click', () => {
    if (!lastOpeningSchedule) return;
    const currentDesign = store.getState().activeDesign || defaultDesign;
    downloadOpeningsCsv(lastOpeningSchedule, currentDesign);
  });

  btnExportTechCsv?.addEventListener('click', () => {
    if (!lastTechSummary) return;
    downloadTechnicalSummaryCsv(lastTechSummary);
  });

  btnExportTechPrint?.addEventListener('click', () => {
    if (!lastTechSummary || !lastOpeningSchedule) return;
    openTechnicalReportPrintWindow(lastTechSummary, lastOpeningSchedule);
  });

  btnExportCadDxf?.addEventListener('click', () => {
    const currentDesign = store.getState().activeDesign || defaultDesign;
    downloadFloorPlanDxf(currentDesign, {
      sheet: 'complete',
      siteConfig,
      auxConfig: auxiliaryBuildingConfig,
      housePos: store.getState().site?.housePos,
    });
  });

  btnCsv?.addEventListener('click', () => {
    if (!lastFilteredBom || lastFilteredBom.sections.length === 0) return;
    downloadBomCsv(lastFilteredBom, null, { priceMode: 'blank' });
  });

  btnCsvPriced?.addEventListener('click', () => {
    if (!lastFilteredBom || lastFilteredBom.sections.length === 0) return;
    downloadBomCsv(lastFilteredBom, null, { priceMode: currentPriceMode });
  });

  btnModeTurnkey?.addEventListener('click', () => {
    currentPriceMode = 'turnkey';
    btnModeTurnkey.classList.add('btn-primary', 'active');
    btnModeSelf?.classList.remove('btn-primary', 'active');
    if (lastPricingResult && lastFilteredBom) {
      renderCostHighlight(lastPricingResult);
      renderSections(lastFilteredBom);
    }
  });

  btnModeSelf?.addEventListener('click', () => {
    currentPriceMode = 'self';
    btnModeSelf.classList.add('btn-primary', 'active');
    btnModeTurnkey?.classList.remove('btn-primary', 'active');
    if (lastPricingResult && lastFilteredBom) {
      renderCostHighlight(lastPricingResult);
      renderSections(lastFilteredBom);
    }
  });

  scopeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const scope = btn.dataset.scope;
      if (!scope) return;
      if (activeScopes.has(scope)) {
        activeScopes.delete(scope);
      } else {
        activeScopes.add(scope);
      }
      btn.classList.toggle('active', activeScopes.has(scope));
      btn.classList.toggle('btn-primary', activeScopes.has(scope));
      render(store.getState());
    });
  });

  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    if (lastFilteredBom) renderSections(lastFilteredBom);
  });

  btnToggleAll?.addEventListener('click', () => {
    if (!lastFilteredBom) return;
    const codes = lastFilteredBom.sections.map((s) => s.code);
    const allOpen = codes.length > 0 && codes.every((c) => openSections.has(c));
    if (allOpen) {
      openSections.clear();
    } else {
      codes.forEach((c) => openSections.add(c));
    }
    renderSections(lastFilteredBom);
  });

  sectionsContainer?.addEventListener(
    'toggle',
    (e) => {
      const details = e.target;
      if (!details?.classList?.contains('budget-section')) return;
      const code = details.dataset.code;
      if (!code) return;
      if (details.open) openSections.add(code);
      else openSections.delete(code);

      if (btnToggleAll && lastFilteredBom && !searchQuery.trim()) {
        const codes = lastFilteredBom.sections.map((s) => s.code);
        const allOpen = codes.length > 0 && codes.every((c) => openSections.has(c));
        btnToggleAll.textContent = allOpen ? 'Sbalit vše' : 'Rozbalit vše';
      }
    },
    true
  );

  store.subscribe(['activeModelId', 'site'], (state) => render(state));
  render(store.getState());
}
