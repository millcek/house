import { defaultDesign } from '../designs/index.js';
import {
  listAssemblies,
  exportAssemblyAsJson,
  getAssembly,
} from '../designs/assemblies.js';

/**
 * Manages Model selection, IFC upload & drag-and-drop, scene helper toggles,
 * loading indicator, and the BIM Properties inspector tab.
 */
export function initModelAndBimController(store, sceneManager, ifcController, gridHelper) {
  const versionSelect = document.getElementById('version-select');
  const modelStatus = document.getElementById('model-status');
  const fileInput = document.getElementById('file-input');
  const btnUpload = document.getElementById('btn-upload');
  const btnExportAssembly = document.getElementById('btn-export-assembly');
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

  const bimQuickCard = document.getElementById('bim-quick-card');
  const bimQuickType = document.getElementById('bim-quick-type');
  const bimQuickName = document.getElementById('bim-quick-name');
  const bimQuickMeta = document.getElementById('bim-quick-meta');
  const btnBimQuickDetail = document.getElementById('btn-bim-quick-detail');
  const btnBimQuickClose = document.getElementById('btn-bim-quick-close');

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

  btnExportAssembly?.addEventListener('click', () => {
    const activeModelId = store.getState().activeModelId || 'concept';
    const jsonStr = exportAssemblyAsJson(activeModelId);
    const assembly = getAssembly(activeModelId);
    const filename = `${assembly.code || activeModelId}.house.json`;
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });

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

  btnBimQuickClose?.addEventListener('click', () => {
    ifcController.clearSelection();
  });

  btnBimQuickDetail?.addEventListener('click', () => {
    store.setState({
      sidebarOpen: true,
      activeTab: 'bim',
      layersMenuOpen: false,
      sunBarOpen: false,
    });
  });

  function renderVersionSelect(activeModelId, uploadedModels) {
    if (!versionSelect) return;
    const assemblies = listAssemblies();
    const options = assemblies.map(
      (a) => `<option value="${a.id}">${a.label}</option>`
    );

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

  function renderQuickBimCard(state) {
    if (!bimQuickCard) return;
    const { selectedElement, sidebarOpen, activeTab, drawings, sunBarOpen } = state;
    const showQuickCard =
      Boolean(selectedElement) &&
      !(sidebarOpen && activeTab === 'bim') &&
      !drawings?.isOpen &&
      !sunBarOpen;

    bimQuickCard.classList.toggle('open', showQuickCard);
    bimQuickCard.setAttribute('aria-hidden', showQuickCard ? 'false' : 'true');

    if (!selectedElement) return;
    if (bimQuickType) bimQuickType.textContent = selectedElement.type || 'BIM';
    if (bimQuickName) bimQuickName.textContent = selectedElement.name || 'Prvek';
    if (bimQuickMeta) {
      const vals = Object.values(selectedElement.parameters || {})
        .filter((v) => v !== undefined && v !== null && v !== '' && v !== '—')
        .slice(0, 3);
      bimQuickMeta.textContent = vals.join(' · ') || selectedElement.description || '';
    }
  }

  function render(state) {
    const { activeModelId, uploadedModels, loading, selectedElement, site } = state;

    renderVersionSelect(activeModelId, uploadedModels);

    if (modelStatus) {
      if (activeModelId === defaultDesign.id) {
        modelStatus.textContent = 'Concept massing';
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

    gridHelper.visible = Boolean(site.gridVisible);
    sceneManager.plotGroup.visible = Boolean(site.plotVisible);

    if (btnToggleGrid) btnToggleGrid.textContent = `Grid: ${site.gridVisible ? 'ON' : 'OFF'}`;
    if (btnTogglePlot) btnTogglePlot.textContent = `Plot: ${site.plotVisible ? 'ON' : 'OFF'}`;

    renderInspector(selectedElement);
    renderQuickBimCard(state);
  }

  store.subscribe(
    [
      'activeModelId',
      'uploadedModels',
      'loading',
      'selectedElement',
      'site',
      'sidebarOpen',
      'activeTab',
      'drawings',
      'sunBarOpen',
    ],
    (state) => render(state)
  );
  render(store.getState());
}
