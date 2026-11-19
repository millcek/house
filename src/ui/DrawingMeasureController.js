/**
 * DrawingMeasureController.js
 *
 * Interactive distance and area measurement tool for 2D CAD floor plans and technical drawings.
 * Scale: 100 SVG units = 1.0 meter (1 SVG unit = 10 mm = 0.01 m).
 */

export function formatNumberWithSpaces(val) {
  const rounded = Math.round(val);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

export function calculateDistance(p1, p2, units = 'mm') {
  const dxSvg = p2.x - p1.x;
  const dySvg = p2.y - p1.y;
  const distSvg = Math.hypot(dxSvg, dySvg);
  const distM = distSvg / 100;
  const distMm = Math.round(distM * 1000);
  const dxM = Math.abs(dxSvg) / 100;
  const dyM = Math.abs(dySvg) / 100;
  const dxMm = Math.round(dxM * 1000);
  const dyMm = Math.round(dyM * 1000);

  const formattedDist =
    units === 'm'
      ? `${distM.toFixed(2)}\u00A0m`
      : `${formatNumberWithSpaces(distMm)}\u00A0mm`;

  const formattedSecondary =
    units === 'm'
      ? `${formatNumberWithSpaces(distMm)}\u00A0mm`
      : `${distM.toFixed(2)}\u00A0m`;

  return {
    distSvg,
    distM,
    distMm,
    dxM,
    dyM,
    dxMm,
    dyMm,
    formattedDist,
    formattedSecondary,
  };
}

export function calculatePolygonAreaAndPerimeter(points, units = 'mm') {
  if (!points || points.length < 3) {
    return {
      areaM2: 0,
      perimeterM: 0,
      perimeterMm: 0,
      formattedArea: '0.00\u00A0m²',
      formattedPerimeter: units === 'm' ? '0.00\u00A0m' : '0\u00A0mm',
      centroid: { x: 0, y: 0 },
    };
  }

  let shoelaceSum = 0;
  let perimeterSvg = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    shoelaceSum += p1.x * p2.y - p2.x * p1.y;
    perimeterSvg += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  const areaSvg = Math.abs(shoelaceSum) / 2;
  const areaM2 = Number((areaSvg / 10000).toFixed(2));
  const perimeterM = Number((perimeterSvg / 100).toFixed(2));
  const perimeterMm = Math.round(perimeterM * 1000);

  let cx = 0;
  let cy = 0;
  for (const pt of points) {
    cx += pt.x;
    cy += pt.y;
  }
  cx = Number((cx / n).toFixed(1));
  cy = Number((cy / n).toFixed(1));

  const formattedArea = `${areaM2.toFixed(2)}\u00A0m²`;
  const formattedPerimeter =
    units === 'm'
      ? `${perimeterM.toFixed(2)}\u00A0m`
      : `${formatNumberWithSpaces(perimeterMm)}\u00A0mm`;

  return {
    areaM2,
    perimeterM,
    perimeterMm,
    formattedArea,
    formattedPerimeter,
    centroid: { x: cx, y: cy },
  };
}

export function applyOrthoConstraint(startPt, currPt) {
  const dx = currPt.x - startPt.x;
  const dy = currPt.y - startPt.y;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45 degree steps
  const snappedAngle = Math.round(angle / step) * step;
  const dist = Math.hypot(dx, dy);

  return {
    x: Number((startPt.x + Math.cos(snappedAngle) * dist).toFixed(1)),
    y: Number((startPt.y + Math.sin(snappedAngle) * dist).toFixed(1)),
    angleDeg: Math.round((snappedAngle * 180) / Math.PI),
  };
}

export function findNearestSnapPoint(targetPt, snapPoints, maxDistSvg = 16) {
  if (!snapPoints || snapPoints.length === 0) return null;
  let best = null;
  let bestDist = maxDistSvg;

  for (const pt of snapPoints) {
    const d = Math.hypot(pt.x - targetPt.x, pt.y - targetPt.y);
    if (d < bestDist) {
      bestDist = d;
      best = pt;
    }
  }

  return best ? { ...best, dist: bestDist } : null;
}

export function collectSvgSnapPoints(svgElement) {
  if (!svgElement) return [];
  const points = [];

  const add = (x, y, type = 'corner') => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), type });
    }
  };

  // Wall rects, opening rects, column rects
  const rects = svgElement.querySelectorAll(
    'rect.cad-wall-struct, rect.cad-wall-part, rect.cad-wall-face, rect.cad-opening-line, rect.cad-col'
  );
  rects.forEach((r) => {
    const x = parseFloat(r.getAttribute('x') || 0);
    const y = parseFloat(r.getAttribute('y') || 0);
    const w = parseFloat(r.getAttribute('width') || 0);
    const h = parseFloat(r.getAttribute('height') || 0);
    if (w > 0 && h > 0) {
      add(x, y, 'corner');
      add(x + w, y, 'corner');
      add(x + w, y + h, 'corner');
      add(x, y + h, 'corner');
      add(x + w / 2, y + h / 2, 'center');
    }
  });

  // Lines: axis lines, door leaves, window sills, section cuts
  const lines = svgElement.querySelectorAll(
    'line.cad-axis-line, line.cad-door-leaf, line.cad-window-sill, line.cad-col-edge, line.cad-sec-cut'
  );
  lines.forEach((l) => {
    const x1 = parseFloat(l.getAttribute('x1') || 0);
    const y1 = parseFloat(l.getAttribute('y1') || 0);
    const x2 = parseFloat(l.getAttribute('x2') || 0);
    const y2 = parseFloat(l.getAttribute('y2') || 0);
    add(x1, y1, 'endpoint');
    add(x2, y2, 'endpoint');
    add((x1 + x2) / 2, (y1 + y2) / 2, 'midpoint');
  });

  // Polygons / polylines: non-orthogonal walls, slabs, stairs
  const polys = svgElement.querySelectorAll(
    'polygon.cad-wall-struct, polygon.cad-wall-part, polygon.cad-slab, polyline.cad-wall-part'
  );
  polys.forEach((p) => {
    const attr = p.getAttribute('points');
    if (attr) {
      const pairs = attr.trim().split(/\s+/);
      pairs.forEach((pair) => {
        const [px, py] = pair.split(',').map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          add(px, py, 'corner');
        }
      });
    }
  });

  // Spatial grid deduplication (10 SVG units = 100mm cell)
  const cellSize = 10;
  const grid = new Map();
  const deduped = [];
  for (const pt of points) {
    const cellKey = `${Math.floor(pt.x / cellSize)}:${Math.floor(pt.y / cellSize)}`;
    if (!grid.has(cellKey)) {
      grid.set(cellKey, pt);
      deduped.push(pt);
    }
  }

  return deduped;
}

/**
 * Initializes the interactive measurement controller on the SVG stage and viewport.
 */
export function initDrawingMeasureController(stage, viewport, options = {}) {
  const {
    getUnits = () => 'mm',
    getSheet = () => '1np',
    onStateChange = null,
  } = options;

  let active = false;
  let mode = 'dist'; // 'dist' | 'area'
  let snapEnabled = true;
  let orthoEnabled = false;
  let shiftPressed = false;

  const measurementsBySheet = {
    '1np': [],
    '2np': [],
    both: [],
    elevations: [],
    sections: [],
  };

  let activePoints = [];
  let hoverPt = null;
  let activeSnap = null;
  let cachedSnapPoints = [];

  // DOM elements
  const hud = document.getElementById('drawings-measure-hud');
  const btnDistMode = document.getElementById('btn-measure-mode-dist');
  const btnAreaMode = document.getElementById('btn-measure-mode-area');
  const btnSnap = document.getElementById('btn-measure-snap');
  const btnOrtho = document.getElementById('btn-measure-ortho');
  const btnFinish = document.getElementById('btn-measure-finish');
  const btnUndo = document.getElementById('btn-measure-undo');
  const btnClear = document.getElementById('btn-measure-clear');
  const btnClose = document.getElementById('btn-measure-close');
  const readout = document.getElementById('measure-hud-readout');

  function getSvgElement() {
    return stage?.querySelector('svg');
  }

  function getOrCreateOverlayGroup() {
    const svg = getSvgElement();
    if (!svg) return null;
    let group = svg.querySelector('#cad-measure-overlay');
    if (!group) {
      group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.id = 'cad-measure-overlay';
      group.setAttribute('class', 'cad-measure-overlay');
      svg.appendChild(group);
    }
    return group;
  }

  function getSvgCoordinates(e) {
    const svg = getSvgElement();
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const res = pt.matrixTransform(ctm.inverse());
    return {
      x: Number(res.x.toFixed(1)),
      y: Number(res.y.toFixed(1)),
    };
  }

  function refreshSnapPoints() {
    const svg = getSvgElement();
    cachedSnapPoints = svg ? collectSvgSnapPoints(svg) : [];
  }

  function syncHudUi() {
    if (btnDistMode) btnDistMode.classList.toggle('btn-primary', mode === 'dist');
    if (btnAreaMode) btnAreaMode.classList.toggle('btn-primary', mode === 'area');
    if (btnSnap) btnSnap.classList.toggle('active', snapEnabled);
    if (btnOrtho) btnOrtho.classList.toggle('active', orthoEnabled || shiftPressed);

    const sheet = getSheet();
    const currentList = measurementsBySheet[sheet] || [];

    if (btnFinish) {
      btnFinish.disabled = mode === 'area' ? activePoints.length < 3 : activePoints.length < 2;
    }
    if (btnUndo) {
      btnUndo.disabled = activePoints.length === 0 && currentList.length === 0;
    }
    if (btnClear) {
      btnClear.disabled = currentList.length === 0 && activePoints.length === 0;
    }
  }

  function updateReadout(customHtml = null) {
    if (!readout) return;
    if (customHtml) {
      readout.innerHTML = customHtml;
      return;
    }

    const units = getUnits();
    const sheet = getSheet();
    const count = (measurementsBySheet[sheet] || []).length;

    if (activePoints.length === 0) {
      if (count > 0) {
        readout.innerHTML = `<span class="measure-hud-prompt">Hotovo (${count} ${count === 1 ? 'měření' : count < 5 ? 'měření' : 'měření'}). Klikněte pro další měření.</span>`;
      } else {
        readout.innerHTML = `<span class="measure-hud-prompt">Klikněte do výkresu pro zadání 1. bodu ${mode === 'dist' ? 'vzdálenosti' : 'plochy'}</span>`;
      }
      return;
    }

    if (mode === 'dist') {
      const p1 = activePoints[0];
      const p2 = hoverPt || p1;
      const res = calculateDistance(p1, p2, units);
      const isOrtho = orthoEnabled || shiftPressed;

      readout.innerHTML = `
        <span class="measure-hud-prompt">Délka:</span>
        <span class="measure-val-accent">${res.formattedDist}</span>
        <span style="color:#94a3b8;font-size:11px;">(${res.formattedSecondary})</span>
        <span style="color:#64748b;margin:0 4px;">·</span>
        <span style="color:#cbd5e1;font-size:11px;">ΔX: ${units === 'm' ? res.dxM.toFixed(2) + ' m' : formatNumberWithSpaces(res.dxMm) + ' mm'}</span>
        <span style="color:#cbd5e1;font-size:11px;">ΔY: ${units === 'm' ? res.dyM.toFixed(2) + ' m' : formatNumberWithSpaces(res.dyMm) + ' mm'}</span>
        ${isOrtho ? '<span style="color:#f59e0b;font-size:11px;font-weight:700;">[ORTHO]</span>' : ''}
      `;
    } else {
      const previewPoints = hoverPt ? [...activePoints, hoverPt] : activePoints;
      const res = calculatePolygonAreaAndPerimeter(previewPoints, units);

      readout.innerHTML = `
        <span class="measure-hud-prompt">Plocha:</span>
        <span class="measure-val-accent">${res.formattedArea}</span>
        <span style="color:#64748b;margin:0 4px;">·</span>
        <span class="measure-hud-prompt">Obvod:</span>
        <span style="color:#38bdf8;font-weight:700;">${res.formattedPerimeter}</span>
        <span style="color:#64748b;margin:0 4px;">·</span>
        <span style="color:#94a3b8;font-size:11px;">${previewPoints.length} body (Enter = dokončit)</span>
      `;
    }
  }

  function renderCadTick(x, y, color = '#2563eb') {
    const d = 7;
    return `<line x1="${x - d}" y1="${y + d}" x2="${x + d}" y2="${y - d}" stroke="${color}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke" />`;
  }

  function renderDistanceItem(item, isDraft = false) {
    const { p1, p2, formattedDist } = item;
    const color = isDraft ? '#0284c7' : '#2563eb';
    const strokeDash = isDraft ? 'stroke-dasharray="6 4"' : '';
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const badgeW = Math.max(76, formattedDist.length * 9.5 + 24);

    return `
      <g class="cad-measure-dist-item">
        <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${color}" stroke-width="2.2" ${strokeDash} stroke-linecap="round" vector-effect="non-scaling-stroke" />
        ${renderCadTick(p1.x, p1.y, color)}
        ${renderCadTick(p2.x, p2.y, color)}
        <circle cx="${p1.x}" cy="${p1.y}" r="4" fill="#ffffff" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
        <circle cx="${p2.x}" cy="${p2.y}" r="4" fill="#ffffff" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
        <g transform="translate(${mx}, ${my})">
          <rect x="${-badgeW / 2}" y="-13" width="${badgeW}" height="25" rx="5" fill="#ffffff" stroke="${color}" stroke-width="1.6" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.18))" opacity="0.96" />
          <text text-anchor="middle" y="4.5" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12.5px; font-weight: 700; fill: #1e3a8a; pointer-events: none;">${formattedDist}</text>
        </g>
      </g>
    `;
  }

  function renderAreaItem(item, isDraft = false) {
    const { points, formattedArea, formattedPerimeter, centroid } = item;
    if (!points || points.length < 2) return '';
    const color = isDraft ? '#0284c7' : '#16a34a';
    const fillBg = isDraft ? 'rgba(2, 132, 199, 0.16)' : 'rgba(22, 163, 74, 0.18)';
    const strokeDash = isDraft ? 'stroke-dasharray="6 4"' : '';
    const ptsAttr = points.map((p) => `${p.x},${p.y}`).join(' ');

    const nodesSvg = points
      .map(
        (p, idx) => `
        <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${idx === 0 ? '#f59e0b' : '#ffffff'}" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
      `
      )
      .join('');

    const badgeSvg =
      points.length >= 3 && centroid
        ? `
        <g transform="translate(${centroid.x}, ${centroid.y})">
          <rect x="-68" y="-23" width="136" height="46" rx="7" fill="#ffffff" stroke="${color}" stroke-width="1.8" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.2))" opacity="0.96" />
          <text text-anchor="middle" y="-3.5" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13.5px; font-weight: 800; fill: #0f172a; pointer-events: none;">${formattedArea}</text>
          <text text-anchor="middle" y="14" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; fill: #64748b; pointer-events: none;">Obvod: ${formattedPerimeter}</text>
        </g>
      `
        : '';

    return `
      <g class="cad-measure-area-item">
        <polygon points="${ptsAttr}" fill="${fillBg}" stroke="${color}" stroke-width="2.2" ${strokeDash} vector-effect="non-scaling-stroke" />
        ${nodesSvg}
        ${badgeSvg}
      </g>
    `;
  }

  function renderSnapMarker(snap) {
    if (!snap) return '';
    const { x, y, type } = snap;
    const isClose = type === 'close-polygon';
    const strokeColor = isClose ? '#f59e0b' : '#10b981';
    const label = isClose ? 'Uzavřít plochu' : type === 'center' ? 'Střed' : 'Roh';

    return `
      <g class="cad-measure-snap-marker">
        <rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="none" stroke="${strokeColor}" stroke-width="2.4" transform="rotate(45 ${x} ${y})" vector-effect="non-scaling-stroke" />
        <rect x="${x + 12}" y="${y - 12}" width="${label.length * 8 + 14}" height="20" rx="4" fill="#0f172a" opacity="0.88" />
        <text x="${x + 19}" y="${y + 2}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10.5px; font-weight: 700; fill: #ffffff; pointer-events: none;">${label}</text>
      </g>
    `;
  }

  function renderOverlay() {
    const group = getOrCreateOverlayGroup();
    if (!group) return;

    if (!active) {
      group.innerHTML = '';
      return;
    }

    const sheet = getSheet();
    const completed = measurementsBySheet[sheet] || [];
    const parts = [];

    // 1. Render previously completed measurements for current sheet
    completed.forEach((item) => {
      if (item.type === 'dist') {
        parts.push(renderDistanceItem(item, false));
      } else if (item.type === 'area') {
        parts.push(renderAreaItem(item, false));
      }
    });

    // 2. Render active draft in progress
    if (activePoints.length > 0) {
      const units = getUnits();
      if (mode === 'dist') {
        const p1 = activePoints[0];
        const p2 = hoverPt || p1;
        const distInfo = calculateDistance(p1, p2, units);
        parts.push(
          renderDistanceItem(
            {
              p1,
              p2,
              formattedDist: distInfo.formattedDist,
            },
            true
          )
        );
      } else if (mode === 'area') {
        const previewPts = hoverPt ? [...activePoints, hoverPt] : activePoints;
        const areaInfo = calculatePolygonAreaAndPerimeter(previewPts, units);
        parts.push(
          renderAreaItem(
            {
              points: previewPts,
              formattedArea: areaInfo.formattedArea,
              formattedPerimeter: areaInfo.formattedPerimeter,
              centroid: areaInfo.centroid,
            },
            true
          )
        );
      }
    }

    // 3. Render snap marker
    if (activeSnap) {
      parts.push(renderSnapMarker(activeSnap));
    }

    group.innerHTML = parts.join('\n');
    syncHudUi();
    updateReadout();
  }

  function processPoint(rawPt) {
    let pt = { ...rawPt };
    activeSnap = null;

    // Check snapping if enabled
    if (snapEnabled) {
      // If area mode and > 2 points, add start point as priority snap target
      const snapCandidates = [...cachedSnapPoints];
      if (mode === 'area' && activePoints.length >= 2) {
        snapCandidates.unshift({
          x: activePoints[0].x,
          y: activePoints[0].y,
          type: 'close-polygon',
        });
      }

      const snapHit = findNearestSnapPoint(pt, snapCandidates, 16);
      if (snapHit) {
        pt = { x: snapHit.x, y: snapHit.y };
        activeSnap = snapHit;
      }
    }

    // Check Ortho constraint
    const isOrtho = orthoEnabled || shiftPressed;
    if (isOrtho && activePoints.length > 0) {
      const lastPt = activePoints[activePoints.length - 1];
      const constrained = applyOrthoConstraint(lastPt, pt);
      pt.x = constrained.x;
      pt.y = constrained.y;
    }

    return pt;
  }

  function commitDistance() {
    if (activePoints.length < 2) return;
    const p1 = activePoints[0];
    const p2 = activePoints[1];
    const units = getUnits();
    const info = calculateDistance(p1, p2, units);

    const sheet = getSheet();
    measurementsBySheet[sheet] = measurementsBySheet[sheet] || [];
    measurementsBySheet[sheet].push({
      type: 'dist',
      p1,
      p2,
      distM: info.distM,
      distMm: info.distMm,
      formattedDist: info.formattedDist,
      formattedSecondary: info.formattedSecondary,
    });

    activePoints = [];
    hoverPt = null;
    activeSnap = null;
    renderOverlay();
  }

  function commitArea() {
    if (activePoints.length < 3) return;
    const units = getUnits();
    const info = calculatePolygonAreaAndPerimeter(activePoints, units);

    const sheet = getSheet();
    measurementsBySheet[sheet] = measurementsBySheet[sheet] || [];
    measurementsBySheet[sheet].push({
      type: 'area',
      points: [...activePoints],
      areaM2: info.areaM2,
      perimeterM: info.perimeterM,
      perimeterMm: info.perimeterMm,
      formattedArea: info.formattedArea,
      formattedPerimeter: info.formattedPerimeter,
      centroid: info.centroid,
    });

    activePoints = [];
    hoverPt = null;
    activeSnap = null;
    renderOverlay();
  }

  function handlePointerTap(e) {
    if (!active) return;
    const rawPt = getSvgCoordinates(e);
    if (!rawPt) return;

    const pt = processPoint(rawPt);

    if (mode === 'dist') {
      if (activePoints.length === 0) {
        activePoints = [pt];
        hoverPt = pt;
        renderOverlay();
      } else {
        activePoints.push(pt);
        commitDistance();
      }
    } else if (mode === 'area') {
      // Check if closing polygon by tapping near start point
      if (
        activePoints.length >= 3 &&
        activeSnap &&
        activeSnap.type === 'close-polygon'
      ) {
        commitArea();
        return;
      }

      activePoints.push(pt);
      hoverPt = pt;
      renderOverlay();
    }
  }

  function handlePointerMove(e) {
    if (!active) return;
    const rawPt = getSvgCoordinates(e);
    if (!rawPt) return;

    hoverPt = processPoint(rawPt);
    renderOverlay();
  }

  function undoLastPoint() {
    if (activePoints.length > 0) {
      activePoints.pop();
      renderOverlay();
      return;
    }

    const sheet = getSheet();
    const list = measurementsBySheet[sheet] || [];
    if (list.length > 0) {
      list.pop();
      renderOverlay();
    }
  }

  function clearAllMeasurements() {
    const sheet = getSheet();
    measurementsBySheet[sheet] = [];
    activePoints = [];
    hoverPt = null;
    activeSnap = null;
    renderOverlay();
  }

  function setActive(nextActive) {
    active = Boolean(nextActive);
    if (viewport) {
      viewport.classList.toggle('measure-active', active);
    }
    if (hud) {
      hud.hidden = !active;
    }

    const btnToggle = document.getElementById('btn-drawings-measure-toggle');
    if (btnToggle) {
      btnToggle.classList.toggle('btn-primary', active);
      btnToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    if (active) {
      refreshSnapPoints();
      renderOverlay();
    } else {
      activePoints = [];
      hoverPt = null;
      activeSnap = null;
      renderOverlay();
    }

    if (typeof onStateChange === 'function') {
      onStateChange({ active, mode });
    }
  }

  function setMode(nextMode) {
    if (nextMode !== 'dist' && nextMode !== 'area') return;
    if (mode === nextMode) return;
    mode = nextMode;
    activePoints = [];
    hoverPt = null;
    activeSnap = null;
    renderOverlay();
  }

  // DOM Event Bindings
  btnDistMode?.addEventListener('click', () => setMode('dist'));
  btnAreaMode?.addEventListener('click', () => setMode('area'));

  btnSnap?.addEventListener('click', () => {
    snapEnabled = !snapEnabled;
    syncHudUi();
    renderOverlay();
  });

  btnOrtho?.addEventListener('click', () => {
    orthoEnabled = !orthoEnabled;
    syncHudUi();
    renderOverlay();
  });

  btnFinish?.addEventListener('click', () => {
    if (mode === 'area') {
      commitArea();
    } else if (mode === 'dist') {
      commitDistance();
    }
  });

  btnUndo?.addEventListener('click', undoLastPoint);
  btnClear?.addEventListener('click', clearAllMeasurements);
  btnClose?.addEventListener('click', () => setActive(false));

  const toggleBtn = document.getElementById('btn-drawings-measure-toggle');
  toggleBtn?.addEventListener('click', () => {
    setActive(!active);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      shiftPressed = true;
      syncHudUi();
      if (active) renderOverlay();
    }
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const modal = document.getElementById('drawings-modal');
      if (modal?.classList.contains('open') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setActive(!active);
      }
    }
    if (active) {
      if (e.key === 'Enter') {
        if (mode === 'area') commitArea();
        else if (mode === 'dist') commitDistance();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        undoLastPoint();
      } else if (e.key === 'Escape') {
        if (activePoints.length > 0) {
          activePoints = [];
          hoverPt = null;
          renderOverlay();
        } else {
          setActive(false);
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      shiftPressed = false;
      syncHudUi();
      if (active) renderOverlay();
    }
  });

  return {
    isActive: () => active,
    setActive,
    getMode: () => mode,
    setMode,
    onDrawingRendered: () => {
      refreshSnapPoints();
      if (active) renderOverlay();
    },
    onSheetChanged: () => {
      activePoints = [];
      hoverPt = null;
      activeSnap = null;
      refreshSnapPoints();
      if (active) renderOverlay();
    },
    onUnitsChanged: () => {
      const units = getUnits();
      // Update formatted strings of completed measurements
      Object.values(measurementsBySheet).forEach((list) => {
        list.forEach((item) => {
          if (item.type === 'dist') {
            const res = calculateDistance(item.p1, item.p2, units);
            item.formattedDist = res.formattedDist;
            item.formattedSecondary = res.formattedSecondary;
          } else if (item.type === 'area') {
            const res = calculatePolygonAreaAndPerimeter(item.points, units);
            item.formattedArea = res.formattedArea;
            item.formattedPerimeter = res.formattedPerimeter;
          }
        });
      });
      renderOverlay();
    },
    onPointerTap: handlePointerTap,
    onPointerMove: handlePointerMove,
    clearAll: clearAllMeasurements,
  };
}
