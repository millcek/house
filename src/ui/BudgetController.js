import { computeBillOfMaterials, filterBomByScope } from '../budget/BillOfMaterials.js';
import { downloadBomCsv } from '../budget/CsvExporter.js';
import { estimateBomPrices, computeHouseVolume } from '../budget/priceEstimator.js';
import { getDesignVariant, listDesignVariants } from '../designs/index.js';

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

function shortVariantName(variant) {
  if (variant.id === 'concept') return 'Var. A (6+kk)';
  if (variant.id === 'v5kk') return 'Var. B (5+kk)';
  if (variant.id === 'original') return 'Původní';
  return variant.label || variant.id;
}

function sumMatchingItems(bom, sectionCode, nameRegex, unit = null) {
  const sec = bom.sections.find((s) => s.code === sectionCode);
  if (!sec) return 0;
  return sec.items
    .filter((i) => nameRegex.test(i.name) && (!unit || i.unit === unit))
    .reduce((acc, i) => acc + i.qty, 0);
}

/**
 * Manages the Rozpočet / Výkaz výměr sidebar tab: live quantity takeoff from geometry,
 * scope filtering (house / aux / exterior), price mode (turnkey vs. self-build),
 * volume per m3 metrics, variant comparison, search, and CSV export.
 */
export function initBudgetController(store, { siteConfig, auxiliaryBuildingConfig, ifcController }) {
  const variantSelect = document.getElementById('budget-variant-select');
  const ifcNoteEl = document.getElementById('budget-ifc-note');
  const btnCsv = document.getElementById('btn-budget-csv');
  const btnCsvPriced = document.getElementById('btn-budget-csv-priced');
  const scopeButtons = document.querySelectorAll('.budget-scope-chip');

  const btnModeTurnkey = document.getElementById('btn-mode-turnkey');
  const btnModeSelf = document.getElementById('btn-mode-self');
  const costHighlightEl = document.getElementById('budget-cost-highlight');
  const volumeGridEl = document.getElementById('budget-volume-grid');

  const summaryGrid = document.getElementById('budget-summary-grid');
  const compareContainer = document.getElementById('budget-compare-container');
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

  function getActiveDesign(activeModelId) {
    const variants = listDesignVariants();
    const matched = variants.find((v) => v.id === activeModelId);
    return {
      design: matched || getDesignVariant('concept'),
      isCustomIfc: !matched,
    };
  }

  function renderVariantSelect(activeModelId, isCustomIfc) {
    if (!variantSelect) return;
    const variants = listDesignVariants();
    if (variantSelect.options.length !== variants.length) {
      variantSelect.innerHTML = variants
        .map((v) => `<option value="${esc(v.id)}">${esc(v.label)}</option>`)
        .join('');
    }
    variantSelect.value = isCustomIfc ? 'concept' : activeModelId;
    if (ifcNoteEl) {
      ifcNoteEl.style.display = isCustomIfc ? 'block' : 'none';
    }
  }

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
          <span class="budget-breakdown-label">🔧 Vedlejší stavba (dílna 42 m² + stání 35 m² + loubí):</span>
          <span class="budget-breakdown-val">${fmtMoney(isTurnkey ? pricing.scopes.aux.turnkey : pricing.scopes.aux.self)}</span>
        </div>
        <div class="budget-breakdown-row">
          <span class="budget-breakdown-label">🌿 Terasa, pergola, oplocení, vjezd, přípojky:</span>
          <span class="budget-breakdown-val">${fmtMoney(isTurnkey ? pricing.scopes.exterior.turnkey : pricing.scopes.exterior.self)}</span>
        </div>
      </div>
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

  function renderComparison(activeDesignId) {
    if (!compareContainer) return;
    const variants = listDesignVariants();
    const boms = variants.map((v) => {
      const bom = computeBillOfMaterials({
        design: v,
        auxConfig: auxiliaryBuildingConfig,
        siteConfig,
      });
      const pricing = estimateBomPrices(bom, v);
      return { variant: v, bom, pricing };
    });

    const rows = [
      {
        label: 'Užitná plocha',
        val: ({ bom }) => `${fmtNum(bom.summary.interiorArea, 1)} m²`,
      },
      {
        label: 'Obestavěný prostor (dům)',
        val: ({ pricing }) => `${fmtNum(pricing.volumeInfo.totalVolume, 0)} m³`,
      },
      {
        label: 'Cena na klíč (hlavní dům)',
        val: ({ pricing }) => fmtMoney(pricing.scopes.house.turnkey),
      },
      {
        label: 'Cena za m³ (na klíč)',
        val: ({ pricing }) => `${fmtMoney(pricing.houseMetrics.turnkeyPerM3)}/m³`,
      },
      {
        label: 'Cena svépomocí (hlavní dům)',
        val: ({ pricing }) => fmtMoney(pricing.scopes.house.self),
      },
      {
        label: 'Cena za m³ (svépomoc)',
        val: ({ pricing }) => `${fmtMoney(pricing.houseMetrics.selfPerM3)}/m³`,
      },
      {
        label: 'Zdivo celkem',
        val: ({ bom }) => `${fmtNum(bom.summary.masonryArea, 1)} m²`,
      },
      {
        label: 'Nosné vnitřní zdivo',
        val: ({ bom }) => `${fmtNum(sumMatchingItems(bom, '03', /^Zdivo vnitřní nosné/, 'm²'), 1)} m²`,
      },
      {
        label: 'Příčky 160 mm',
        val: ({ bom }) => `${fmtNum(sumMatchingItems(bom, '03', /^Zdivo příčky/, 'm²'), 1)} m²`,
      },
      {
        label: 'Okna',
        val: ({ bom }) => `${bom.summary.windowCount} ks (${fmtNum(bom.summary.windowArea, 1)} m²)`,
      },
      {
        label: 'Dřevěná podlaha',
        val: ({ bom }) => `${fmtNum(sumMatchingItems(bom, '08', /^Dřevěná podlaha/, 'm²'), 1)} m²`,
      },
      {
        label: 'Dlažba',
        val: ({ bom }) => `${fmtNum(sumMatchingItems(bom, '08', /^Dlažba keramická/, 'm²'), 1)} m²`,
      },
    ];

    compareContainer.innerHTML = `
      <table class="budget-compare-table">
        <thead>
          <tr>
            <th>Ukazatel</th>
            ${boms
              .map(
                ({ variant }) =>
                  `<th class="${variant.id === activeDesignId ? 'is-active' : ''}">${esc(shortVariantName(variant))}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
              <tr>
                <td>${esc(r.label)}</td>
                ${boms
                  .map(
                    (b) =>
                      `<td class="${b.variant.id === activeDesignId ? 'is-active' : ''}">${esc(r.val(b))}</td>`
                  )
                  .join('')}
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
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

  function render(state) {
    const { activeModelId, site } = state;
    const { design, isCustomIfc } = getActiveDesign(activeModelId);
    renderVariantSelect(activeModelId, isCustomIfc);

    const fullBom = computeBillOfMaterials({
      design,
      auxConfig: auxiliaryBuildingConfig,
      siteConfig,
      housePos: site?.housePos,
    });

    const pricing = estimateBomPrices(fullBom, design);
    lastPricingResult = pricing;

    // Přeneseme naceněné položky do výkazu pro zobrazení a CSV export
    const pricedBom = {
      ...fullBom,
      sections: pricing.sections,
    };

    const filteredBom = filterBomByScope(pricedBom, activeScopes);
    lastFilteredBom = filteredBom;

    if (btnCsv) {
      btnCsv.disabled = filteredBom.sections.length === 0;
    }
    if (btnCsvPriced) {
      btnCsvPriced.disabled = filteredBom.sections.length === 0;
    }

    renderCostHighlight(pricing);
    renderSummary(filteredBom, fullBom);
    renderComparison(design.id);
    renderSections(filteredBom);
    renderWarningsAndAssumptions(fullBom);
  }

  // Event handlers
  variantSelect?.addEventListener('change', (e) => {
    ifcController?.loadConceptVariant(e.target.value);
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
