import { computeRoomSchedule } from './RoomBuilder.js';

const SCALE = 100; // 1 m = 100 SVG units

const DIR_VECTORS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function m2svg(val) {
  return Number((val * SCALE).toFixed(2));
}

function formatLength(meters, units = 'mm') {
  if (units === 'm') {
    return meters.toFixed(2).replace('.', ',');
  }
  const mm = Math.round(meters * 1000);
  return mm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

function formatTagDim(meters, units = 'mm') {
  if (units === 'm') {
    return meters.toFixed(2).replace('.', ',');
  }
  return String(Math.round(meters * 1000));
}

function formatArea(sqm) {
  return `${Number(sqm).toFixed(1).replace('.', ',')}\u00A0m²`;
}

function normalizeVec(x, z) {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function resolveOpeningCenter(op) {
  if (typeof op.at === 'number') return op.at;
  if (typeof op.offset === 'number') return op.offset;
  return 0;
}

function polygonPoints(pts) {
  return pts.map(([x, z]) => `${m2svg(x)},${m2svg(z)}`).join(' ');
}

function buildDefsAndStyles() {
  return `
  <defs>
    <style type="text/css"><![CDATA[
      .cad-sheet-bg { fill: #ffffff; }
      .cad-border-outer { fill: none; stroke: #0f172a; stroke-width: 3; }
      .cad-border-inner { fill: none; stroke: #334155; stroke-width: 1; }
      .cad-floor-wood { fill: #fcfaf6; stroke: #e5e0d5; stroke-width: 0.7; }
      .cad-overhang { fill: none; stroke: #64748b; stroke-width: 1.1; stroke-dasharray: 8 5; }
      .cad-ridge { fill: none; stroke: #94a3b8; stroke-width: 1; stroke-dasharray: 12 4 2 4; }
      .cad-pergola-outline { fill: rgba(254, 243, 199, 0.18); stroke: #b45309; stroke-width: 1.2; stroke-dasharray: 6 4; }
      .cad-pergola-rafter { stroke: #d97706; stroke-width: 0.7; stroke-dasharray: 4 4; opacity: 0.55; }
      .cad-pergola-post { fill: #78350f; stroke: #0f172a; stroke-width: 1; }
      .cad-canopy-outline { fill: rgba(224, 242, 254, 0.25); stroke: #0284c7; stroke-width: 1.1; stroke-dasharray: 5 4; }
      .cad-wall-part-stroke { fill: none; stroke: #334155; stroke-width: 2.4; stroke-linejoin: miter; }
      .cad-wall-struct-stroke { fill: none; stroke: #0f172a; stroke-width: 3.6; stroke-linejoin: miter; }
      .cad-window-sill { stroke: #475569; stroke-width: 0.9; }
      .cad-window-frame { fill: #ffffff; stroke: #0f172a; stroke-width: 1; }
      .cad-window-glass { stroke: #0284c7; stroke-width: 1.3; }
      .cad-door-leaf { fill: #ffffff; stroke: #0f172a; stroke-width: 1.3; }
      .cad-door-arc { fill: none; stroke: #64748b; stroke-width: 0.9; stroke-dasharray: 4 3; }
      .cad-door-threshold { stroke: #94a3b8; stroke-width: 0.8; stroke-dasharray: 3 3; }
      .cad-passage-lintel { stroke: #64748b; stroke-width: 0.9; stroke-dasharray: 5 4; }
      .cad-furn { fill: #ffffff; stroke: #475569; stroke-width: 1; }
      .cad-furn-subtle { fill: #f8fafc; stroke: #64748b; stroke-width: 0.9; }
      .cad-furn-dashed { fill: none; stroke: #94a3b8; stroke-width: 0.9; stroke-dasharray: 4 3; }
      .cad-furn-line { fill: none; stroke: #64748b; stroke-width: 0.8; }
      .cad-stair-tread { fill: #f8fafc; stroke: #334155; stroke-width: 1; }
      .cad-stair-tread-hidden { fill: none; stroke: #94a3b8; stroke-width: 0.9; stroke-dasharray: 4 3; }
      .cad-stair-walk { fill: none; stroke: #0f172a; stroke-width: 1.3; }
      .cad-stair-break { fill: none; stroke: #0f172a; stroke-width: 1.4; }
      .cad-chimney { fill: #e2e8f0; stroke: #0f172a; stroke-width: 1.6; }
      .cad-chimney-flue { fill: #ffffff; stroke: #0f172a; stroke-width: 1.2; }
      .cad-dim-line { stroke: #334155; stroke-width: 0.8; fill: none; }
      .cad-dim-ext { stroke: #94a3b8; stroke-width: 0.65; fill: none; }
      .cad-dim-tick { stroke: #0f172a; stroke-width: 1.3; }
      .cad-dim-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: #0f172a; text-anchor: middle; }
      .cad-tag-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 600; fill: #1e293b; text-anchor: middle; }
      .cad-micro-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9px; font-weight: 600; fill: #475569; text-anchor: middle; }
      .cad-room-halo { fill: rgba(255, 255, 255, 0.88); stroke: rgba(148, 163, 184, 0.55); stroke-width: 0.8; rx: 4; }
      .cad-room-id-bg { fill: #0f172a; rx: 2.5; }
      .cad-room-id-txt { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; font-weight: 700; fill: #ffffff; text-anchor: middle; }
      .cad-room-name { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 700; fill: #0f172a; text-anchor: middle; }
      .cad-room-area { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 700; fill: #1d4ed8; text-anchor: middle; }
      .cad-plan-heading { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 800; fill: #0f172a; letter-spacing: 0.04em; }
      .cad-plan-sub { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: #475569; }
      .cad-panel-box { fill: #f8fafc; stroke: #334155; stroke-width: 1.2; }
      .cad-panel-head { fill: #0f172a; }
      .cad-panel-head-txt { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11.5px; font-weight: 700; fill: #ffffff; letter-spacing: 0.05em; }
      .cad-table-txt { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: #0f172a; }
      .cad-table-num { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; fill: #0f172a; text-anchor: end; }
      .cad-table-row-line { stroke: #cbd5e1; stroke-width: 0.7; }
      .cad-title-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 18px; font-weight: 800; fill: #0f172a; }
      .cad-title-sub { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 600; fill: #1d4ed8; }
      .cad-title-label { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 600; fill: #64748b; text-transform: uppercase; }
      .cad-title-val { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11.5px; font-weight: 700; fill: #0f172a; }
    ]]></style>
    <pattern id="hatch-structural" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#cbd5e1" />
      <line x1="0" y1="0" x2="0" y2="8" stroke="#334155" stroke-width="1.6" />
    </pattern>
    <pattern id="hatch-partition" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="6" height="6" fill="#f1f5f9" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="#64748b" stroke-width="0.9" />
    </pattern>
    <pattern id="hatch-tiles" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#f8fafc" />
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" stroke-width="0.8" />
    </pattern>
    <pattern id="hatch-terrace" width="120" height="14" patternUnits="userSpaceOnUse">
      <rect width="120" height="14" fill="#fffbeb" />
      <line x1="0" y1="14" x2="120" y2="14" stroke="#f59e0b" stroke-opacity="0.35" stroke-width="0.8" />
      <line x1="60" y1="0" x2="60" y2="14" stroke="#f59e0b" stroke-opacity="0.2" stroke-width="0.6" />
    </pattern>
  </defs>`;
}

function renderFinishesAndOverhangs(floorConfig, designConfig, floorKey, showHatches) {
  const parts = [];
  parts.push('<g class="layer-finishes">');

  for (const fin of floorConfig.finishes || []) {
    const [w, d] = fin.size;
    const [cx, cz] = fin.pos;
    const x1 = cx - w / 2;
    const z1 = cz - d / 2;

    let fill = '#faf8f5';
    let stroke = '#e5e0d5';
    if (fin.material === 'tileFloor') {
      fill = showHatches ? 'url(#hatch-tiles)' : '#f8fafc';
      stroke = '#cbd5e1';
    } else if (fin.material === 'terrace') {
      fill = showHatches ? 'url(#hatch-terrace)' : '#fffbeb';
      stroke = '#d97706';
    }

    parts.push(
      `<rect x="${m2svg(x1)}" y="${m2svg(z1)}" width="${m2svg(w)}" height="${m2svg(d)}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`
    );
  }

  // Pergola & main entrance canopy on 1.NP
  if (floorKey === '1np') {
    const pergola = (floorConfig.furniture || []).find((f) => f.type === 'pergola');
    if (pergola?.posts?.length) {
      const halfPost = (pergola.postSize ?? 0.14) / 2;
      const xs = pergola.posts.map(([px]) => px);
      const zs = pergola.posts.map(([, pz]) => pz);
      const minX = Math.min(...xs) - halfPost;
      const maxX = Math.max(...xs) + halfPost;
      const minZ = Math.min(...zs) - halfPost;
      const maxZ = Math.max(...zs) + halfPost;

      parts.push(
        `<rect class="cad-pergola-outline" x="${m2svg(minX)}" y="${m2svg(minZ)}" width="${m2svg(maxX - minX)}" height="${m2svg(maxZ - minZ)}" />`
      );

      const rafterCount = pergola.rafterCount ?? 7;
      for (let i = 0; i < rafterCount; i++) {
        const rz = minZ + ((maxZ - minZ) * (i + 1)) / (rafterCount + 1);
        parts.push(
          `<line class="cad-pergola-rafter" x1="${m2svg(minX)}" y1="${m2svg(rz)}" x2="${m2svg(maxX)}" y2="${m2svg(rz)}" />`
        );
      }

      const postSize = pergola.postSize ?? 0.14;
      for (const [px, pz] of pergola.posts) {
        parts.push(
          `<rect class="cad-pergola-post" x="${m2svg(px - halfPost)}" y="${m2svg(pz - halfPost)}" width="${m2svg(postSize)}" height="${m2svg(postSize)}" />`
        );
      }
    }

    const canopy = (floorConfig.furniture || []).find((f) => f.type === 'canopy');
    if (canopy) {
      const [cw, , cd] = canopy.size;
      const [cx, cz] = canopy.pos;
      parts.push(
        `<rect class="cad-canopy-outline" x="${m2svg(cx - cw / 2)}" y="${m2svg(cz - cd / 2)}" width="${m2svg(cw)}" height="${m2svg(cd)}" />`
      );
      parts.push(
        `<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz)}" transform="rotate(-90 ${m2svg(cx)} ${m2svg(cz)})">PŘÍSTŘEŠEK</text>`
      );
    }
  }

  // Roof overhang dashed projection
  const roof = designConfig.roof;
  if (roof) {
    const ridgeZ = (roof.ridgeAxis || 'z') === 'z';
    const overX = ridgeZ ? (roof.eaveOverhang ?? 0.45) : (roof.gableOverhang ?? 0.35);
    const overZ = ridgeZ ? (roof.gableOverhang ?? 0.35) : (roof.eaveOverhang ?? 0.45);
    const rx = roof.width / 2 + overX;
    const rz = roof.length / 2 + overZ;
    parts.push(
      `<rect class="cad-overhang" x="${m2svg(-rx)}" y="${m2svg(-rz)}" width="${m2svg(rx * 2)}" height="${m2svg(rz * 2)}" />`
    );
    if (floorKey === '2np') {
      if (ridgeZ) {
        parts.push(
          `<line class="cad-ridge" x1="0" y1="${m2svg(-rz)}" x2="0" y2="${m2svg(rz)}" />`
        );
      } else {
        parts.push(
          `<line class="cad-ridge" x1="${m2svg(-rx)}" y1="0" x2="${m2svg(rx)}" y2="0" />`
        );
      }
    }
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderStairsAndChimney(designConfig, floorKey) {
  const parts = [];
  parts.push('<g class="layer-stairs">');

  const stairs = (designConfig.floor1?.furniture || []).find((f) => f.type === 'stairs');
  if (stairs && stairs.layout === 'u-turn') {
    const xStart = stairs.xStart ?? -0.5;
    const xLanding = stairs.xLanding ?? -2.58;
    const xEnd = stairs.xEnd ?? -3.62;
    const zFlight1 = stairs.zFlight1 ?? [-1.78, -0.84];
    const zFlight2 = stairs.zFlight2 ?? [-0.76, 0.18];
    const stepsPerFlight = stairs.stepsPerFlight ?? 8;
    const totalRise = stairs.totalRise ?? 2.98;
    const totalRisers = stepsPerFlight * 2 + 2;
    const riserHeight = totalRise / totalRisers;
    const stepRun = Math.abs(xStart - xLanding) / stepsPerFlight;
    const dir = xLanding <= xStart ? -1 : 1;

    const w1 = Math.abs(zFlight1[1] - zFlight1[0]);
    const z1Min = Math.min(zFlight1[0], zFlight1[1]);
    const z1Center = (zFlight1[0] + zFlight1[1]) / 2;

    const w2 = Math.abs(zFlight2[1] - zFlight2[0]);
    const z2Min = Math.min(zFlight2[0], zFlight2[1]);
    const z2Center = (zFlight2[0] + zFlight2[1]) / 2;

    const landingMinX = Math.min(xEnd, xLanding);
    const landingW = Math.abs(xLanding - xEnd);
    const zMinAll = Math.min(zFlight1[0], zFlight1[1], zFlight2[0], zFlight2[1]);
    const zMaxAll = Math.max(zFlight1[0], zFlight1[1], zFlight2[0], zFlight2[1]);
    const landingCenterX = (xEnd + xLanding) / 2;

    // Stairwell opening border on 2.NP
    if (floorKey === '2np') {
      parts.push(
        `<rect x="${m2svg(Math.min(xEnd, xStart))}" y="${m2svg(zMinAll)}" width="${m2svg(Math.abs(xStart - xEnd))}" height="${m2svg(zMaxAll - zMinAll)}" fill="#ffffff" stroke="#0f172a" stroke-width="1.6" />`
      );
    }

    // Mid-landing
    parts.push(
      `<rect class="cad-stair-tread" x="${m2svg(landingMinX)}" y="${m2svg(zMinAll)}" width="${m2svg(landingW)}" height="${m2svg(zMaxAll - zMinAll)}" />`
    );

    // Flight 1 treads
    for (let s = 0; s < stepsPerFlight; s++) {
      const sx1 = xStart + dir * s * stepRun;
      const sx2 = xStart + dir * (s + 1) * stepRun;
      const rx = Math.min(sx1, sx2);
      parts.push(
        `<rect class="cad-stair-tread" x="${m2svg(rx)}" y="${m2svg(z1Min)}" width="${m2svg(stepRun)}" height="${m2svg(w1)}" />`
      );
    }

    // Flight 2 treads (cut after step 2 with diagonal break line on 1.NP)
    const cutAfterStep = 2;
    for (let s = 0; s < stepsPerFlight; s++) {
      const sx1 = xLanding - dir * s * stepRun;
      const sx2 = xLanding - dir * (s + 1) * stepRun;
      const rx = Math.min(sx1, sx2);
      const cls = floorKey === '1np' && s > cutAfterStep ? 'cad-stair-tread-hidden' : 'cad-stair-tread';
      parts.push(
        `<rect class="${cls}" x="${m2svg(rx)}" y="${m2svg(z2Min)}" width="${m2svg(stepRun)}" height="${m2svg(w2)}" />`
      );
    }

    // Central balustrade gap divider
    const gapMinZ = Math.min(zFlight1[1], zFlight2[0]);
    const gapH = Math.abs(zFlight2[0] - zFlight1[1]);
    parts.push(
      `<rect x="${m2svg(Math.min(xLanding, xStart))}" y="${m2svg(gapMinZ)}" width="${m2svg(Math.abs(xStart - xLanding))}" height="${m2svg(gapH)}" fill="#cbd5e1" stroke="#334155" stroke-width="0.9" />`
    );

    // Walking line (výstupnice)
    const startX = xStart + dir * 0.14;
    const endWalkX = xStart - dir * 0.08;
    const walkPts = `${m2svg(startX)},${m2svg(z1Center)} ${m2svg(landingCenterX)},${m2svg(z1Center)} ${m2svg(landingCenterX)},${m2svg(z2Center)} ${m2svg(endWalkX)},${m2svg(z2Center)}`;
    parts.push(`<polyline class="cad-stair-walk" points="${walkPts}" />`);
    parts.push(`<circle cx="${m2svg(startX)}" cy="${m2svg(z1Center)}" r="4" fill="#ffffff" stroke="#0f172a" stroke-width="1.3" />`);

    // Arrowhead at end of walking line (pointing East/+X when dir === -1)
    const arrowDir = -dir;
    const tipX = m2svg(endWalkX);
    const tipY = m2svg(z2Center);
    parts.push(
      `<polyline class="cad-stair-walk" points="${tipX - arrowDir * 8},${tipY - 5} ${tipX},${tipY} ${tipX - arrowDir * 8},${tipY + 5}" />`
    );

    if (floorKey === '1np') {
      // Diagonal architectural break line across Flight 2
      const breakX = xLanding - dir * (cutAfterStep + 0.5) * stepRun;
      parts.push(
        `<line class="cad-stair-break" x1="${m2svg(breakX - 0.14)}" y1="${m2svg(z2Min - 0.06)}" x2="${m2svg(breakX + 0.14)}" y2="${m2svg(z2Min + w2 + 0.06)}" />`
      );
      parts.push(
        `<line class="cad-stair-break" x1="${m2svg(breakX - 0.06)}" y1="${m2svg(z2Min - 0.06)}" x2="${m2svg(breakX + 0.22)}" y2="${m2svg(z2Min + w2 + 0.06)}" />`
      );
      const riserMm = Math.round(riserHeight * 1000);
      const runMm = Math.round(stepRun * 1000);
      parts.push(
        `<text class="cad-micro-text" x="${m2svg((xStart + xLanding) / 2)}" y="${m2svg(z1Center - 0.14)}">${totalRisers}× ${riserMm}/${runMm} (NAHORU)</text>`
      );
      const landingElev = ((stepsPerFlight + 1) * riserHeight).toFixed(2).replace('.', ',');
      parts.push(
        `<text class="cad-micro-text" x="${m2svg(landingCenterX)}" y="${m2svg(zMinAll + 0.22)}">+${landingElev}</text>`
      );
    } else {
      // Gallery railing on 2.NP
      const railing = (designConfig.floor2?.furniture || []).find((f) => f.type === 'railing');
      if (railing) {
        const [rw, , rd] = railing.size;
        const [rx, rz] = railing.pos;
        parts.push(
          `<rect x="${m2svg(rx - rw / 2)}" y="${m2svg(rz - rd / 2)}" width="${m2svg(rw)}" height="${m2svg(rd)}" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.3" />`
        );
      }
      parts.push(
        `<text class="cad-micro-text" x="${m2svg((xStart + xLanding) / 2)}" y="${m2svg(z2Center - 0.14)}">VÝSTUP +3,100</text>`
      );
    }
  }

  // Chimney pass-through symbol
  const fireplace = (designConfig.floor1?.furniture || []).find((f) => f.type === 'fireplace');
  if (fireplace) {
    const [fx] = fireplace.pos;
    const chimneySize = 0.38;
    const chimneyZ = floorKey === '1np' ? 0.62 : 0.54;
    parts.push(
      `<rect class="cad-chimney" x="${m2svg(fx - chimneySize / 2)}" y="${m2svg(chimneyZ - chimneySize / 2)}" width="${m2svg(chimneySize)}" height="${m2svg(chimneySize)}" />`
    );
    parts.push(
      `<circle class="cad-chimney-flue" cx="${m2svg(fx)}" cy="${m2svg(chimneyZ)}" r="${m2svg(0.1)}" />`
    );
    if (floorKey === '2np') {
      parts.push(
        `<text class="cad-micro-text" x="${m2svg(fx)}" y="${m2svg(chimneyZ + 0.32)}">KOMÍN Ø200</text>`
      );
    }
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderSingleFurnitureItem(item, floorKey) {
  if (item.type === 'stairs' || item.type === 'pergola' || item.type === 'canopy' || item.type === 'railing') {
    return '';
  }

  const [cx, cz] = item.pos || [0, 0];
  const [w = 1, , d = 1] = item.size || [];
  const x = cx - w / 2;
  const z = cz - d / 2;
  const out = [];

  switch (item.type) {
    case 'wc': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="4" />`);
      if (w > d) {
        // Horizontal WC (2.05 against east wall)
        const cisternEast = cx > 2.5;
        const tankW = w * 0.28;
        const tankX = cisternEast ? x + w - tankW : x;
        const bowlCx = cisternEast ? x + (w - tankW) * 0.48 : x + tankW + (w - tankW) * 0.52;
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(tankX)}" y="${m2svg(z + 0.02)}" width="${m2svg(tankW)}" height="${m2svg(d - 0.04)}" rx="2" />`);
        out.push(`<ellipse class="cad-furn" cx="${m2svg(bowlCx)}" cy="${m2svg(cz)}" rx="${m2svg((w - tankW) * 0.42)}" ry="${m2svg(d * 0.36)}" />`);
      } else {
        // Vertical WC (1.03 against north wall)
        const cisternNorth = cz < 0;
        const tankD = d * 0.28;
        const tankZ = cisternNorth ? z : z + d - tankD;
        const bowlCz = cisternNorth ? z + tankD + (d - tankD) * 0.52 : z + (d - tankD) * 0.48;
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(x + 0.02)}" y="${m2svg(tankZ)}" width="${m2svg(w - 0.04)}" height="${m2svg(tankD)}" rx="2" />`);
        out.push(`<ellipse class="cad-furn" cx="${m2svg(cx)}" cy="${m2svg(bowlCz)}" rx="${m2svg(w * 0.36)}" ry="${m2svg((d - tankD) * 0.42)}" />`);
      }
      break;
    }

    case 'vanity': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      const longLen = Math.max(w, d);
      const basins = longLen >= 1.15 ? 2 : 1;
      if (w >= d) {
        const bw = (w - 0.16) / basins - (basins > 1 ? 0.06 : 0);
        const bd = Math.max(0.18, d - 0.14);
        for (let i = 0; i < basins; i++) {
          const bx = basins === 1 ? cx - bw / 2 : x + 0.08 + i * (bw + 0.12);
          const bz = cz - bd / 2;
          out.push(`<rect class="cad-furn-subtle" x="${m2svg(bx)}" y="${m2svg(bz)}" width="${m2svg(bw)}" height="${m2svg(bd)}" rx="5" />`);
          out.push(`<circle class="cad-furn-line" cx="${m2svg(bx + bw / 2)}" cy="${m2svg(cz)}" r="2.2" />`);
        }
      } else {
        const bw = Math.max(0.18, w - 0.14);
        const bd = Math.min(0.55, d - 0.18);
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(cx - bw / 2)}" y="${m2svg(cz - bd / 2)}" width="${m2svg(bw)}" height="${m2svg(bd)}" rx="5" />`);
        out.push(`<circle class="cad-furn-line" cx="${m2svg(cx)}" cy="${m2svg(cz)}" r="2.2" />`);
      }
      break;
    }

    case 'bathtub': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="4" />`);
      out.push(`<rect class="cad-furn-subtle" x="${m2svg(x + 0.09)}" y="${m2svg(z + 0.09)}" width="${m2svg(w - 0.18)}" height="${m2svg(d - 0.18)}" rx="18" />`);
      out.push(`<circle class="cad-furn-line" cx="${m2svg(x + 0.24)}" cy="${m2svg(cz)}" r="3" />`);
      break;
    }

    case 'shower': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`);
      out.push(`<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`);
      out.push(`<line class="cad-furn-line" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`);
      out.push(`<circle class="cad-furn" cx="${m2svg(cx)}" cy="${m2svg(cz)}" r="3.5" />`);
      break;
    }

    case 'bed': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      const horizontalSingle = w > d + 0.3;
      if (horizontalSingle) {
        // Headboard on East when cx > 0, else West
        const headEast = cx > 0;
        const headX = headEast ? x + w - 0.08 : x;
        const pilX = headEast ? x + w - 0.44 : x + 0.12;
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(headX)}" y="${m2svg(z)}" width="${m2svg(0.08)}" height="${m2svg(d)}" />`);
        out.push(`<rect class="cad-furn" x="${m2svg(pilX)}" y="${m2svg(z + 0.12)}" width="${m2svg(0.32)}" height="${m2svg(d - 0.24)}" rx="4" />`);
        const foldX = headEast ? x + w * 0.68 : x + w * 0.32;
        out.push(`<line class="cad-furn-line" x1="${m2svg(foldX)}" y1="${m2svg(z)}" x2="${m2svg(foldX)}" y2="${m2svg(z + d)}" />`);
      } else {
        // Headboard on North (-Z)
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(0.08)}" />`);
        const pillows = Math.min(w, d) >= 1.4 ? 2 : 1;
        const pw = (w - 0.24 - (pillows - 1) * 0.12) / pillows;
        for (let i = 0; i < pillows; i++) {
          const px = x + 0.12 + i * (pw + 0.12);
          out.push(`<rect class="cad-furn" x="${m2svg(px)}" y="${m2svg(z + 0.12)}" width="${m2svg(pw)}" height="${m2svg(0.36)}" rx="4" />`);
        }
        out.push(`<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z + 0.65)}" x2="${m2svg(x + w)}" y2="${m2svg(z + 0.65)}" />`);
      }
      break;
    }

    case 'wardrobe': {
      // Storage under stairs in 1.05 drawn subtly dashed so stairs remain primary
      const isUnderStairs = floorKey === '1np' && cx < -0.5 && cz > -1.0 && cz < 0.2;
      if (isUnderStairs) {
        out.push(`<rect class="cad-furn-dashed" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`);
      } else {
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`);
        out.push(`<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`);
        out.push(`<line class="cad-furn-line" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`);
      }
      break;
    }

    case 'desk': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      const chairR = 0.22;
      let chX = cx;
      let chZ = cz;
      if (w >= d) {
        chZ = cz < 0 ? z + d + 0.18 : z - 0.18;
      } else {
        chX = cx < 0 ? x + w + 0.18 : x - 0.18;
      }
      out.push(`<circle class="cad-furn-subtle" cx="${m2svg(chX)}" cy="${m2svg(chZ)}" r="${m2svg(chairR)}" />`);
      break;
    }

    case 'kitchenCounter': {
      out.push(`<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`);
      // East counter under strip window gets sink + drainer
      if (cx > 2.8 && d > 1.2) {
        out.push(`<rect class="cad-furn" x="${m2svg(x + 0.08)}" y="${m2svg(cz - 0.42)}" width="${m2svg(w - 0.16)}" height="${m2svg(0.84)}" rx="3" />`);
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(x + 0.11)}" y="${m2svg(cz - 0.36)}" width="${m2svg(w - 0.22)}" height="${m2svg(0.42)}" rx="3" />`);
        out.push(`<circle class="cad-furn-line" cx="${m2svg(cx)}" cy="${m2svg(cz - 0.15)}" r="2.2" />`);
      }
      break;
    }

    case 'kitchenIsland': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      // 4-zone induction cooktop
      const hobW = 0.56;
      const hobD = 0.72;
      const hx = cx - hobW / 2;
      const hz = cz - hobD / 2;
      out.push(`<rect class="cad-furn-subtle" x="${m2svg(hx)}" y="${m2svg(hz)}" width="${m2svg(hobW)}" height="${m2svg(hobD)}" rx="3" />`);
      for (const ox of [-0.14, 0.14]) {
        for (const oz of [-0.18, 0.18]) {
          out.push(`<circle class="cad-furn-line" cx="${m2svg(cx + ox)}" cy="${m2svg(cz + oz)}" r="${m2svg(0.09)}" />`);
        }
      }
      break;
    }

    case 'diningTable': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="3" />`);
      const cols = 3;
      const cw = 0.40;
      const cd = 0.22;
      for (let i = 0; i < cols; i++) {
        const chx = x + ((i + 0.5) * w) / cols - cw / 2;
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(chx)}" y="${m2svg(z - cd - 0.05)}" width="${m2svg(cw)}" height="${m2svg(cd)}" rx="3" />`);
        out.push(`<rect class="cad-furn-subtle" x="${m2svg(chx)}" y="${m2svg(z + d + 0.05)}" width="${m2svg(cw)}" height="${m2svg(cd)}" rx="3" />`);
      }
      break;
    }

    case 'lSofa': {
      for (const part of item.parts || []) {
        const [pw, , pd] = part.size;
        const [ox, oz] = part.offset;
        const px = cx + ox - pw / 2;
        const pz = cz + oz - pd / 2;
        out.push(`<rect class="cad-furn" x="${m2svg(px)}" y="${m2svg(pz)}" width="${m2svg(pw)}" height="${m2svg(pd)}" rx="4" />`);
      }
      break;
    }

    case 'coffeeTable': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="4" />`);
      break;
    }

    case 'tvStand': {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      out.push(`<rect fill="#334155" x="${m2svg(cx - w * 0.4)}" y="${m2svg(cz + d * 0.15)}" width="${m2svg(w * 0.8)}" height="4" />`);
      break;
    }

    case 'fireplace': {
      out.push(`<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      out.push(`<rect class="cad-furn" x="${m2svg(x + 0.08)}" y="${m2svg(z + 0.08)}" width="${m2svg(w - 0.16)}" height="${m2svg(d - 0.16)}" />`);
      break;
    }

    case 'hvac':
    case 'laundryStack': {
      out.push(`<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`);
      out.push(`<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`);
      const label = item.type === 'hvac' ? 'TČ' : 'P+S';
      out.push(`<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz + 0.04)}">${label}</text>`);
      break;
    }

    default: {
      out.push(`<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`);
    }
  }

  return out.join('\n');
}

function renderFurniture(floorConfig, floorKey) {
  const parts = ['<g class="layer-furniture">'];
  for (const item of floorConfig.furniture || []) {
    const svg = renderSingleFurnitureItem(item, floorKey);
    if (svg) parts.push(svg);
  }
  parts.push('</g>');
  return parts.join('\n');
}

function splitWallSegments(wallDef) {
  const [x1, z1] = wallDef.from;
  const [x2, z2] = wallDef.to;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;

  const ux = dx / length;
  const uz = dz / length;
  const nx = -uz;
  const nz = ux;
  const halfT = wallDef.thickness / 2;

  const openings = [...(wallDef.openings || [])]
    .map((op) => {
      const center = resolveOpeningCenter(op);
      const start = Math.max(0, center - op.width / 2);
      const end = Math.min(length, center + op.width / 2);
      return { ...op, center, start, end };
    })
    .sort((a, b) => a.start - b.start);

  const solidSegments = [];
  let cursor = 0;
  for (const op of openings) {
    if (op.start > cursor + 0.005) {
      solidSegments.push([cursor, op.start]);
    }
    cursor = Math.max(cursor, op.end);
  }
  if (cursor < length - 0.005) {
    solidSegments.push([cursor, length]);
  }

  const ptAt = (u, nOffset = 0) => [
    x1 + ux * u + nx * nOffset,
    z1 + uz * u + nz * nOffset,
  ];

  const solidPolys = solidSegments.map(([uStart, uEnd]) => [
    ptAt(uStart, -halfT),
    ptAt(uEnd, -halfT),
    ptAt(uEnd, halfT),
    ptAt(uStart, halfT),
  ]);

  return {
    wallDef,
    length,
    ux,
    uz,
    nx,
    nz,
    halfT,
    openings,
    solidPolys,
    ptAt,
  };
}

function renderDoorOpening(wallGeom, op) {
  const parts = [];
  const { ptAt, halfT } = wallGeom;
  const thickness = wallGeom.wallDef.thickness;
  const { hinge = 'start', dir = 'south' } = op.swing || {};
  const dirVec = DIR_VECTORS[dir] || [0, 1];

  const hingeU = hinge === 'start' ? op.start : op.end;
  const latchU = hinge === 'start' ? op.end : op.start;

  const [hcX, hcZ] = ptAt(hingeU, 0);
  const [lcX, lcZ] = ptAt(latchU, 0);

  // Hinge and closed-latch points on the swing-side face of the wall
  const hx = hcX + dirVec[0] * halfT;
  const hz = hcZ + dirVec[1] * halfT;
  const cx = lcX + dirVec[0] * halfT;
  const cz = lcZ + dirVec[1] * halfT;

  // Threshold / casing ticks
  const p1A = ptAt(op.start, -halfT);
  const p1B = ptAt(op.start, halfT);
  const p2A = ptAt(op.end, -halfT);
  const p2B = ptAt(op.end, halfT);
  parts.push(`<line class="cad-door-threshold" x1="${m2svg(p1A[0])}" y1="${m2svg(p1A[1])}" x2="${m2svg(p1B[0])}" y2="${m2svg(p1B[1])}" />`);
  parts.push(`<line class="cad-door-threshold" x1="${m2svg(p2A[0])}" y1="${m2svg(p2A[1])}" x2="${m2svg(p2B[0])}" y2="${m2svg(p2B[1])}" />`);

  // Open door tip
  const actualW = Math.hypot(cx - hx, cz - hz);
  const ox = hx + dirVec[0] * actualW;
  const oz = hz + dirVec[1] * actualW;

  // Door leaf rectangle (45 mm thick extending into doorway toward closed latch)
  const leafT = 0.045;
  const [uOx, uOz] = normalizeVec(ox - hx, oz - hz);
  const [uPx, uPz] = normalizeVec(cx - hx, cz - hz);
  const leafPts = [
    [hx, hz],
    [hx + uOx * actualW, hz + uOz * actualW],
    [hx + uOx * actualW + uPx * leafT, hz + uOz * actualW + uPz * leafT],
    [hx + uPx * leafT, hz + uPz * leafT],
  ];
  parts.push(`<polygon class="cad-door-leaf" points="${polygonPoints(leafPts)}" />`);

  // 90-degree swing arc
  const vOx = ox - hx;
  const vOz = oz - hz;
  const vCx = cx - hx;
  const vCz = cz - hz;
  const cross = vOx * vCz - vOz * vCx;
  const sweepFlag = cross > 0 ? 1 : 0;
  const rSvg = m2svg(actualW);
  parts.push(
    `<path class="cad-door-arc" d="M ${m2svg(ox)} ${m2svg(oz)} A ${rSvg} ${rSvg} 0 0 ${sweepFlag} ${m2svg(cx)} ${m2svg(cz)}" />`
  );

  // Subtle dashed wall-face closure line on non-swing side for exterior doors
  if (thickness > 0.25) {
    const oppA = [hcX - dirVec[0] * halfT, hcZ - dirVec[1] * halfT];
    const oppB = [lcX - dirVec[0] * halfT, lcZ - dirVec[1] * halfT];
    parts.push(`<line class="cad-door-threshold" x1="${m2svg(oppA[0])}" y1="${m2svg(oppA[1])}" x2="${m2svg(oppB[0])}" y2="${m2svg(oppB[1])}" />`);
  }

  return parts.join('\n');
}

function renderWindowOpening(wallGeom, op) {
  const parts = [];
  const { ptAt, halfT } = wallGeom;

  // Sill edge lines along both wall faces
  const f1A = ptAt(op.start, -halfT);
  const f1B = ptAt(op.end, -halfT);
  const f2A = ptAt(op.start, halfT);
  const f2B = ptAt(op.end, halfT);
  parts.push(`<line class="cad-window-sill" x1="${m2svg(f1A[0])}" y1="${m2svg(f1A[1])}" x2="${m2svg(f1B[0])}" y2="${m2svg(f1B[1])}" />`);
  parts.push(`<line class="cad-window-sill" x1="${m2svg(f2A[0])}" y1="${m2svg(f2A[1])}" x2="${m2svg(f2B[0])}" y2="${m2svg(f2B[1])}" />`);

  if (op.sliding) {
    // HS portal / French sliding double sash
    const mid = (op.start + op.end) / 2;
    const track1 = [
      ptAt(op.start, -0.055),
      ptAt(mid + 0.04, -0.055),
      ptAt(mid + 0.04, -0.005),
      ptAt(op.start, -0.005),
    ];
    const track2 = [
      ptAt(mid - 0.04, 0.005),
      ptAt(op.end, 0.005),
      ptAt(op.end, 0.055),
      ptAt(mid - 0.04, 0.055),
    ];
    parts.push(`<polygon class="cad-window-frame" points="${polygonPoints(track1)}" />`);
    parts.push(`<polygon class="cad-window-frame" points="${polygonPoints(track2)}" />`);
    const g1A = ptAt(op.start + 0.05, -0.03);
    const g1B = ptAt(mid, -0.03);
    const g2A = ptAt(mid, 0.03);
    const g2B = ptAt(op.end - 0.05, 0.03);
    parts.push(`<line class="cad-window-glass" x1="${m2svg(g1A[0])}" y1="${m2svg(g1A[1])}" x2="${m2svg(g1B[0])}" y2="${m2svg(g1B[1])}" />`);
    parts.push(`<line class="cad-window-glass" x1="${m2svg(g2A[0])}" y1="${m2svg(g2A[1])}" x2="${m2svg(g2B[0])}" y2="${m2svg(g2B[1])}" />`);
  } else {
    // Standard window frame + double glazing line
    const framePts = [
      ptAt(op.start, -0.05),
      ptAt(op.end, -0.05),
      ptAt(op.end, 0.05),
      ptAt(op.start, 0.05),
    ];
    parts.push(`<polygon class="cad-window-frame" points="${polygonPoints(framePts)}" />`);
    const g1A = ptAt(op.start + 0.04, -0.015);
    const g1B = ptAt(op.end - 0.04, -0.015);
    const g2A = ptAt(op.start + 0.04, 0.015);
    const g2B = ptAt(op.end - 0.04, 0.015);
    parts.push(`<line class="cad-window-glass" x1="${m2svg(g1A[0])}" y1="${m2svg(g1A[1])}" x2="${m2svg(g1B[0])}" y2="${m2svg(g1B[1])}" />`);
    parts.push(`<line class="cad-window-glass" x1="${m2svg(g2A[0])}" y1="${m2svg(g2A[1])}" x2="${m2svg(g2B[0])}" y2="${m2svg(g2B[1])}" />`);
  }

  return parts.join('\n');
}

function renderOpeningTag(wallGeom, op, units) {
  const { ptAt, ux, uz, halfT } = wallGeom;
  const isDoor = Boolean(op.swing || op.type === 'door');
  const wStr = formatTagDim(op.width, units);
  const hStr = formatTagDim(op.height, units);
  const sillStr = op.sill > 0.2 ? ` (${formatTagDim(op.sill, units)})` : '';
  const text = isDoor ? `${wStr}×${hStr}` : `${wStr}×${hStr}${sillStr}`;

  const [cx, cz] = ptAt(op.center, 0);
  const isHorizontal = Math.abs(ux) >= Math.abs(uz);

  let tx = cx;
  let tz = cz;
  let rot = 0;

  if (isHorizontal) {
    // Exterior North/South walls tag slightly outside; interior horizontal walls tag on non-swing side
    if (cz < -5.0) {
      tz = cz - halfT - 0.16;
    } else if (cz > 5.0) {
      tz = cz + halfT + 0.24;
    } else {
      const dirY = op.swing?.dir === 'north' ? 1 : -1;
      tz = cz + dirY * (halfT + 0.18);
    }
  } else {
    rot = -90;
    if (cx < -3.0) {
      tx = cx - halfT - 0.18;
    } else if (cx > 3.0) {
      tx = cx + halfT + 0.22;
    } else {
      const dirX = op.swing?.dir === 'west' ? 1 : -1;
      tx = cx + dirX * (halfT + 0.18);
    }
  }

  const sx = m2svg(tx);
  const sz = m2svg(tz);
  const transformAttr = rot !== 0 ? ` transform="rotate(${rot} ${sx} ${sz})"` : '';
  return `<text class="cad-tag-text" x="${sx}" y="${sz}"${transformAttr}>${esc(text)}</text>`;
}

function renderWallsAndOpenings(floorConfig, options) {
  const { showHatches = true, showOpeningTags = true } = options;
  const units = options.units || 'mm';

  const wallGeoms = (floorConfig.walls || []).map(splitWallSegments).filter(Boolean);
  const structWalls = wallGeoms.filter(
    (g) => g.wallDef.structural === true || (g.wallDef.material || 'wall') === 'wall'
  );
  const partWalls = wallGeoms.filter(
    (g) => !(g.wallDef.structural === true || (g.wallDef.material || 'wall') === 'wall')
  );

  const structFill = showHatches ? 'url(#hatch-structural)' : '#475569';
  const partFill = showHatches ? 'url(#hatch-partition)' : '#94a3b8';

  const parts = [];
  parts.push('<g class="layer-walls">');

  // Pass 1: Partition outlines
  for (const g of partWalls) {
    for (const poly of g.solidPolys) {
      parts.push(`<polygon class="cad-wall-part-stroke" points="${polygonPoints(poly)}" />`);
    }
  }

  // Pass 2: Partition opaque fills (hides inner stroke & partition-to-partition seams)
  for (const g of partWalls) {
    for (const poly of g.solidPolys) {
      parts.push(`<polygon fill="${partFill}" stroke="none" points="${polygonPoints(poly)}" />`);
    }
  }

  // Pass 3: Structural wall outlines
  for (const g of structWalls) {
    for (const poly of g.solidPolys) {
      parts.push(`<polygon class="cad-wall-struct-stroke" points="${polygonPoints(poly)}" />`);
    }
  }

  // Pass 4: Structural wall opaque fills (hides inner stroke & corner seams)
  for (const g of structWalls) {
    for (const poly of g.solidPolys) {
      parts.push(`<polygon fill="${structFill}" stroke="none" points="${polygonPoints(poly)}" />`);
    }
  }

  parts.push('</g>');

  // Openings layer
  parts.push('<g class="layer-openings">');
  for (const g of wallGeoms) {
    for (const op of g.openings) {
      if (op.type === 'window') {
        parts.push(renderWindowOpening(g, op));
      } else if (op.swing || op.type === 'door') {
        parts.push(renderDoorOpening(g, op));
      } else {
        // Pure open passage: dashed lintel lines
        const l1A = g.ptAt(op.start, -g.halfT);
        const l1B = g.ptAt(op.end, -g.halfT);
        const l2A = g.ptAt(op.start, g.halfT);
        const l2B = g.ptAt(op.end, g.halfT);
        parts.push(`<line class="cad-passage-lintel" x1="${m2svg(l1A[0])}" y1="${m2svg(l1A[1])}" x2="${m2svg(l1B[0])}" y2="${m2svg(l1B[1])}" />`);
        parts.push(`<line class="cad-passage-lintel" x1="${m2svg(l2A[0])}" y1="${m2svg(l2A[1])}" x2="${m2svg(l2B[0])}" y2="${m2svg(l2B[1])}" />`);
      }

      if (showOpeningTags && (op.type === 'window' || op.swing || op.type === 'door')) {
        parts.push(renderOpeningTag(g, op, units));
      }
    }
  }
  parts.push('</g>');

  return parts.join('\n');
}

function renderRoomStamps(floorConfig) {
  const { rooms } = computeRoomSchedule(floorConfig.rooms || []);
  const parts = ['<g class="layer-rooms">'];

  for (const room of rooms) {
    const [rx, , rz] = room.pos;
    const cx = m2svg(rx);
    const cz = m2svg(rz);

    // Compact badge layout for tight rooms
    const nameStr = room.name;
    const maxLineChars = 18;
    let lines = [nameStr];
    if (nameStr.length > maxLineChars) {
      const words = nameStr.split(' ');
      const line1 = [];
      const line2 = [];
      for (const word of words) {
        if (line1.join(' ').length + word.length + 1 <= maxLineChars || line1.length === 0) {
          line1.push(word);
        } else {
          line2.push(word);
        }
      }
      lines = line2.length ? [line1.join(' '), line2.join(' ')] : [line1.join(' ')];
    }

    const longest = Math.max(...lines.map((l) => l.length), 10);
    const boxW = Math.max(92, longest * 6.4 + 18);
    const boxH = lines.length > 1 ? 52 : 40;
    const boxX = cx - boxW / 2;
    const boxY = cz - boxH / 2;

    parts.push(`<rect class="cad-room-halo" x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH}" />`);
    parts.push(`<rect class="cad-room-id-bg" x="${(cx - 17).toFixed(1)}" y="${(boxY + 4).toFixed(1)}" width="34" height="13" />`);
    parts.push(`<text class="cad-room-id-txt" x="${cx}" y="${(boxY + 13.5).toFixed(1)}">${esc(room.id)}</text>`);

    if (lines.length === 1) {
      parts.push(`<text class="cad-room-name" x="${cx}" y="${(boxY + 26.5).toFixed(1)}">${esc(lines[0])}</text>`);
      parts.push(`<text class="cad-room-area" x="${cx}" y="${(boxY + 37.5).toFixed(1)}">${esc(formatArea(room.areaSqm))}</text>`);
    } else {
      parts.push(`<text class="cad-room-name" x="${cx}" y="${(boxY + 26).toFixed(1)}">${esc(lines[0])}</text>`);
      parts.push(`<text class="cad-room-name" x="${cx}" y="${(boxY + 37.5).toFixed(1)}">${esc(lines[1])}</text>`);
      parts.push(`<text class="cad-room-area" x="${cx}" y="${(boxY + 49).toFixed(1)}">${esc(formatArea(room.areaSqm))}</text>`);
    }
  }

  parts.push('</g>');
  return parts.join('\n');
}

function drawDimensionChain(nodes, axis, linePos, options = {}) {
  const { extStart = null, units = 'mm', textSide = -1 } = options;
  const parts = [];
  const tickLen = 0.08;
  const extOvershoot = 0.14 * (extStart !== null ? Math.sign(linePos - extStart) || 1 : 1);

  if (axis === 'x') {
    const zLine = linePos;
    const zMin = nodes[0];
    const zMax = nodes[nodes.length - 1];
    parts.push(`<line class="cad-dim-line" x1="${m2svg(zMin)}" y1="${m2svg(zLine)}" x2="${m2svg(zMax)}" y2="${m2svg(zLine)}" />`);

    for (const xVal of nodes) {
      if (extStart !== null) {
        parts.push(`<line class="cad-dim-ext" x1="${m2svg(xVal)}" y1="${m2svg(extStart)}" x2="${m2svg(xVal)}" y2="${m2svg(zLine + extOvershoot)}" />`);
      }
      parts.push(
        `<line class="cad-dim-tick" x1="${m2svg(xVal - tickLen)}" y1="${m2svg(zLine + tickLen)}" x2="${m2svg(xVal + tickLen)}" y2="${m2svg(zLine - tickLen)}" />`
      );
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      const span = nodes[i + 1] - nodes[i];
      if (span <= 0.01) continue;
      const midX = (nodes[i] + nodes[i + 1]) / 2;
      const label = formatLength(span, units);
      const labelY = m2svg(zLine) + (textSide < 0 ? -5 : 13);
      const sx = m2svg(midX);
      const isTight = span < 0.35;
      if (isTight) {
        parts.push(
          `<text class="cad-dim-text" style="font-size:9px;" x="${sx}" y="${labelY}">${esc(label)}</text>`
        );
      } else {
        parts.push(`<text class="cad-dim-text" x="${sx}" y="${labelY}">${esc(label)}</text>`);
      }
    }
  } else {
    const xLine = linePos;
    const zMin = nodes[0];
    const zMax = nodes[nodes.length - 1];
    parts.push(`<line class="cad-dim-line" x1="${m2svg(xLine)}" y1="${m2svg(zMin)}" x2="${m2svg(xLine)}" y2="${m2svg(zMax)}" />`);

    for (const zVal of nodes) {
      if (extStart !== null) {
        parts.push(`<line class="cad-dim-ext" x1="${m2svg(extStart)}" y1="${m2svg(zVal)}" x2="${m2svg(xLine + extOvershoot)}" y2="${m2svg(zVal)}" />`);
      }
      parts.push(
        `<line class="cad-dim-tick" x1="${m2svg(xLine - tickLen)}" y1="${m2svg(zVal + tickLen)}" x2="${m2svg(xLine + tickLen)}" y2="${m2svg(zVal - tickLen)}" />`
      );
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      const span = nodes[i + 1] - nodes[i];
      if (span <= 0.01) continue;
      const midZ = (nodes[i] + nodes[i + 1]) / 2;
      const label = formatLength(span, units);
      const sx = m2svg(xLine) + (textSide < 0 ? -6 : 13);
      const sy = m2svg(midZ);
      const isTight = span < 0.35;
      parts.push(
        `<text class="cad-dim-text" ${isTight ? 'style="font-size:9px;" ' : ''}x="${sx}" y="${sy}" transform="rotate(-90 ${sx} ${sy})">${esc(label)}</text>`
      );
    }
  }

  return parts.join('\n');
}

function collectWallOpeningNodes(wallDef, axis) {
  if (!wallDef) return [];
  const [x1, z1] = wallDef.from;
  const [x2, z2] = wallDef.to;
  const len = Math.hypot(x2 - x1, z2 - z1) || 1;
  const ux = (x2 - x1) / len;
  const uz = (z2 - z1) / len;
  const nodes = [];

  for (const op of wallDef.openings || []) {
    if (op.type === 'opening' && !op.swing) continue;
    const center = resolveOpeningCenter(op);
    const start = Math.max(0, center - op.width / 2);
    const end = Math.min(len, center + op.width / 2);
    if (axis === 'x') {
      nodes.push(x1 + ux * start, x1 + ux * end);
    } else {
      nodes.push(z1 + uz * start, z1 + uz * end);
    }
  }
  return nodes;
}

function sortUniqueCoords(coords) {
  const sorted = [...coords].sort((a, b) => a - b);
  const out = [];
  for (const val of sorted) {
    if (out.length === 0 || val - out[out.length - 1] > 0.005) {
      out.push(Number(val.toFixed(4)));
    }
  }
  return out;
}

function renderExteriorDimensions(floorConfig, floorKey, units) {
  const walls = floorConfig.walls || [];
  const findWall = (dir) => walls.find((w) => w.id?.endsWith(`-${dir}`));

  const northNodes = sortUniqueCoords([-4.0, ...collectWallOpeningNodes(findWall('north'), 'x'), 4.0]);
  const southNodes = sortUniqueCoords([-4.0, ...collectWallOpeningNodes(findWall('south'), 'x'), 4.0]);
  const eastNodes = sortUniqueCoords([-6.0, ...collectWallOpeningNodes(findWall('east'), 'z'), 6.0]);
  const westNodes = sortUniqueCoords([-6.0, ...collectWallOpeningNodes(findWall('west'), 'z'), 6.0]);

  const parts = ['<g class="layer-ext-dims">'];

  // North (top)
  parts.push(drawDimensionChain(northNodes, 'x', -6.65, { extStart: -6.0, units, textSide: -1 }));
  parts.push(drawDimensionChain([-4.0, 4.0], 'x', -7.20, { extStart: -6.0, units, textSide: -1 }));

  // South (bottom)
  parts.push(drawDimensionChain(southNodes, 'x', 6.65, { extStart: 6.0, units, textSide: 1 }));
  if (floorKey === '1np') {
    parts.push(drawDimensionChain([-8.0, -4.0, 4.0], 'x', 7.20, { extStart: 6.0, units, textSide: 1 }));
    parts.push(drawDimensionChain([-8.0, 4.0], 'x', 7.75, { extStart: 6.0, units, textSide: 1 }));
  } else {
    parts.push(drawDimensionChain([-4.0, 4.0], 'x', 7.20, { extStart: 6.0, units, textSide: 1 }));
  }

  // East (right)
  parts.push(drawDimensionChain(eastNodes, 'z', 4.65, { extStart: 4.0, units, textSide: -1 }));
  parts.push(drawDimensionChain([-6.0, 6.0], 'z', 5.20, { extStart: 4.0, units, textSide: -1 }));

  // West (left)
  if (floorKey === '1np') {
    parts.push(drawDimensionChain(westNodes, 'z', -8.65, { extStart: -4.0, units, textSide: -1 }));
    parts.push(drawDimensionChain([-6.0, 0.0, 6.0], 'z', -9.20, { extStart: -8.0, units, textSide: -1 }));
    parts.push(drawDimensionChain([-6.0, 6.0], 'z', -9.75, { extStart: -8.0, units, textSide: -1 }));
  } else {
    parts.push(drawDimensionChain(westNodes, 'z', -4.65, { extStart: -4.0, units, textSide: -1 }));
    parts.push(drawDimensionChain([-6.0, 6.0], 'z', -5.20, { extStart: -4.0, units, textSide: -1 }));
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderInteriorDimensions(floorKey, units) {
  const parts = ['<g class="layer-int-dims">'];

  if (floorKey === '1np') {
    parts.push(
      drawDimensionChain([-4.0, -3.62, -0.58, -0.42, 1.32, 1.48, 3.62, 4.0], 'x', -4.90, {
        units,
        textSide: -1,
      })
    );
    parts.push(drawDimensionChain([-4.0, -3.62, 3.62, 4.0], 'x', 3.35, { units, textSide: -1 }));
    parts.push(
      drawDimensionChain([-6.0, -5.62, -1.94, -1.78, 0.18, 0.42, 5.62, 6.0], 'z', -1.60, {
        units,
        textSide: -1,
      })
    );
    parts.push(
      drawDimensionChain([-6.0, -5.62, -2.22, -2.06, 0.18, 0.42, 5.62, 6.0], 'z', 2.85, {
        units,
        textSide: -1,
      })
    );
  } else {
    parts.push(
      drawDimensionChain([-4.0, -3.62, -0.58, -0.42, 3.62, 4.0], 'x', -4.90, {
        units,
        textSide: -1,
      })
    );
    parts.push(
      drawDimensionChain([-4.0, -3.62, -0.58, -0.42, 0.97, 1.13, 3.62, 4.0], 'x', -1.60, {
        units,
        textSide: -1,
      })
    );
    parts.push(
      drawDimensionChain([-4.0, -3.62, -0.38, -0.22, 3.62, 4.0], 'x', 3.60, {
        units,
        textSide: -1,
      })
    );
    parts.push(
      drawDimensionChain([-6.0, -5.62, -1.94, -1.78, 0.18, 0.34, 5.62, 6.0], 'z', -1.60, {
        units,
        textSide: -1,
      })
    );
    parts.push(
      drawDimensionChain(
        [-6.0, -5.62, -3.08, -2.92, -0.80, -0.64, 0.56, 0.72, 1.72, 1.88, 5.62, 6.0],
        'z',
        2.45,
        { units, textSide: -1 }
      )
    );
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderFloorPlanGroup(designConfig, floorKey, offsetX, offsetY, options) {
  const floorConfig = floorKey === '2np' ? designConfig.floor2 : designConfig.floor1;
  if (!floorConfig) return '';

  const title = floorKey === '2np' ? 'PŮDORYS 2.NP (PATRO)' : 'PŮDORYS 1.NP (PŘÍZEMÍ)';
  const elevText =
    floorKey === '2np'
      ? 'Úroveň č. podlahy +3,100 m (nosná deska +3,020 m)'
      : 'Úroveň č. podlahy +0,120 m (základová deska ±0,000 m)';

  const parts = [];
  parts.push(`<g transform="translate(${offsetX}, ${offsetY})">`);
  parts.push(`<text class="cad-plan-heading" x="-400" y="-825">${esc(title)}</text>`);
  parts.push(`<text class="cad-plan-sub" x="-400" y="-803">${esc(elevText)}</text>`);

  parts.push(renderFinishesAndOverhangs(floorConfig, designConfig, floorKey, options.showHatches !== false));
  parts.push(renderStairsAndChimney(designConfig, floorKey));
  if (options.showFurniture !== false) {
    parts.push(renderFurniture(floorConfig, floorKey));
  }
  parts.push(renderWallsAndOpenings(floorConfig, options));
  parts.push(renderRoomStamps(floorConfig));
  if (options.showInteriorDims !== false) {
    parts.push(renderInteriorDimensions(floorKey, options.units || 'mm'));
  }
  if (options.showDimensions !== false) {
    parts.push(renderExteriorDimensions(floorConfig, floorKey, options.units || 'mm'));
  }

  parts.push('</g>');
  return parts.join('\n');
}

function renderRoomScheduleTable(x, y, width, title, roomsConfig) {
  const schedule = computeRoomSchedule(roomsConfig || []);
  const rowH = 22;
  const headerH = 28;
  const interiorRooms = schedule.rooms.filter((r) => r.interior);
  const exteriorRooms = schedule.rooms.filter((r) => !r.interior);
  const totalRows = schedule.rooms.length + 1 + (exteriorRooms.length ? 1 : 0);
  const totalH = headerH + totalRows * rowH + 10;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="18">${esc(title)}</text>`);

  let curY = headerH + 17;
  const renderRow = (id, name, area, bold = false, accent = false) => {
    const weight = bold ? 'font-weight:700;' : '';
    const fill = accent ? 'fill:#1d4ed8;' : '';
    parts.push(
      `<text class="cad-table-txt" style="${weight}" x="12" y="${curY}">${id ? `${esc(id)}  ` : ''}${esc(name)}</text>`
    );
    parts.push(
      `<text class="cad-table-num" style="${weight}${fill}" x="${width - 12}" y="${curY}">${esc(formatArea(area))}</text>`
    );
    curY += rowH;
  };

  for (const r of interiorRooms) {
    renderRow(r.id, r.name, r.areaSqm);
    parts.push(`<line class="cad-table-row-line" x1="10" y1="${curY - 15}" x2="${width - 10}" y2="${curY - 15}" />`);
  }

  parts.push(`<line x1="10" y1="${curY - 15}" x2="${width - 10}" y2="${curY - 15}" stroke="#334155" stroke-width="1.2" />`);
  renderRow('', 'Užitná plocha podlaží celkem', schedule.interiorTotalSqm, true, true);

  for (const r of exteriorRooms) {
    parts.push(`<line class="cad-table-row-line" x1="10" y1="${curY - 15}" x2="${width - 10}" y2="${curY - 15}" />`);
    renderRow(r.id, r.name, r.areaSqm);
  }

  parts.push('</g>');
  return { svg: parts.join('\n'), height: totalH, interiorTotalSqm: schedule.interiorTotalSqm };
}

function renderCompassAndScale(x, y, width) {
  const h = 116;
  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`);

  // House North arrow (straight up) + true cadastral North (+26.5 deg)
  const cx = 56;
  const cy = 62;
  parts.push(`<circle cx="${cx}" cy="${cy}" r="32" fill="#ffffff" stroke="#334155" stroke-width="1.2" />`);
  parts.push(`<polygon points="${cx},${cy - 26} ${cx - 8},${cy + 12} ${cx},${cy + 5} ${cx + 8},${cy + 12}" fill="#0f172a" />`);
  parts.push(`<text class="cad-room-name" style="font-size:10.5px;" x="${cx}" y="20">S (DŮM)</text>`);

  // Graphic scale bar 0 - 5 m (1 m = 100 SVG units at 1:1 -> fit 0..3 m = 300px)
  const sx = 122;
  const sy = 56;
  const seg = 64;
  parts.push(`<text class="cad-title-label" x="${sx}" y="24">GRAFICKÉ MĚŘÍTKO (1:50)</text>`);
  for (let i = 0; i < 5; i++) {
    const fill = i % 2 === 0 ? '#0f172a' : '#ffffff';
    parts.push(`<rect x="${sx + i * seg}" y="${sy}" width="${seg}" height="9" fill="${fill}" stroke="#0f172a" stroke-width="1" />`);
    parts.push(`<text class="cad-micro-text" x="${sx + i * seg}" y="${sy + 22}">${i}</text>`);
  }
  parts.push(`<text class="cad-micro-text" x="${sx + 5 * seg}" y="${sy + 22}">5 m</text>`);
  parts.push(`<text class="cad-micro-text" style="text-anchor:start;" x="${sx}" y="98">Natočení pozemku: +26,5° od skutečného severu</text>`);

  parts.push('</g>');
  return { svg: parts.join('\n'), height: h };
}

function renderLegend(x, y, width, units, showHatches = true) {
  const h = 136;
  const structFill = showHatches ? 'url(#hatch-structural)' : '#475569';
  const partFill = showHatches ? 'url(#hatch-partition)' : '#94a3b8';
  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`);
  parts.push(`<rect class="cad-panel-head" x="0" y="0" width="${width}" height="24" />`);
  parts.push(`<text class="cad-panel-head-txt" x="12" y="16">LEGENDA KONSTRUKCÍ A ZNAČEK</text>`);

  parts.push(`<rect x="14" y="36" width="28" height="14" fill="${structFill}" stroke="#0f172a" stroke-width="1.5" />`);
  parts.push(`<text class="cad-table-txt" x="50" y="47">Nosné zdivo (380 / 240 / 160 mm)</text>`);

  parts.push(`<rect x="14" y="60" width="28" height="14" fill="${partFill}" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<text class="cad-table-txt" x="50" y="71">Dělicí příčka (160 mm)</text>`);

  parts.push(`<rect x="14" y="84" width="28" height="12" fill="#ffffff" stroke="#0f172a" stroke-width="1" />`);
  parts.push(`<line x1="14" y1="90" x2="42" y2="90" stroke="#0284c7" stroke-width="1.4" />`);
  parts.push(`<text class="cad-table-txt" x="50" y="94">Okno / HS portál · kóta: š×v (parapet)</text>`);

  parts.push(`<line x1="14" y1="114" x2="42" y2="114" stroke="#64748b" stroke-width="1.1" stroke-dasharray="6 3" />`);
  parts.push(`<text class="cad-table-txt" x="50" y="118">Přesah střechy / zastřešení · Kóty v ${units}</text>`);

  parts.push('</g>');
  return { svg: parts.join('\n'), height: h };
}

function renderTitleBlock(x, y, width, designConfig, sheet, units) {
  const h = 152;
  const parts = [];
  const docTitle =
    sheet === 'both'
      ? 'PŮDORYS 1.NP A 2.NP'
      : sheet === '2np'
        ? 'PŮDORYS 2.NP (PATRO)'
        : 'PŮDORYS 1.NP (PŘÍZEMÍ)';

  const wM = (designConfig.footprint?.width ?? 8).toFixed(1).replace('.', ',');
  const lM = (designConfig.footprint?.length ?? 12).toFixed(1).replace('.', ',');

  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(`<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" stroke-width="1.8" />`);
  parts.push(`<line x1="0" y1="54" x2="${width}" y2="54" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<line x1="0" y1="104" x2="${width}" y2="104" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<line x1="${width * 0.52}" y1="104" x2="${width * 0.52}" y2="${h}" stroke="#334155" stroke-width="1.1" />`);
  parts.push(`<line x1="${width * 0.78}" y1="104" x2="${width * 0.78}" y2="${h}" stroke="#334155" stroke-width="1.1" />`);

  parts.push(`<text class="cad-title-label" x="14" y="16">PROJEKT / OBJEKT</text>`);
  parts.push(`<text class="cad-title-main" x="14" y="40">RODINNÝ DŮM 6+KK · DREAM HOUSE</text>`);

  parts.push(`<text class="cad-title-label" x="14" y="71">OBSAH VÝKRESU</text>`);
  parts.push(`<text class="cad-title-sub" x="14" y="92">${esc(docTitle)} · PŮDORYS ${wM} × ${lM} m</text>`);

  parts.push(`<text class="cad-title-label" x="14" y="121">ZDROJ MODELU</text>`);
  parts.push(`<text class="cad-title-val" x="14" y="140">${esc(designConfig.label || designConfig.id)}</text>`);

  parts.push(`<text class="cad-title-label" x="${width * 0.52 + 12}" y="121">MĚŘÍTKO</text>`);
  parts.push(`<text class="cad-title-val" x="${width * 0.52 + 12}" y="140">1 : 50</text>`);

  parts.push(`<text class="cad-title-label" x="${width * 0.78 + 12}" y="121">JEDNOTKY</text>`);
  parts.push(`<text class="cad-title-val" x="${width * 0.78 + 12}" y="140">${esc(units)}</text>`);

  parts.push('</g>');
  return parts.join('\n');
}

/**
 * Generates a self-contained technical 2D architectural floor plan SVG string
 * for `1np`, `2np`, or `both` sheets from the declarative design configuration.
 *
 * @param {Object} designConfig
 * @param {Object} [options]
 * @returns {string}
 */
export function generateFloorPlanSvg(designConfig, options = {}) {
  const {
    sheet = '1np',
    showDimensions = true,
    showInteriorDims = true,
    showFurniture = true,
    showOpeningTags = true,
    showHatches = true,
    units = 'mm',
  } = options;

  const opts = {
    sheet,
    showDimensions,
    showInteriorDims,
    showFurniture,
    showOpeningTags,
    showHatches,
    units,
  };

  const isBoth = sheet === 'both';
  const sheetW = isBoth ? 3360 : 2180;
  const sheetH = 1760;
  const sidebarX = isBoth ? 2770 : 1610;
  const sidebarW = sheetW - sidebarX - 36;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="100%" height="100%" role="img" aria-label="Technický půdorys rodinného domu">`
  );
  parts.push(buildDefsAndStyles());

  // Paper sheet & border frame
  parts.push(`<rect class="cad-sheet-bg" x="0" y="0" width="${sheetW}" height="${sheetH}" />`);
  parts.push(`<rect class="cad-border-outer" x="20" y="20" width="${sheetW - 40}" height="${sheetH - 40}" />`);
  parts.push(`<rect class="cad-border-inner" x="26" y="26" width="${sheetW - 52}" height="${sheetH - 52}" />`);

  // Floor plan drawings
  if (isBoth) {
    parts.push(renderFloorPlanGroup(designConfig, '1np', 1050, 910, opts));
    parts.push(`<line x1="1620" y1="55" x2="1620" y2="${sheetH - 55}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="8 6" />`);
    parts.push(renderFloorPlanGroup(designConfig, '2np', 2190, 910, opts));
  } else if (sheet === '2np') {
    parts.push(renderFloorPlanGroup(designConfig, '2np', 800, 910, opts));
  } else {
    parts.push(renderFloorPlanGroup(designConfig, '1np', 1045, 910, opts));
  }

  // Right Info Column: Compass + Scale -> Room Schedule(s) -> Legend -> Title Block
  let curY = 42;
  const compass = renderCompassAndScale(sidebarX, curY, sidebarW);
  parts.push(compass.svg);
  curY += compass.height + 14;

  if (isBoth) {
    const t1 = renderRoomScheduleTable(sidebarX, curY, sidebarW, 'MÍSTNOSTI 1.NP (PŘÍZEMÍ)', designConfig.floor1?.rooms);
    parts.push(t1.svg);
    curY += t1.height + 12;

    const t2 = renderRoomScheduleTable(sidebarX, curY, sidebarW, 'MÍSTNOSTI 2.NP (PATRO)', designConfig.floor2?.rooms);
    parts.push(t2.svg);
    curY += t2.height + 12;

    const totalInterior = (t1.interiorTotalSqm + t2.interiorTotalSqm).toFixed(1).replace('.', ',');
    parts.push(
      `<rect x="${sidebarX}" y="${curY}" width="${sidebarW}" height="32" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2" />`
    );
    parts.push(
      `<text class="cad-table-txt" style="font-weight:700;" x="${sidebarX + 12}" y="${curY + 20}">CELKOVÁ UŽITNÁ PLOCHA DOMU (1.NP + 2.NP)</text>`
    );
    parts.push(
      `<text class="cad-table-num" style="font-weight:800;fill:#1d4ed8;" x="${sidebarX + sidebarW - 12}" y="${curY + 20}">${totalInterior}\u00A0m²</text>`
    );
    curY += 44;
  } else if (sheet === '2np') {
    const t2 = renderRoomScheduleTable(sidebarX, curY, sidebarW, 'TABULKA MÍSTNOSTÍ — 2.NP', designConfig.floor2?.rooms);
    parts.push(t2.svg);
    curY += t2.height + 14;
  } else {
    const t1 = renderRoomScheduleTable(sidebarX, curY, sidebarW, 'TABULKA MÍSTNOSTÍ — 1.NP', designConfig.floor1?.rooms);
    parts.push(t1.svg);
    curY += t1.height + 14;
  }

  const legend = renderLegend(sidebarX, curY, sidebarW, units, opts.showHatches !== false);
  parts.push(legend.svg);

  // Title block anchored at bottom right
  const titleBlockY = sheetH - 42 - 152;
  parts.push(renderTitleBlock(sidebarX, titleBlockY, sidebarW, designConfig, sheet, units));

  parts.push('</svg>');
  return parts.join('\n');
}
