import { generateFloorPlanSvg } from '../builders/FloorPlanSvgGenerator.js';
import { defaultDesign } from '../designs/index.js';
import { downloadFloorPlanDxf } from '../exports/DxfGenerator.js';
import { initDrawingMeasureController } from './DrawingMeasureController.js';

const VALID_SHEETS = new Set(['1np', '2np', 'both', 'elevations', 'sections']);

/**
 * Manages the interactive 2D SVG drawings modal: sheet selection (`1np` / `2np` / `both` / `elevations` / `sections`),
 * architectural layer toggles, units toggle (`mm` / `m`), pan, wheel zoom, pinch-to-zoom,
 * double-tap zoom/reset, mobile header popovers, standalone SVG/DXF download, and print-to-PDF.
 */
export function initDrawingsController(store, { siteConfig = null, auxiliaryBuildingConfig = null } = {}) {
  const modal = document.getElementById('drawings-modal');
  const viewport = document.getElementById('drawings-viewport');
  const stage = document.getElementById('drawings-svg-stage');

  const btnQuickDrawings = document.getElementById('btn-quick-drawings');
  const btnSidebarDrawings = document.getElementById('btn-sidebar-drawings');
  const btnClose = document.getElementById('btn-drawings-close');
  const btnDownload = document.getElementById('btn-drawings-download');
  const btnDownloadDxf = document.getElementById('btn-drawings-download-dxf');
  const btnDownloadDxfAll = document.getElementById('btn-drawings-download-dxf-all');
  const btnPrint = document.getElementById('btn-drawings-print');
  const btnUnits = document.getElementById('btn-drawings-units');
  const btnZoomOut = document.getElementById('btn-drawings-zoom-out');
  const btnZoomReset = document.getElementById('btn-drawings-zoom-reset');
  const btnZoomIn = document.getElementById('btn-drawings-zoom-in');

  const btnLayersToggle = document.getElementById('btn-drawings-layers-toggle');
  const layersPanel = document.getElementById('drawings-layers-panel');
  const btnExportToggle = document.getElementById('btn-drawings-export-toggle');
  const exportMenu = document.getElementById('drawings-actions-menu');

  const sheetButtons = modal?.querySelectorAll('[data-sheet]') || [];
  const layerButtons = modal?.querySelectorAll('[data-layer]') || [];

  const viewOpts = {
    sheet: '1np',
    showDimensions: true,
    showInteriorDims: true,
    showFurniture: true,
    showOpeningTags: true,
    showHatches: true,
    showAnalysis: false,
    units: 'mm',
  };

  let isOpen = false;
  let currentSvgMarkup = '';
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  const measureController = initDrawingMeasureController(stage, viewport, {
    getUnits: () => viewOpts.units,
    getSheet: () => viewOpts.sheet,
  });

  // Multi-touch & pointer tracking for pan, pinch-to-zoom, and double-tap
  const activePointers = new Map();
  let pointerDownMeta = null;
  let lastTapMeta = null;

  function applyTransform() {
    if (!stage) return;
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    if (btnZoomReset) {
      btnZoomReset.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  function resetView() {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function zoomAt(nextZoom, clientX, clientY) {
    if (!viewport) return;
    const clamped = Math.min(6, Math.max(0.35, nextZoom));
    const rect = viewport.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const contentX = (mx - panX) / zoom;
    const contentY = (my - panY) / zoom;

    zoom = clamped;
    panX = mx - contentX * zoom;
    panY = my - contentY * zoom;
    applyTransform();
  }

  function closePopovers() {
    layersPanel?.classList.remove('open');
    btnLayersToggle?.classList.remove('active');
    btnLayersToggle?.setAttribute('aria-expanded', 'false');
    exportMenu?.classList.remove('open');
    btnExportToggle?.classList.remove('active');
    btnExportToggle?.setAttribute('aria-expanded', 'false');
  }

  function togglePopover(panel, toggleBtn, otherPanel, otherBtn) {
    if (!panel) return;
    const willOpen = !panel.classList.contains('open');
    otherPanel?.classList.remove('open');
    otherBtn?.classList.remove('active');
    otherBtn?.setAttribute('aria-expanded', 'false');

    panel.classList.toggle('open', willOpen);
    toggleBtn?.classList.toggle('active', willOpen);
    toggleBtn?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  function syncToolbarUi() {
    const isNonPlan = viewOpts.sheet === 'elevations' || viewOpts.sheet === 'sections';
    sheetButtons.forEach((btn) => {
      btn.classList.toggle('btn-primary', btn.dataset.sheet === viewOpts.sheet);
    });
    layerButtons.forEach((btn) => {
      const key = btn.dataset.layer;
      const isFloorOnly = key === 'showFurniture' || key === 'showAnalysis';
      btn.disabled = isNonPlan && isFloorOnly;
      const active = Boolean(viewOpts[key]);
      btn.classList.toggle('active', active);
    });
    if (btnUnits) {
      btnUnits.textContent = `Jednotky: ${viewOpts.units}`;
    }
  }

  function renderDrawing() {
    if (!stage) return;
    const activeDesign = store.getState().activeDesign || defaultDesign;
    currentSvgMarkup = generateFloorPlanSvg(activeDesign, {
      ...viewOpts,
      siteConfig,
      housePos: store.getState().site?.housePos,
    });
    stage.innerHTML = currentSvgMarkup;
    measureController?.onDrawingRendered();
    syncToolbarUi();
  }

  function openModal(requestedSheet) {
    if (!modal) return;
    const { floorMode, activeScheduleFloor, drawings } = store.getState();
    let nextSheet = typeof requestedSheet === 'string' ? requestedSheet : drawings?.sheet;
    if (!nextSheet || !VALID_SHEETS.has(nextSheet)) {
      if (floorMode === '2np' || (floorMode === 'all' && activeScheduleFloor === '2np')) {
        nextSheet = '2np';
      } else {
        nextSheet = '1np';
      }
    }

    store.setState((prev) => ({
      sidebarOpen: false,
      sunBarOpen: false,
      layersMenuOpen: false,
      drawings: {
        ...(prev.drawings || {}),
        isOpen: true,
        sheet: nextSheet,
      },
    }));
  }

  function closeModal() {
    if (!modal) return;
    measureController?.setActive(false);
    closePopovers();
    const { drawings } = store.getState();
    if (!drawings?.isOpen && !isOpen) return;
    store.setState((prev) => ({
      drawings: {
        ...(prev.drawings || {}),
        isOpen: false,
      },
    }));
  }

  function applyOpenState(nextIsOpen, drawingsState) {
    if (!modal) return;
    const wasOpen = isOpen;
    isOpen = Boolean(nextIsOpen);

    if (isOpen) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      btnQuickDrawings?.classList.add('btn-primary');

      const targetSheet = VALID_SHEETS.has(drawingsState?.sheet) ? drawingsState.sheet : '1np';
      const targetUnits = drawingsState?.units === 'm' ? 'm' : 'mm';
      const targetDims = drawingsState?.showDimensions !== false;
      const targetIntDims = drawingsState?.showInteriorDims !== false;
      const targetFurn = drawingsState?.showFurniture !== false;
      const targetTags = drawingsState?.showOpeningTags !== false;
      const targetHatches = drawingsState?.showHatches !== false;
      const targetAnalysis = drawingsState?.showAnalysis === true;

      const changed =
        !wasOpen ||
        targetSheet !== viewOpts.sheet ||
        targetUnits !== viewOpts.units ||
        targetDims !== viewOpts.showDimensions ||
        targetIntDims !== viewOpts.showInteriorDims ||
        targetFurn !== viewOpts.showFurniture ||
        targetTags !== viewOpts.showOpeningTags ||
        targetHatches !== viewOpts.showHatches ||
        targetAnalysis !== viewOpts.showAnalysis;

      const sheetChanged = targetSheet !== viewOpts.sheet;
      const unitsChanged = targetUnits !== viewOpts.units;

      viewOpts.sheet = targetSheet;
      viewOpts.units = targetUnits;
      viewOpts.showDimensions = targetDims;
      viewOpts.showInteriorDims = targetIntDims;
      viewOpts.showFurniture = targetFurn;
      viewOpts.showOpeningTags = targetTags;
      viewOpts.showHatches = targetHatches;
      viewOpts.showAnalysis = targetAnalysis;

      if (changed) {
        renderDrawing();
        if (sheetChanged) {
          measureController?.onSheetChanged();
        }
        if (unitsChanged) {
          measureController?.onUnitsChanged();
        }
        if (!wasOpen) {
          resetView();
        }
      } else {
        syncToolbarUi();
      }
    } else {
      closePopovers();
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      btnQuickDrawings?.classList.remove('btn-primary');
    }
  }

  function downloadSvg() {
    if (!currentSvgMarkup) renderDrawing();
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const blob = new Blob([xmlHeader + currentSvgMarkup], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      viewOpts.sheet === 'elevations'
        ? 'vojackovi-troubelice-pohledy.svg'
        : viewOpts.sheet === 'sections'
          ? 'vojackovi-troubelice-rezy.svg'
          : `vojackovi-troubelice-pudorys-${viewOpts.sheet}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Event bindings
  btnQuickDrawings?.addEventListener('click', () => openModal());
  btnSidebarDrawings?.addEventListener('click', () => openModal());
  btnClose?.addEventListener('click', closeModal);

  btnLayersToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(layersPanel, btnLayersToggle, exportMenu, btnExportToggle);
  });

  btnExportToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(exportMenu, btnExportToggle, layersPanel, btnLayersToggle);
  });

  modal?.addEventListener('pointerdown', (e) => {
    if (!layersPanel?.classList.contains('open') && !exportMenu?.classList.contains('open')) {
      return;
    }
    const inLayers = layersPanel?.contains(e.target) || btnLayersToggle?.contains(e.target);
    const inExport = exportMenu?.contains(e.target) || btnExportToggle?.contains(e.target);
    if (!inLayers && !inExport) {
      closePopovers();
    }
  });

  btnDownload?.addEventListener('click', () => {
    downloadSvg();
    closePopovers();
  });
  btnDownloadDxf?.addEventListener('click', () => {
    const activeDesign = store.getState().activeDesign || defaultDesign;
    downloadFloorPlanDxf(activeDesign, {
      ...viewOpts,
      siteConfig,
      auxConfig: auxiliaryBuildingConfig,
      housePos: store.getState().site?.housePos,
    });
    closePopovers();
  });
  btnDownloadDxfAll?.addEventListener('click', () => {
    const activeDesign = store.getState().activeDesign || defaultDesign;
    downloadFloorPlanDxf(activeDesign, {
      ...viewOpts,
      sheet: 'complete',
      siteConfig,
      auxConfig: auxiliaryBuildingConfig,
      housePos: store.getState().site?.housePos,
    });
    closePopovers();
  });
  btnPrint?.addEventListener('click', () => {
    if (!currentSvgMarkup) renderDrawing();
    closePopovers();
    window.print();
  });

  sheetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSheet = btn.dataset.sheet;
      if (!nextSheet || nextSheet === viewOpts.sheet) return;
      store.setState((prev) => ({
        drawings: {
          ...(prev.drawings || {}),
          isOpen: true,
          sheet: nextSheet,
        },
      }));
    });
  });

  layerButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.layer;
      if (!key) return;
      store.setState((prev) => ({
        drawings: {
          ...(prev.drawings || {}),
          [key]: !viewOpts[key],
        },
      }));
    });
  });

  btnUnits?.addEventListener('click', () => {
    const nextUnits = viewOpts.units === 'mm' ? 'm' : 'mm';
    store.setState((prev) => ({
      drawings: {
        ...(prev.drawings || {}),
        units: nextUnits,
      },
    }));
  });

  btnZoomIn?.addEventListener('click', () => {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    zoomAt(zoom * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  btnZoomOut?.addEventListener('click', () => {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    zoomAt(zoom / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  btnZoomReset?.addEventListener('click', resetView);

  // Mouse wheel zoom centered on cursor
  viewport?.addEventListener(
    'wheel',
    (e) => {
      if (!isOpen) return;
      if (e.target?.closest?.('#drawings-measure-hud')) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAt(zoom * factor, e.clientX, e.clientY);
    },
    { passive: false }
  );

  // Unified multi-touch pinch-to-zoom, 1-finger / mouse drag pan, and double-tap zoom/reset
  viewport?.addEventListener('pointerdown', (e) => {
    if (e.target?.closest?.('#drawings-measure-hud')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture?.(e.pointerId);

    if (activePointers.size === 1) {
      pointerDownMeta = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        movedDist: 0,
      };
      viewport.classList.add('panning');
    } else {
      pointerDownMeta = null;
      viewport.classList.remove('panning');
    }
  });

  viewport?.addEventListener('pointermove', (e) => {
    if (e.target?.closest?.('#drawings-measure-hud')) return;
    const prev = activePointers.get(e.pointerId);
    if (!prev) {
      if (measureController?.isActive()) {
        measureController.onPointerMove(e);
      }
      return;
    }

    if (activePointers.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      panX += dx;
      panY += dy;
      if (pointerDownMeta && pointerDownMeta.id === e.pointerId) {
        pointerDownMeta.movedDist += Math.hypot(dx, dy);
      }
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      applyTransform();
      return;
    }

    if (activePointers.size === 2) {
      const entries = Array.from(activePointers.entries());
      const otherEntry = entries.find(([id]) => id !== e.pointerId);
      if (!otherEntry) return;
      const otherPt = otherEntry[1];

      const prevMidX = (prev.x + otherPt.x) / 2;
      const prevMidY = (prev.y + otherPt.y) / 2;
      const prevDist = Math.hypot(prev.x - otherPt.x, prev.y - otherPt.y);

      const nextPt = { x: e.clientX, y: e.clientY };
      activePointers.set(e.pointerId, nextPt);

      const currMidX = (nextPt.x + otherPt.x) / 2;
      const currMidY = (nextPt.y + otherPt.y) / 2;
      const currDist = Math.hypot(nextPt.x - otherPt.x, nextPt.y - otherPt.y);

      panX += currMidX - prevMidX;
      panY += currMidY - prevMidY;

      if (prevDist > 8 && currDist > 8) {
        zoomAt(zoom * (currDist / prevDist), currMidX, currMidY);
      } else {
        applyTransform();
      }
    }
  });

  const endPointer = (e, cancelled = false) => {
    if (e.target?.closest?.('#drawings-measure-hud')) return;
    const hadPointer = activePointers.has(e.pointerId);
    activePointers.delete(e.pointerId);

    if (viewport && viewport.hasPointerCapture?.(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }

    if (!cancelled && hadPointer && activePointers.size === 0 && pointerDownMeta?.id === e.pointerId) {
      const wasTap = pointerDownMeta.movedDist < 8;
      if (wasTap) {
        if (measureController?.isActive()) {
          measureController.onPointerTap(e);
          pointerDownMeta = null;
          viewport?.classList.remove('panning');
          return;
        }
        const now = performance.now();
        if (
          lastTapMeta &&
          now - lastTapMeta.time < 300 &&
          Math.hypot(e.clientX - lastTapMeta.x, e.clientY - lastTapMeta.y) < 28
        ) {
          lastTapMeta = null;
          if (zoom > 1.15) {
            resetView();
          } else {
            zoomAt(2.2, e.clientX, e.clientY);
          }
        } else {
          lastTapMeta = { time: now, x: e.clientX, y: e.clientY };
        }
      }
    }

    if (activePointers.size === 0) {
      pointerDownMeta = null;
      viewport?.classList.remove('panning');
    }
  };

  viewport?.addEventListener('pointerup', (e) => endPointer(e, false));
  viewport?.addEventListener('pointercancel', (e) => endPointer(e, true));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      if (layersPanel?.classList.contains('open') || exportMenu?.classList.contains('open')) {
        closePopovers();
      } else {
        closeModal();
      }
    }
  });

  store.subscribe(['drawings', 'activeModelId', 'activeDesign'], (state) => {
    applyOpenState(state.drawings?.isOpen, state.drawings);
    if (isOpen) {
      renderDrawing();
    }
  });

  const initialDrawings = store.getState().drawings;
  if (initialDrawings?.isOpen) {
    applyOpenState(true, initialDrawings);
  } else {
    syncToolbarUi();
  }
}
