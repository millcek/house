import { generateFloorPlanSvg } from '../builders/FloorPlanSvgGenerator.js';
import { getDesignVariant } from '../designs/index.js';

/**
 * Manages the interactive 2D SVG floor plan modal: sheet selection (`1np` / `2np` / `both`),
 * architectural layer toggles, units toggle (`mm` / `m`), pan & wheel zoom,
 * standalone SVG download, and print-to-PDF.
 */
export function initDrawingsController(store) {
  const modal = document.getElementById('drawings-modal');
  const viewport = document.getElementById('drawings-viewport');
  const stage = document.getElementById('drawings-svg-stage');

  const btnQuickDrawings = document.getElementById('btn-quick-drawings');
  const btnSidebarDrawings = document.getElementById('btn-sidebar-drawings');
  const btnClose = document.getElementById('btn-drawings-close');
  const btnDownload = document.getElementById('btn-drawings-download');
  const btnPrint = document.getElementById('btn-drawings-print');
  const btnUnits = document.getElementById('btn-drawings-units');
  const btnZoomOut = document.getElementById('btn-drawings-zoom-out');
  const btnZoomReset = document.getElementById('btn-drawings-zoom-reset');
  const btnZoomIn = document.getElementById('btn-drawings-zoom-in');

  const sheetButtons = modal?.querySelectorAll('[data-sheet]') || [];
  const layerButtons = modal?.querySelectorAll('[data-layer]') || [];

  const viewOpts = {
    sheet: '1np',
    showDimensions: true,
    showInteriorDims: true,
    showFurniture: true,
    showOpeningTags: true,
    showHatches: true,
    units: 'mm',
  };

  let isOpen = false;
  let currentSvgMarkup = '';
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

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

  function syncToolbarUi() {
    sheetButtons.forEach((btn) => {
      btn.classList.toggle('btn-primary', btn.dataset.sheet === viewOpts.sheet);
    });
    layerButtons.forEach((btn) => {
      const key = btn.dataset.layer;
      const active = Boolean(viewOpts[key]);
      btn.classList.toggle('active', active);
      btn.classList.toggle('btn-primary', active);
    });
    if (btnUnits) {
      btnUnits.textContent = `Jednotky: ${viewOpts.units}`;
    }
  }

  function renderDrawing() {
    if (!stage) return;
    const { activeModelId } = store.getState();
    const design = getDesignVariant(activeModelId);
    currentSvgMarkup = generateFloorPlanSvg(design, viewOpts);
    stage.innerHTML = currentSvgMarkup;
    syncToolbarUi();
  }

  function openModal() {
    if (!modal) return;
    const { floorMode, activeScheduleFloor } = store.getState();
    if (floorMode === '2np' || (floorMode === 'all' && activeScheduleFloor === '2np')) {
      viewOpts.sheet = '2np';
    } else if (floorMode === '1np') {
      viewOpts.sheet = '1np';
    }

    isOpen = true;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    renderDrawing();
    resetView();
  }

  function closeModal() {
    if (!modal || !isOpen) return;
    isOpen = false;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
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
    link.download = `dream-house-pudorys-${viewOpts.sheet}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Event bindings
  btnQuickDrawings?.addEventListener('click', openModal);
  btnSidebarDrawings?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnDownload?.addEventListener('click', downloadSvg);
  btnPrint?.addEventListener('click', () => {
    if (!currentSvgMarkup) renderDrawing();
    window.print();
  });

  sheetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSheet = btn.dataset.sheet;
      if (!nextSheet || nextSheet === viewOpts.sheet) return;
      viewOpts.sheet = nextSheet;
      renderDrawing();
      resetView();
    });
  });

  layerButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.layer;
      if (!key) return;
      viewOpts[key] = !viewOpts[key];
      renderDrawing();
    });
  });

  btnUnits?.addEventListener('click', () => {
    viewOpts.units = viewOpts.units === 'mm' ? 'm' : 'mm';
    renderDrawing();
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
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAt(zoom * factor, e.clientX, e.clientY);
    },
    { passive: false }
  );

  // Pointer drag pan
  viewport?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = panX;
    panOriginY = panY;
    viewport.classList.add('panning');
    viewport.setPointerCapture(e.pointerId);
  });

  viewport?.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    panX = panOriginX + (e.clientX - panStartX);
    panY = panOriginY + (e.clientY - panStartY);
    applyTransform();
  });

  const endPan = (e) => {
    if (!isPanning) return;
    isPanning = false;
    viewport?.classList.remove('panning');
    if (viewport && e.pointerId !== undefined && viewport.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }
  };

  viewport?.addEventListener('pointerup', endPan);
  viewport?.addEventListener('pointercancel', endPan);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeModal();
    }
  });

  store.subscribe(['activeModelId'], () => {
    if (isOpen) renderDrawing();
  });

  syncToolbarUi();
}
