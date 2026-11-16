import { listDesignVariants } from '../designs/index.js';

/**
 * Manages Model selection, IFC upload & drag-and-drop, scene helper toggles,
 * loading indicator, and the BIM Properties inspector tab.
 */
export function initModelAndBimController(store, sceneManager, ifcController, gridHelper) {
  const versionSelect = document.getElementById('version-select');
  const modelStatus = document.getElementById('model-status');
  const fileInput = document.getElementById('file-input');
  const btnUpload = document.getElementById('btn-upload');
  const dropOverlay = document.getElementById('drop-overlay');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  const btnFitSidebar = document.getElementById('btn-fit-sidebar');
  const btnToggleGrid = document.getElementById('btn-toggle-grid');
  const btnTogglePlot = document.getElementById('btn-toggle-plot');

  const inspectorPanel = document.getElementById('inspector-panel');
  const inspectorContent = document.getElementById('inspector-content');
  const btnCloseInspector = document.getElementById('btn-close-inspector');
  const bimBadgeDot = document.getElementById('bim-badge-dot');

  const EMPTY_INSPECTOR_HTML = `
    <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
      Kliknutím na jakýkoliv prvek v modelu (stěna, okno, nábytek nebo načtený IFC prvek) zobrazíte jeho BIM vlastnosti, typ a parametry.
    </p>
  `;

  function handleFileRead(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = new Uint8Array(reader.result);
      await ifcController.loadIfcFromBuffer(buffer, file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  btnUpload?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
    e.target.value = '';
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay?.classList.add('active');
  });

  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
      dropOverlay?.classList.remove('active');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay?.classList.remove('active');
    const files = e.dataTransfer?.files;
    if (files?.length > 0 && files[0].name.toLowerCase().endsWith('.ifc')) {
      handleFileRead(files[0]);
    } else {
      alert('Please drop a valid .ifc file.');
    }
  });

  versionSelect?.addEventListener('change', async (e) => {
    await ifcController.selectModel(e.target.value);
  });

  btnFitSidebar?.addEventListener('click', () => {
    sceneManager.fitCameraToObject(sceneManager.siteContainer);
  });

  btnToggleGrid?.addEventListener('click', () => {
    const { site } = store.getState();
    const gridVisible = !site.gridVisible;
    gridHelper.visible = gridVisible;
    store.setState({ site: { ...site, gridVisible } });
  });

  btnTogglePlot?.addEventListener('click', () => {
    const { site } = store.getState();
    const plotVisible = !site.plotVisible;
    sceneManager.plotGroup.visible = plotVisible;
    store.setState({ site: { ...site, plotVisible } });
  });

  btnCloseInspector?.addEventListener('click', () => {
    ifcController.clearSelection();
  });

  function renderVersionSelect(activeModelId, uploadedModels) {
    if (!versionSelect) return;
    const variants = listDesignVariants();
    const options = variants.map((v) => `<option value="${v.id}">${v.label}</option>`);

    if (uploadedModels.length === 0) {
      options.push('<option value="upload" disabled>-- Drop or load .ifc --</option>');
    } else {
      for (const fileName of uploadedModels) {
        options.push(`<option value="${fileName}">Uploaded: ${fileName}</option>`);
      }
    }

    versionSelect.innerHTML = options.join('');
    versionSelect.value = activeModelId;
  }

  function renderInspector(selectedElement) {
    if (!inspectorContent) return;

    if (!selectedElement) {
      inspectorPanel?.classList.remove('visible');
      if (bimBadgeDot) bimBadgeDot.style.display = 'none';
      inspectorContent.innerHTML = EMPTY_INSPECTOR_HTML;
      return;
    }

    inspectorPanel?.classList.add('visible');
    if (bimBadgeDot) bimBadgeDot.style.display = 'block';

    let html = `
      <table class="props-table">
        <tr><td class="prop-name">Type:</td><td class="prop-val"><strong style="color:#60a5fa;">${selectedElement.type}</strong></td></tr>
        <tr><td class="prop-name">Name:</td><td class="prop-val">${selectedElement.name}</td></tr>
        <tr><td class="prop-name">GlobalId:</td><td class="prop-val" style="font-family:monospace;font-size:11px;">${selectedElement.globalId}</td></tr>
        <tr><td class="prop-name">Description:</td><td class="prop-val">${selectedElement.description}</td></tr>
      </table>
    `;

    const paramEntries = Object.entries(selectedElement.parameters || {});
    if (paramEntries.length > 0) {
      html += `<div style="margin-top:8px;font-size:11px;font-weight:600;color:#9ca3af;">Parameters:</div>`;
      html += `<table class="props-table">`;
      for (const [key, val] of paramEntries) {
        html += `<tr><td class="prop-name">${key}:</td><td class="prop-val">${val}</td></tr>`;
      }
      html += `</table>`;
    }

    inspectorContent.innerHTML = html;
  }

  function render(state) {
    const { activeModelId, uploadedModels, loading, selectedElement, site } = state;

    renderVersionSelect(activeModelId, uploadedModels);

    if (modelStatus) {
      const variants = listDesignVariants();
      const matched = variants.find((v) => v.id === activeModelId);
      if (matched) {
        modelStatus.textContent = matched.id === 'concept' ? 'Concept massing' : matched.label;
        modelStatus.style.color = '#60a5fa';
      } else {
        modelStatus.textContent = activeModelId;
        modelStatus.style.color = '#34d399';
      }
    }

    if (loadingOverlay && loadingText) {
      loadingText.textContent = loading.text || 'Parsing IFC model...';
      loadingOverlay.classList.toggle('visible', loading.active);
    }

    if (btnToggleGrid) btnToggleGrid.textContent = `Grid: ${site.gridVisible ? 'ON' : 'OFF'}`;
    if (btnTogglePlot) btnTogglePlot.textContent = `Plot: ${site.plotVisible ? 'ON' : 'OFF'}`;

    renderInspector(selectedElement);
  }

  store.subscribe(
    ['activeModelId', 'uploadedModels', 'loading', 'selectedElement', 'site'],
    (state) => render(state)
  );
  render(store.getState());
}
