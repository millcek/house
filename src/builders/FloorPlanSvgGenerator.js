import {
  computeRoomSchedule,
  getWallBox,
  computeFloorBounds,
} from "./RoomBuilder.js";
import { analyzeDesignLayout } from "../analysis/LayoutAnalyzer.js";
import { buildOpeningSchedule } from "../exports/ProjectSchedules.js";
import { generateElevationsSvg } from "./ElevationSvgGenerator.js";
import {
  computeSectionPlanes,
  generateSectionsSvg,
} from "./SectionSvgGenerator.js";

const SCALE = 100; // 1 m = 100 SVG units

const DIR_VECTORS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function m2svg(val) {
  return Number((val * SCALE).toFixed(2));
}

function formatLength(meters, units = "mm") {
  if (units === "m") {
    return meters.toFixed(2).replace(".", ",");
  }
  const mm = Math.round(meters * 1000);
  return mm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function formatTagDim(meters, units = "mm") {
  if (units === "m") {
    return meters.toFixed(2).replace(".", ",");
  }
  return String(Math.round(meters * 1000));
}

function formatArea(sqm) {
  return `${Number(sqm).toFixed(1).replace(".", ",")}\u00A0m²`;
}

function formatElevation(meters) {
  if (Math.abs(meters) < 0.0005) return "±0,000";
  const sign = meters >= 0 ? "+" : "-";
  return `${sign}${Math.abs(meters).toFixed(3).replace(".", ",")}`;
}

function normalizeVec(x, z) {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function resolveOpeningCenter(op) {
  if (typeof op.at === "number") return op.at;
  if (typeof op.offset === "number") return op.offset;
  return 0;
}

function polygonPoints(pts) {
  return pts.map(([x, z]) => `${m2svg(x)},${m2svg(z)}`).join(" ");
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
      .cad-dim-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: #0f172a; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linejoin: round; }
      .cad-tag-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 600; fill: #1e293b; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round; }
      .cad-micro-text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9px; font-weight: 600; fill: #475569; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 2px; stroke-linejoin: round; }
      .cad-room-halo { fill: #ffffff; stroke: #cbd5e1; stroke-width: 1; rx: 4; }
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
      .cad-audit-error-fill { fill: rgba(239, 68, 68, 0.26); stroke: #dc2626; stroke-width: 2; }
      .cad-audit-warn-fill { fill: rgba(245, 158, 11, 0.20); stroke: #d97706; stroke-width: 1.5; stroke-dasharray: 5 3; }
      .cad-audit-zone { fill: rgba(245, 158, 11, 0.10); stroke: #d97706; stroke-width: 1; stroke-dasharray: 4 3; }
      .cad-audit-measure-err { stroke: #dc2626; stroke-width: 1.8; fill: none; }
      .cad-audit-measure-warn { stroke: #d97706; stroke-width: 1.5; fill: none; }
      .cad-audit-leader { stroke: #475569; stroke-width: 1; stroke-dasharray: 2 2; fill: none; }
      .cad-audit-label-err { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 10px; font-weight: 700; fill: #b91c1c; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linejoin: round; }
      .cad-audit-label-warn { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 10px; font-weight: 700; fill: #b45309; text-anchor: middle; paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linejoin: round; }
      .cad-audit-badge-err { fill: #dc2626; stroke: #ffffff; stroke-width: 1.6; }
      .cad-audit-badge-warn { fill: #d97706; stroke: #ffffff; stroke-width: 1.6; }
      .cad-audit-badge-txt { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 9.5px; font-weight: 700; fill: #ffffff; text-anchor: middle; }
      .cad-sec-label { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 800; fill: #0f172a; text-anchor: middle; }
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

function renderFinishesAndOverhangs(
  floorConfig,
  designConfig,
  floorKey,
  showHatches,
) {
  const parts = [];
  parts.push('<g class="layer-finishes">');

  for (const fin of floorConfig.finishes || []) {
    const [w, d] = fin.size;
    const [cx, cz] = fin.pos;
    const x1 = cx - w / 2;
    const z1 = cz - d / 2;

    let fill = "#faf8f5";
    let stroke = "#e5e0d5";
    if (fin.material === "tileFloor") {
      fill = showHatches ? "url(#hatch-tiles)" : "#f8fafc";
      stroke = "#cbd5e1";
    } else if (fin.material === "terrace") {
      fill = showHatches ? "url(#hatch-terrace)" : "#fffbeb";
      stroke = "#d97706";
    }

    parts.push(
      `<rect x="${m2svg(x1)}" y="${m2svg(z1)}" width="${m2svg(w)}" height="${m2svg(d)}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`,
    );
  }

  // Pergola & main entrance canopy on 1.NP
  if (floorKey === "1np") {
    const pergola = (floorConfig.furniture || []).find(
      (f) => f.type === "pergola",
    );
    if (pergola?.posts?.length) {
      const halfPost = (pergola.postSize ?? 0.14) / 2;
      const xs = pergola.posts.map(([px]) => px);
      const zs = pergola.posts.map(([, pz]) => pz);
      const minX = Math.min(...xs) - halfPost;
      const maxX = Math.max(...xs) + halfPost;
      const minZ = Math.min(...zs) - halfPost;
      const maxZ = Math.max(...zs) + halfPost;

      parts.push(
        `<rect class="cad-pergola-outline" x="${m2svg(minX)}" y="${m2svg(minZ)}" width="${m2svg(maxX - minX)}" height="${m2svg(maxZ - minZ)}" />`,
      );

      const rafterCount = pergola.rafterCount ?? 7;
      for (let i = 0; i < rafterCount; i++) {
        const rz = minZ + ((maxZ - minZ) * (i + 1)) / (rafterCount + 1);
        parts.push(
          `<line class="cad-pergola-rafter" x1="${m2svg(minX)}" y1="${m2svg(rz)}" x2="${m2svg(maxX)}" y2="${m2svg(rz)}" />`,
        );
      }

      const postSize = pergola.postSize ?? 0.14;
      for (const [px, pz] of pergola.posts) {
        parts.push(
          `<rect class="cad-pergola-post" x="${m2svg(px - halfPost)}" y="${m2svg(pz - halfPost)}" width="${m2svg(postSize)}" height="${m2svg(postSize)}" />`,
        );
      }
    }

    const canopy = (floorConfig.furniture || []).find(
      (f) => f.type === "canopy",
    );
    if (canopy) {
      const [cw, , cd] = canopy.size;
      const [cx, cz] = canopy.pos;
      const labelX = m2svg(cx + 0.28);
      const labelZ = m2svg(cz);
      parts.push(
        `<rect class="cad-canopy-outline" x="${m2svg(cx - cw / 2)}" y="${m2svg(cz - cd / 2)}" width="${m2svg(cw)}" height="${m2svg(cd)}" />`,
      );
      parts.push(
        `<text class="cad-micro-text" x="${labelX}" y="${labelZ}" transform="rotate(-90 ${labelX} ${labelZ})">PŘÍSTŘEŠEK</text>`,
      );
    }
  }

  // Roof overhang dashed projection
  const roof = designConfig.roof;
  if (roof) {
    const ridgeZ = (roof.ridgeAxis || "z") === "z";
    const overX = ridgeZ
      ? (roof.eaveOverhang ?? 0.45)
      : (roof.gableOverhang ?? 0.35);
    const overZ = ridgeZ
      ? (roof.gableOverhang ?? 0.35)
      : (roof.eaveOverhang ?? 0.45);
    const rx = roof.width / 2 + overX;
    const rz = roof.length / 2 + overZ;
    parts.push(
      `<rect class="cad-overhang" x="${m2svg(-rx)}" y="${m2svg(-rz)}" width="${m2svg(rx * 2)}" height="${m2svg(rz * 2)}" />`,
    );
    if (floorKey === "2np") {
      if (ridgeZ) {
        parts.push(
          `<line class="cad-ridge" x1="0" y1="${m2svg(-rz)}" x2="0" y2="${m2svg(rz)}" />`,
        );
      } else {
        parts.push(
          `<line class="cad-ridge" x1="${m2svg(-rx)}" y1="0" x2="${m2svg(rx)}" y2="0" />`,
        );
      }
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderStairsAndChimney(designConfig, floorKey) {
  const parts = [];
  parts.push('<g class="layer-stairs">');

  const stairs = (designConfig.floor1?.furniture || []).find(
    (f) => f.type === "stairs",
  );
  if (stairs && stairs.layout === "u-turn") {
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
    const zMinAll = Math.min(
      zFlight1[0],
      zFlight1[1],
      zFlight2[0],
      zFlight2[1],
    );
    const zMaxAll = Math.max(
      zFlight1[0],
      zFlight1[1],
      zFlight2[0],
      zFlight2[1],
    );
    const landingCenterX = (xEnd + xLanding) / 2;

    // Stairwell opening border on 2.NP
    if (floorKey === "2np") {
      parts.push(
        `<rect x="${m2svg(Math.min(xEnd, xStart))}" y="${m2svg(zMinAll)}" width="${m2svg(Math.abs(xStart - xEnd))}" height="${m2svg(zMaxAll - zMinAll)}" fill="#ffffff" stroke="#0f172a" stroke-width="1.6" />`,
      );
    }

    // Mid-landing
    parts.push(
      `<rect class="cad-stair-tread" x="${m2svg(landingMinX)}" y="${m2svg(zMinAll)}" width="${m2svg(landingW)}" height="${m2svg(zMaxAll - zMinAll)}" />`,
    );

    // Flight 1 treads
    for (let s = 0; s < stepsPerFlight; s++) {
      const sx1 = xStart + dir * s * stepRun;
      const sx2 = xStart + dir * (s + 1) * stepRun;
      const rx = Math.min(sx1, sx2);
      parts.push(
        `<rect class="cad-stair-tread" x="${m2svg(rx)}" y="${m2svg(z1Min)}" width="${m2svg(stepRun)}" height="${m2svg(w1)}" />`,
      );
    }

    // Flight 2 treads (cut after step 2 with diagonal break line on 1.NP)
    const cutAfterStep = 2;
    for (let s = 0; s < stepsPerFlight; s++) {
      const sx1 = xLanding - dir * s * stepRun;
      const sx2 = xLanding - dir * (s + 1) * stepRun;
      const rx = Math.min(sx1, sx2);
      const cls =
        floorKey === "1np" && s > cutAfterStep
          ? "cad-stair-tread-hidden"
          : "cad-stair-tread";
      parts.push(
        `<rect class="${cls}" x="${m2svg(rx)}" y="${m2svg(z2Min)}" width="${m2svg(stepRun)}" height="${m2svg(w2)}" />`,
      );
    }

    // Central balustrade gap divider
    const gapMinZ = Math.min(zFlight1[1], zFlight2[0]);
    const gapH = Math.abs(zFlight2[0] - zFlight1[1]);
    parts.push(
      `<rect x="${m2svg(Math.min(xLanding, xStart))}" y="${m2svg(gapMinZ)}" width="${m2svg(Math.abs(xStart - xLanding))}" height="${m2svg(gapH)}" fill="#cbd5e1" stroke="#334155" stroke-width="0.9" />`,
    );

    // Walking line (výstupnice)
    const startX = xStart + dir * 0.14;
    const endWalkX = xStart - dir * 0.08;
    const walkPts = `${m2svg(startX)},${m2svg(z1Center)} ${m2svg(landingCenterX)},${m2svg(z1Center)} ${m2svg(landingCenterX)},${m2svg(z2Center)} ${m2svg(endWalkX)},${m2svg(z2Center)}`;
    parts.push(`<polyline class="cad-stair-walk" points="${walkPts}" />`);
    parts.push(
      `<circle cx="${m2svg(startX)}" cy="${m2svg(z1Center)}" r="4" fill="#ffffff" stroke="#0f172a" stroke-width="1.3" />`,
    );

    // Arrowhead at end of walking line (pointing East/+X when dir === -1)
    const arrowDir = -dir;
    const tipX = m2svg(endWalkX);
    const tipY = m2svg(z2Center);
    parts.push(
      `<polyline class="cad-stair-walk" points="${tipX - arrowDir * 8},${tipY - 5} ${tipX},${tipY} ${tipX - arrowDir * 8},${tipY + 5}" />`,
    );

    if (floorKey === "1np") {
      // Diagonal architectural break line across Flight 2
      const breakX = xLanding - dir * (cutAfterStep + 0.5) * stepRun;
      parts.push(
        `<line class="cad-stair-break" x1="${m2svg(breakX - 0.14)}" y1="${m2svg(z2Min - 0.06)}" x2="${m2svg(breakX + 0.14)}" y2="${m2svg(z2Min + w2 + 0.06)}" />`,
      );
      parts.push(
        `<line class="cad-stair-break" x1="${m2svg(breakX - 0.06)}" y1="${m2svg(z2Min - 0.06)}" x2="${m2svg(breakX + 0.22)}" y2="${m2svg(z2Min + w2 + 0.06)}" />`,
      );
      const riserMm = Math.round(riserHeight * 1000);
      const runMm = Math.round(stepRun * 1000);
      parts.push(
        `<text class="cad-micro-text" x="${m2svg((xStart + xLanding) / 2)}" y="${m2svg(z1Center - 0.14)}">${totalRisers}× ${riserMm}/${runMm} (NAHORU)</text>`,
      );
      const landingElev = ((stepsPerFlight + 1) * riserHeight)
        .toFixed(2)
        .replace(".", ",");
      parts.push(
        `<text class="cad-micro-text" x="${m2svg(landingCenterX)}" y="${m2svg(zMinAll + 0.22)}">+${landingElev}</text>`,
      );
    } else {
      // Gallery railing on 2.NP
      const railing = (designConfig.floor2?.furniture || []).find(
        (f) => f.type === "railing",
      );
      if (railing) {
        const [rw, , rd] = railing.size;
        const [rx, rz] = railing.pos;
        parts.push(
          `<rect x="${m2svg(rx - rw / 2)}" y="${m2svg(rz - rd / 2)}" width="${m2svg(rw)}" height="${m2svg(rd)}" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.3" />`,
        );
      }
      const floor2Struct = designConfig.floor2?.elevation ?? 3.02;
      const floor2FinishThick =
        (designConfig.floor2?.finishes || []).find(
          (f) => f.material !== "terrace",
        )?.thickness ?? 0.08;
      parts.push(
        `<text class="cad-micro-text" x="${m2svg((xStart + xLanding) / 2)}" y="${m2svg(z2Center - 0.14)}">VÝSTUP ${esc(formatElevation(floor2Struct + floor2FinishThick))}</text>`,
      );
    }
  }

  // Chimney pass-through symbol
  const fireplace = (designConfig.floor1?.furniture || []).find(
    (f) => f.type === "fireplace",
  );
  if (fireplace) {
    const [fx] = fireplace.pos;
    const chimneySize = 0.38;
    const chimneyZ = 0.55;
    parts.push(
      `<rect class="cad-chimney" x="${m2svg(fx - chimneySize / 2)}" y="${m2svg(chimneyZ - chimneySize / 2)}" width="${m2svg(chimneySize)}" height="${m2svg(chimneySize)}" />`,
    );
    parts.push(
      `<circle class="cad-chimney-flue" cx="${m2svg(fx)}" cy="${m2svg(chimneyZ)}" r="${m2svg(0.1)}" />`,
    );
    if (floorKey === "2np") {
      parts.push(
        `<text class="cad-micro-text" x="${m2svg(fx)}" y="${m2svg(chimneyZ + 0.32)}">KOMÍN Ø200</text>`,
      );
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderSingleFurnitureItem(item, floorKey) {
  if (
    item.type === "stairs" ||
    item.type === "pergola" ||
    item.type === "canopy" ||
    item.type === "railing"
  ) {
    return "";
  }

  const [cx, cz] = item.pos || [0, 0];
  const [w = 1, , d = 1] = item.size || [];
  const x = cx - w / 2;
  const z = cz - d / 2;
  const out = [];

  switch (item.type) {
    case "wc": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="4" />`,
      );
      if (w > d) {
        // Horizontal WC (2.05 against east wall)
        const cisternEast = cx > 2.5;
        const tankW = w * 0.28;
        const tankX = cisternEast ? x + w - tankW : x;
        const bowlCx = cisternEast
          ? x + (w - tankW) * 0.48
          : x + tankW + (w - tankW) * 0.52;
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(tankX)}" y="${m2svg(z + 0.02)}" width="${m2svg(tankW)}" height="${m2svg(d - 0.04)}" rx="2" />`,
        );
        out.push(
          `<ellipse class="cad-furn" cx="${m2svg(bowlCx)}" cy="${m2svg(cz)}" rx="${m2svg((w - tankW) * 0.42)}" ry="${m2svg(d * 0.36)}" />`,
        );
      } else {
        // Vertical WC (1.03 against north wall)
        const cisternNorth = cz < 0;
        const tankD = d * 0.28;
        const tankZ = cisternNorth ? z : z + d - tankD;
        const bowlCz = cisternNorth
          ? z + tankD + (d - tankD) * 0.52
          : z + (d - tankD) * 0.48;
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(x + 0.02)}" y="${m2svg(tankZ)}" width="${m2svg(w - 0.04)}" height="${m2svg(tankD)}" rx="2" />`,
        );
        out.push(
          `<ellipse class="cad-furn" cx="${m2svg(cx)}" cy="${m2svg(bowlCz)}" rx="${m2svg(w * 0.36)}" ry="${m2svg((d - tankD) * 0.42)}" />`,
        );
      }
      break;
    }

    case "vanity": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      const longLen = Math.max(w, d);
      const basins = longLen >= 1.15 ? 2 : 1;
      if (w >= d) {
        const bw = (w - 0.16) / basins - (basins > 1 ? 0.06 : 0);
        const bd = Math.max(0.18, d - 0.14);
        for (let i = 0; i < basins; i++) {
          const bx = basins === 1 ? cx - bw / 2 : x + 0.08 + i * (bw + 0.12);
          const bz = cz - bd / 2;
          out.push(
            `<rect class="cad-furn-subtle" x="${m2svg(bx)}" y="${m2svg(bz)}" width="${m2svg(bw)}" height="${m2svg(bd)}" rx="5" />`,
          );
          out.push(
            `<circle class="cad-furn-line" cx="${m2svg(bx + bw / 2)}" cy="${m2svg(cz)}" r="2.2" />`,
          );
        }
      } else {
        const bw = Math.max(0.18, w - 0.14);
        const bd = Math.min(0.55, d - 0.18);
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(cx - bw / 2)}" y="${m2svg(cz - bd / 2)}" width="${m2svg(bw)}" height="${m2svg(bd)}" rx="5" />`,
        );
        out.push(
          `<circle class="cad-furn-line" cx="${m2svg(cx)}" cy="${m2svg(cz)}" r="2.2" />`,
        );
      }
      break;
    }

    case "bathtub": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="4" />`,
      );
      out.push(
        `<rect class="cad-furn-subtle" x="${m2svg(x + 0.09)}" y="${m2svg(z + 0.09)}" width="${m2svg(w - 0.18)}" height="${m2svg(d - 0.18)}" rx="18" />`,
      );
      out.push(
        `<circle class="cad-furn-line" cx="${m2svg(x + 0.24)}" cy="${m2svg(cz)}" r="3" />`,
      );
      break;
    }

    case "shower": {
      const isDogShower = /ps[ií]|pes/i.test(item.name || "");
      if (isDogShower) {
        out.push(
          `<rect class="cad-furn" stroke-dasharray="4,3" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`,
        );
        out.push(
          `<line class="cad-furn-line" stroke-dasharray="2,2" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`,
        );
        out.push(
          `<line class="cad-furn-line" stroke-dasharray="2,2" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`,
        );
        out.push(
          `<rect fill="#64748b" x="${m2svg(cx - 0.22)}" y="${m2svg(z + d - 0.05)}" width="${m2svg(0.44)}" height="${m2svg(0.04)}" rx="1" />`,
        );
        out.push(
          `<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz + 0.12)}">PSÍ MYCÍ ZÓNA</text>`,
        );
      } else {
        out.push(
          `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`,
        );
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`,
        );
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`,
        );
        out.push(
          `<circle class="cad-furn" cx="${m2svg(cx)}" cy="${m2svg(cz)}" r="3.5" />`,
        );
      }
      break;
    }

    case "bed": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      const horizontalSingle = w > d + 0.3;
      if (horizontalSingle) {
        // Headboard on East when cx > 0, else West
        const headEast = cx > 0;
        const headX = headEast ? x + w - 0.08 : x;
        const pilX = headEast ? x + w - 0.44 : x + 0.12;
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(headX)}" y="${m2svg(z)}" width="${m2svg(0.08)}" height="${m2svg(d)}" />`,
        );
        out.push(
          `<rect class="cad-furn" x="${m2svg(pilX)}" y="${m2svg(z + 0.12)}" width="${m2svg(0.32)}" height="${m2svg(d - 0.24)}" rx="4" />`,
        );
        const foldX = headEast ? x + w * 0.68 : x + w * 0.32;
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(foldX)}" y1="${m2svg(z)}" x2="${m2svg(foldX)}" y2="${m2svg(z + d)}" />`,
        );
      } else {
        // Headboard on North (-Z) when against north wall, or South (+Z) when against south wall
        const headSouth = cz > 0 ? cz >= 3.8 : cz >= -3.8;
        const headZ = headSouth ? z + d - 0.08 : z;
        const pilZ = headSouth ? z + d - 0.48 : z + 0.12;
        const foldZ = headSouth ? z + d - 0.65 : z + 0.65;
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(headZ)}" width="${m2svg(w)}" height="${m2svg(0.08)}" />`,
        );
        const pillows = Math.min(w, d) >= 1.4 ? 2 : 1;
        const pw = (w - 0.24 - (pillows - 1) * 0.12) / pillows;
        for (let i = 0; i < pillows; i++) {
          const px = x + 0.12 + i * (pw + 0.12);
          out.push(
            `<rect class="cad-furn" x="${m2svg(px)}" y="${m2svg(pilZ)}" width="${m2svg(pw)}" height="${m2svg(0.36)}" rx="4" />`,
          );
        }
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(foldZ)}" x2="${m2svg(x + w)}" y2="${m2svg(foldZ)}" />`,
        );
      }
      break;
    }

    case "wardrobe": {
      // Storage under stairs in 1.05 drawn subtly dashed so stairs remain primary
      const isUnderStairs =
        floorKey === "1np" && cx < -0.5 && cz > -1.0 && cz < 0.2;
      if (isUnderStairs) {
        out.push(
          `<rect class="cad-furn-dashed" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`,
        );
      } else {
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`,
        );
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`,
        );
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`,
        );
      }
      break;
    }

    case "desk": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      const chairR = 0.22;
      let chX = cx;
      let chZ = cz;
      if (w >= d) {
        const againstSouthWall = cz > 0 ? cz >= 3.8 : cz >= -3.8;
        chZ = againstSouthWall ? z - 0.18 : z + d + 0.18;
      } else {
        chX = cx < 0 ? x + w + 0.18 : x - 0.18;
      }
      out.push(
        `<circle class="cad-furn-subtle" cx="${m2svg(chX)}" cy="${m2svg(chZ)}" r="${m2svg(chairR)}" />`,
      );
      break;
    }

    case "kitchenCounter": {
      out.push(
        `<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`,
      );
      // East counter under strip window gets sink + drainer
      if (cx > 2.8 && d > 1.2) {
        out.push(
          `<rect class="cad-furn" x="${m2svg(x + 0.08)}" y="${m2svg(cz - 0.42)}" width="${m2svg(w - 0.16)}" height="${m2svg(0.84)}" rx="3" />`,
        );
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(x + 0.11)}" y="${m2svg(cz - 0.36)}" width="${m2svg(w - 0.22)}" height="${m2svg(0.42)}" rx="3" />`,
        );
        out.push(
          `<circle class="cad-furn-line" cx="${m2svg(cx)}" cy="${m2svg(cz - 0.15)}" r="2.2" />`,
        );
      }
      break;
    }

    case "kitchenTall": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      const numModules = Math.max(1, Math.round(w / 0.55));
      const modW = w / numModules;
      for (let i = 1; i < numModules; i++) {
        const mx = x + i * modW;
        out.push(
          `<line class="cad-furn-line" x1="${m2svg(mx)}" y1="${m2svg(z)}" x2="${m2svg(mx)}" y2="${m2svg(z + d)}" />`,
        );
      }
      out.push(
        `<line class="cad-furn-dashed" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`,
      );
      out.push(
        `<line class="cad-furn-dashed" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`,
      );
      break;
    }

    case "kitchenIsland": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      // 4-zone induction cooktop
      const hobW = 0.56;
      const hobD = 0.72;
      const hx = cx - hobW / 2;
      const hz = cz - hobD / 2;
      out.push(
        `<rect class="cad-furn-subtle" x="${m2svg(hx)}" y="${m2svg(hz)}" width="${m2svg(hobW)}" height="${m2svg(hobD)}" rx="3" />`,
      );
      for (const ox of [-0.14, 0.14]) {
        for (const oz of [-0.18, 0.18]) {
          out.push(
            `<circle class="cad-furn-line" cx="${m2svg(cx + ox)}" cy="${m2svg(cz + oz)}" r="${m2svg(0.09)}" />`,
          );
        }
      }
      break;
    }

    case "diningTable": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="3" />`,
      );
      const cols = 3;
      const cw = 0.4;
      const cd = 0.22;
      for (let i = 0; i < cols; i++) {
        const chx = x + ((i + 0.5) * w) / cols - cw / 2;
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(chx)}" y="${m2svg(z - cd - 0.05)}" width="${m2svg(cw)}" height="${m2svg(cd)}" rx="3" />`,
        );
        out.push(
          `<rect class="cad-furn-subtle" x="${m2svg(chx)}" y="${m2svg(z + d + 0.05)}" width="${m2svg(cw)}" height="${m2svg(cd)}" rx="3" />`,
        );
      }
      break;
    }

    case "lSofa": {
      for (const part of item.parts || []) {
        const [pw, , pd] = part.size;
        const [ox, oz] = part.offset;
        const px = cx + ox - pw / 2;
        const pz = cz + oz - pd / 2;
        out.push(
          `<rect class="cad-furn" x="${m2svg(px)}" y="${m2svg(pz)}" width="${m2svg(pw)}" height="${m2svg(pd)}" rx="4" />`,
        );
      }
      break;
    }

    case "coffeeTable": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="4" />`,
      );
      break;
    }

    case "tvStand": {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      out.push(
        `<rect fill="#334155" x="${m2svg(cx - w * 0.4)}" y="${m2svg(cz + d * 0.15)}" width="${m2svg(w * 0.8)}" height="4" />`,
      );
      break;
    }

    case "fireplace": {
      out.push(
        `<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      out.push(
        `<rect class="cad-furn" x="${m2svg(x + 0.08)}" y="${m2svg(z + 0.08)}" width="${m2svg(w - 0.16)}" height="${m2svg(d - 0.16)}" />`,
      );
      break;
    }

    case "shaft": {
      out.push(
        `<rect class="cad-wall-part-stroke" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" fill="#f1f5f9" />`,
      );
      out.push(
        `<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`,
      );
      out.push(
        `<line class="cad-furn-line" x1="${m2svg(x + w)}" y1="${m2svg(z)}" x2="${m2svg(x)}" y2="${m2svg(z + d)}" />`,
      );
      out.push(
        `<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz - 0.02)}">ŠACHTA</text>`,
      );
      out.push(
        `<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz + 0.09)}">VZT</text>`,
      );
      break;
    }

    case "recup": {
      out.push(
        `<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      out.push(
        `<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(cz)}" x2="${m2svg(x + w)}" y2="${m2svg(cz)}" />`,
      );
      out.push(
        `<line class="cad-furn-line" x1="${m2svg(cx)}" y1="${m2svg(z)}" x2="${m2svg(cx)}" y2="${m2svg(z + d)}" />`,
      );
      out.push(
        `<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz + 0.04)}">VZT / REKUP</text>`,
      );
      break;
    }

    case "hvac":
    case "laundryStack": {
      out.push(
        `<rect class="cad-furn-subtle" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" rx="2" />`,
      );
      out.push(
        `<line class="cad-furn-line" x1="${m2svg(x)}" y1="${m2svg(z)}" x2="${m2svg(x + w)}" y2="${m2svg(z + d)}" />`,
      );
      const label = item.type === "hvac" ? "TČ" : "P+S";
      out.push(
        `<text class="cad-micro-text" x="${m2svg(cx)}" y="${m2svg(cz + 0.04)}">${label}</text>`,
      );
      break;
    }

    default: {
      out.push(
        `<rect class="cad-furn" x="${m2svg(x)}" y="${m2svg(z)}" width="${m2svg(w)}" height="${m2svg(d)}" />`,
      );
    }
  }

  return out.join("\n");
}

function renderFurniture(floorConfig, floorKey, showAll = true) {
  const parts = ['<g class="layer-furniture">'];
  const items = floorConfig.furniture || [];
  const ordered = [
    ...items.filter((item) => item.type !== "shaft"),
    ...items.filter((item) => item.type === "shaft"),
  ];
  for (const item of ordered) {
    if (!showAll && item.type !== "shaft") continue;
    const svg = renderSingleFurnitureItem(item, floorKey);
    if (svg) parts.push(svg);
  }
  parts.push("</g>");
  return parts.join("\n");
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
    .map((op, origIndex) => {
      const center = resolveOpeningCenter(op);
      const start = Math.max(0, center - op.width / 2);
      const end = Math.min(length, center + op.width / 2);
      return { ...op, origIndex, center, start, end };
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
  const { hinge = "start", dir = "south" } = op.swing || {};
  const dirVec = DIR_VECTORS[dir] || [0, 1];

  const hingeU = hinge === "start" ? op.start : op.end;
  const latchU = hinge === "start" ? op.end : op.start;

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
  parts.push(
    `<line class="cad-door-threshold" x1="${m2svg(p1A[0])}" y1="${m2svg(p1A[1])}" x2="${m2svg(p1B[0])}" y2="${m2svg(p1B[1])}" />`,
  );
  parts.push(
    `<line class="cad-door-threshold" x1="${m2svg(p2A[0])}" y1="${m2svg(p2A[1])}" x2="${m2svg(p2B[0])}" y2="${m2svg(p2B[1])}" />`,
  );

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
  parts.push(
    `<polygon class="cad-door-leaf" points="${polygonPoints(leafPts)}" />`,
  );

  // 90-degree swing arc
  const vOx = ox - hx;
  const vOz = oz - hz;
  const vCx = cx - hx;
  const vCz = cz - hz;
  const cross = vOx * vCz - vOz * vCx;
  const sweepFlag = cross > 0 ? 1 : 0;
  const rSvg = m2svg(actualW);
  parts.push(
    `<path class="cad-door-arc" d="M ${m2svg(ox)} ${m2svg(oz)} A ${rSvg} ${rSvg} 0 0 ${sweepFlag} ${m2svg(cx)} ${m2svg(cz)}" />`,
  );

  // Subtle dashed wall-face closure line on non-swing side for exterior doors
  if (thickness > 0.25) {
    const oppA = [hcX - dirVec[0] * halfT, hcZ - dirVec[1] * halfT];
    const oppB = [lcX - dirVec[0] * halfT, lcZ - dirVec[1] * halfT];
    parts.push(
      `<line class="cad-door-threshold" x1="${m2svg(oppA[0])}" y1="${m2svg(oppA[1])}" x2="${m2svg(oppB[0])}" y2="${m2svg(oppB[1])}" />`,
    );
  }

  return parts.join("\n");
}

function renderPocketDoorOpening(wallGeom, op) {
  const parts = [];
  const { ptAt, ux, uz, halfT, length } = wallGeom;
  const slideDir = typeof op.sliding === "object" ? op.sliding?.dir : null;
  const dirVec = DIR_VECTORS[slideDir] || [-ux, -uz];
  const slideSign = dirVec[0] * ux + dirVec[1] * uz >= 0 ? 1 : -1;

  // Threshold / casing ticks
  const p1A = ptAt(op.start, -halfT);
  const p1B = ptAt(op.start, halfT);
  const p2A = ptAt(op.end, -halfT);
  const p2B = ptAt(op.end, halfT);
  parts.push(
    `<line class="cad-door-threshold" x1="${m2svg(p1A[0])}" y1="${m2svg(p1A[1])}" x2="${m2svg(p1B[0])}" y2="${m2svg(p1B[1])}" />`,
  );
  parts.push(
    `<line class="cad-door-threshold" x1="${m2svg(p2A[0])}" y1="${m2svg(p2A[1])}" x2="${m2svg(p2B[0])}" y2="${m2svg(p2B[1])}" />`,
  );

  const actualW = Math.max(0.1, op.end - op.start);
  const pocketStart =
    slideSign < 0 ? Math.max(0.04, op.start - actualW) : op.end;
  const pocketEnd =
    slideSign < 0 ? op.start : Math.min(length - 0.04, op.end + actualW);
  if (pocketEnd - pocketStart > 0.05) {
    const pocketPts = [
      ptAt(pocketStart, -0.04),
      ptAt(pocketEnd, -0.04),
      ptAt(pocketEnd, 0.04),
      ptAt(pocketStart, 0.04),
    ];
    parts.push(
      `<polygon fill="#ffffff" stroke="none" points="${polygonPoints(pocketPts)}" />`,
    );
    parts.push(
      `<polygon class="cad-door-arc" points="${polygonPoints(pocketPts)}" />`,
    );
  }

  // Sliding door leaf slightly retracted (15%) into pocket so cavity & rail read clearly
  const shift = slideSign * actualW * 0.15;
  const leafStart = op.start + shift;
  const leafEnd = op.end + shift;
  const leafPts = [
    ptAt(leafStart, -0.0225),
    ptAt(leafEnd, -0.0225),
    ptAt(leafEnd, 0.0225),
    ptAt(leafStart, 0.0225),
  ];
  parts.push(
    `<polygon class="cad-door-leaf" points="${polygonPoints(leafPts)}" />`,
  );

  // Slide direction indicator arrow inside wall thickness beside leaf
  const aBase = op.center - slideSign * 0.22;
  const aTip = op.center + slideSign * 0.22;
  const nArrow = 0.075;
  const pBase = ptAt(aBase, nArrow);
  const pTip = ptAt(aTip, nArrow);
  const pWing1 = ptAt(aTip - slideSign * 0.09, nArrow - 0.045);
  const pWing2 = ptAt(aTip - slideSign * 0.09, nArrow + 0.045);
  parts.push(
    `<line x1="${m2svg(pBase[0])}" y1="${m2svg(pBase[1])}" x2="${m2svg(pTip[0])}" y2="${m2svg(pTip[1])}" stroke="#0f172a" stroke-width="1.1" />`,
  );
  parts.push(
    `<polyline points="${polygonPoints([pWing1, pTip, pWing2])}" fill="none" stroke="#0f172a" stroke-width="1.1" />`,
  );

  return parts.join("\n");
}

function renderWindowOpening(wallGeom, op) {
  const parts = [];
  const { ptAt, halfT } = wallGeom;

  // Sill edge lines along both wall faces
  const f1A = ptAt(op.start, -halfT);
  const f1B = ptAt(op.end, -halfT);
  const f2A = ptAt(op.start, halfT);
  const f2B = ptAt(op.end, halfT);
  parts.push(
    `<line class="cad-window-sill" x1="${m2svg(f1A[0])}" y1="${m2svg(f1A[1])}" x2="${m2svg(f1B[0])}" y2="${m2svg(f1B[1])}" />`,
  );
  parts.push(
    `<line class="cad-window-sill" x1="${m2svg(f2A[0])}" y1="${m2svg(f2A[1])}" x2="${m2svg(f2B[0])}" y2="${m2svg(f2B[1])}" />`,
  );

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
    parts.push(
      `<polygon class="cad-window-frame" points="${polygonPoints(track1)}" />`,
    );
    parts.push(
      `<polygon class="cad-window-frame" points="${polygonPoints(track2)}" />`,
    );
    const g1A = ptAt(op.start + 0.05, -0.03);
    const g1B = ptAt(mid, -0.03);
    const g2A = ptAt(mid, 0.03);
    const g2B = ptAt(op.end - 0.05, 0.03);
    parts.push(
      `<line class="cad-window-glass" x1="${m2svg(g1A[0])}" y1="${m2svg(g1A[1])}" x2="${m2svg(g1B[0])}" y2="${m2svg(g1B[1])}" />`,
    );
    parts.push(
      `<line class="cad-window-glass" x1="${m2svg(g2A[0])}" y1="${m2svg(g2A[1])}" x2="${m2svg(g2B[0])}" y2="${m2svg(g2B[1])}" />`,
    );
  } else {
    // Standard window frame + double glazing line
    const framePts = [
      ptAt(op.start, -0.05),
      ptAt(op.end, -0.05),
      ptAt(op.end, 0.05),
      ptAt(op.start, 0.05),
    ];
    parts.push(
      `<polygon class="cad-window-frame" points="${polygonPoints(framePts)}" />`,
    );
    const g1A = ptAt(op.start + 0.04, -0.015);
    const g1B = ptAt(op.end - 0.04, -0.015);
    const g2A = ptAt(op.start + 0.04, 0.015);
    const g2B = ptAt(op.end - 0.04, 0.015);
    parts.push(
      `<line class="cad-window-glass" x1="${m2svg(g1A[0])}" y1="${m2svg(g1A[1])}" x2="${m2svg(g1B[0])}" y2="${m2svg(g1B[1])}" />`,
    );
    parts.push(
      `<line class="cad-window-glass" x1="${m2svg(g2A[0])}" y1="${m2svg(g2A[1])}" x2="${m2svg(g2B[0])}" y2="${m2svg(g2B[1])}" />`,
    );
  }

  return parts.join("\n");
}

function renderOpeningTag(wallGeom, op, units, bounds, mark = "") {
  const { ptAt, ux, uz, halfT } = wallGeom;
  const isDoor = Boolean(op.swing || op.type === "door");
  const wStr = formatTagDim(op.width, units);
  const hStr = formatTagDim(op.height, units);
  const sillStr =
    op.sill > 0.2 && !op.sliding ? ` (${formatTagDim(op.sill, units)})` : "";
  const dimText = isDoor ? `${wStr}×${hStr}` : `${wStr}×${hStr}${sillStr}`;
  const text = isDoor && mark ? `${mark} ${dimText}` : dimText;

  const [cx, cz] = ptAt(op.center, 0);
  const isHorizontal = Math.abs(ux) >= Math.abs(uz);

  let tx = cx;
  let tz = cz;
  let rot = 0;

  if (isHorizontal) {
    // Exterior North/South walls tag slightly outside; interior horizontal walls tag on non-swing side
    if (cz <= bounds.innerMinZ) {
      tz = cz - halfT - 0.16;
    } else if (cz >= bounds.innerMaxZ) {
      tz = cz + halfT + 0.24;
    } else {
      const dirY = op.swing?.dir === "north" ? 1 : -1;
      tz = cz + dirY * (halfT + 0.18);
    }
  } else {
    rot = -90;
    if (cx <= bounds.innerMinX) {
      tx = cx - halfT - 0.18;
    } else if (cx >= bounds.innerMaxX) {
      tx = cx + halfT + 0.22;
    } else {
      const dirX = op.swing?.dir === "west" ? 1 : -1;
      tx = cx + dirX * (halfT + 0.14);
    }
  }

  const sx = m2svg(tx);
  const sz = m2svg(tz);
  const transformAttr =
    rot !== 0 ? ` transform="rotate(${rot} ${sx} ${sz})"` : "";
  return `<text class="cad-tag-text" x="${sx}" y="${sz}"${transformAttr}>${esc(text)}</text>`;
}

function renderWallsAndOpenings(
  floorConfig,
  options,
  bounds,
  floorKey = "1np",
) {
  const { showHatches = true, showOpeningTags = true } = options;
  const units = options.units || "mm";

  const wallGeoms = (floorConfig.walls || [])
    .map(splitWallSegments)
    .filter(Boolean);
  const structWalls = wallGeoms.filter(
    (g) =>
      g.wallDef.structural === true ||
      (g.wallDef.material || "wall") === "wall",
  );
  const partWalls = wallGeoms.filter(
    (g) =>
      !(
        g.wallDef.structural === true ||
        (g.wallDef.material || "wall") === "wall"
      ),
  );

  const structFill = showHatches ? "url(#hatch-structural)" : "#475569";
  const partFill = showHatches ? "url(#hatch-partition)" : "#94a3b8";

  const parts = [];
  parts.push('<g class="layer-walls">');

  // Pass 1: Partition outlines
  for (const g of partWalls) {
    for (const poly of g.solidPolys) {
      parts.push(
        `<polygon class="cad-wall-part-stroke" points="${polygonPoints(poly)}" />`,
      );
    }
  }

  // Pass 2: Partition opaque fills (hides inner stroke & partition-to-partition seams)
  for (const g of partWalls) {
    for (const poly of g.solidPolys) {
      parts.push(
        `<polygon fill="${partFill}" stroke="none" points="${polygonPoints(poly)}" />`,
      );
    }
  }

  // Pass 3: Structural wall outlines
  for (const g of structWalls) {
    for (const poly of g.solidPolys) {
      parts.push(
        `<polygon class="cad-wall-struct-stroke" points="${polygonPoints(poly)}" />`,
      );
    }
  }

  // Pass 4: Structural wall opaque fills (hides inner stroke & corner seams)
  for (const g of structWalls) {
    for (const poly of g.solidPolys) {
      parts.push(
        `<polygon fill="${structFill}" stroke="none" points="${polygonPoints(poly)}" />`,
      );
    }
  }

  parts.push("</g>");

  // Openings layer
  parts.push('<g class="layer-openings">');
  for (const g of wallGeoms) {
    for (const op of g.openings) {
      if (op.type === "window") {
        parts.push(renderWindowOpening(g, op));
      } else if (op.type === "door" && op.sliding && !op.swing) {
        parts.push(renderPocketDoorOpening(g, op));
      } else if (op.swing || op.type === "door") {
        parts.push(renderDoorOpening(g, op));
      } else {
        // Pure open passage: dashed lintel lines
        const l1A = g.ptAt(op.start, -g.halfT);
        const l1B = g.ptAt(op.end, -g.halfT);
        const l2A = g.ptAt(op.start, g.halfT);
        const l2B = g.ptAt(op.end, g.halfT);
        parts.push(
          `<line class="cad-passage-lintel" x1="${m2svg(l1A[0])}" y1="${m2svg(l1A[1])}" x2="${m2svg(l1B[0])}" y2="${m2svg(l1B[1])}" />`,
        );
        parts.push(
          `<line class="cad-passage-lintel" x1="${m2svg(l2A[0])}" y1="${m2svg(l2A[1])}" x2="${m2svg(l2B[0])}" y2="${m2svg(l2B[1])}" />`,
        );
      }

      if (
        showOpeningTags &&
        (op.type === "window" || op.swing || op.type === "door")
      ) {
        const wallId = g.wallDef.id || g.wallDef.name || "wall";
        const mark =
          options.tagByKey?.get(`${floorKey}|${wallId}|${op.origIndex}`) || "";
        parts.push(renderOpeningTag(g, op, units, bounds, mark));
      }
    }
  }
  parts.push("</g>");

  return parts.join("\n");
}

function renderRoomStamps(floorConfig) {
  const { rooms } = computeRoomSchedule(floorConfig.rooms || [], floorConfig);
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
      const words = nameStr.split(" ");
      const line1 = [];
      const line2 = [];
      for (const word of words) {
        if (
          line1.join(" ").length + word.length + 1 <= maxLineChars ||
          line1.length === 0
        ) {
          line1.push(word);
        } else {
          line2.push(word);
        }
      }
      lines = line2.length
        ? [line1.join(" "), line2.join(" ")]
        : [line1.join(" ")];
    }

    const longest = Math.max(...lines.map((l) => l.length), 10);
    const boxW = Math.max(92, longest * 6.4 + 18);
    const boxH = lines.length > 1 ? 52 : 40;
    const boxX = cx - boxW / 2;
    const boxY = cz - boxH / 2;

    parts.push(
      `<rect class="cad-room-halo" x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH}" />`,
    );
    parts.push(
      `<rect class="cad-room-id-bg" x="${(cx - 17).toFixed(1)}" y="${(boxY + 4).toFixed(1)}" width="34" height="13" />`,
    );
    parts.push(
      `<text class="cad-room-id-txt" x="${cx}" y="${(boxY + 13.5).toFixed(1)}">${esc(room.id)}</text>`,
    );

    if (lines.length === 1) {
      parts.push(
        `<text class="cad-room-name" x="${cx}" y="${(boxY + 26.5).toFixed(1)}">${esc(lines[0])}</text>`,
      );
      parts.push(
        `<text class="cad-room-area" x="${cx}" y="${(boxY + 37.5).toFixed(1)}">${esc(formatArea(room.areaSqm))}</text>`,
      );
    } else {
      parts.push(
        `<text class="cad-room-name" x="${cx}" y="${(boxY + 26).toFixed(1)}">${esc(lines[0])}</text>`,
      );
      parts.push(
        `<text class="cad-room-name" x="${cx}" y="${(boxY + 37.5).toFixed(1)}">${esc(lines[1])}</text>`,
      );
      parts.push(
        `<text class="cad-room-area" x="${cx}" y="${(boxY + 49).toFixed(1)}">${esc(formatArea(room.areaSqm))}</text>`,
      );
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}

function drawDimensionChain(nodes, axis, linePos, options = {}) {
  const { extStart = null, units = "mm", textSide = -1 } = options;
  const parts = [];
  const tickLen = 0.08;
  const extOvershoot =
    0.14 * (extStart !== null ? Math.sign(linePos - extStart) || 1 : 1);

  if (axis === "x") {
    const zLine = linePos;
    const zMin = nodes[0];
    const zMax = nodes[nodes.length - 1];
    parts.push(
      `<line class="cad-dim-line" x1="${m2svg(zMin)}" y1="${m2svg(zLine)}" x2="${m2svg(zMax)}" y2="${m2svg(zLine)}" />`,
    );

    for (const xVal of nodes) {
      if (extStart !== null) {
        parts.push(
          `<line class="cad-dim-ext" x1="${m2svg(xVal)}" y1="${m2svg(extStart)}" x2="${m2svg(xVal)}" y2="${m2svg(zLine + extOvershoot)}" />`,
        );
      }
      parts.push(
        `<line class="cad-dim-tick" x1="${m2svg(xVal - tickLen)}" y1="${m2svg(zLine + tickLen)}" x2="${m2svg(xVal + tickLen)}" y2="${m2svg(zLine - tickLen)}" />`,
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
          `<text class="cad-dim-text" style="font-size:9px;" x="${sx}" y="${labelY}">${esc(label)}</text>`,
        );
      } else {
        parts.push(
          `<text class="cad-dim-text" x="${sx}" y="${labelY}">${esc(label)}</text>`,
        );
      }
    }
  } else {
    const xLine = linePos;
    const zMin = nodes[0];
    const zMax = nodes[nodes.length - 1];
    parts.push(
      `<line class="cad-dim-line" x1="${m2svg(xLine)}" y1="${m2svg(zMin)}" x2="${m2svg(xLine)}" y2="${m2svg(zMax)}" />`,
    );

    for (const zVal of nodes) {
      if (extStart !== null) {
        parts.push(
          `<line class="cad-dim-ext" x1="${m2svg(extStart)}" y1="${m2svg(zVal)}" x2="${m2svg(xLine + extOvershoot)}" y2="${m2svg(zVal)}" />`,
        );
      }
      parts.push(
        `<line class="cad-dim-tick" x1="${m2svg(xLine - tickLen)}" y1="${m2svg(zVal + tickLen)}" x2="${m2svg(xLine + tickLen)}" y2="${m2svg(zVal - tickLen)}" />`,
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
        `<text class="cad-dim-text" ${isTight ? 'style="font-size:9px;" ' : ""}x="${sx}" y="${sy}" transform="rotate(-90 ${sx} ${sy})">${esc(label)}</text>`,
      );
    }
  }

  return parts.join("\n");
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
    if (op.type === "opening" && !op.swing) continue;
    const center = resolveOpeningCenter(op);
    const start = Math.max(0, center - op.width / 2);
    const end = Math.min(len, center + op.width / 2);
    if (axis === "x") {
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

/**
 * Intersects a dimension ray at `sliceCoord` along `axis` ('x' = horizontal ray at z = sliceCoord,
 * 'z' = vertical ray at x = sliceCoord) against all floor walls, returning sorted wall-face coordinates.
 */
export function computeWallSliceNodes(walls = [], axis = "x", sliceCoord = 0) {
  const eps = 0.02;
  const coords = [];
  for (const wall of walls) {
    const box = getWallBox(wall);
    if (axis === "x") {
      if (
        !box.isHorizontal &&
        sliceCoord >= box.minZ - eps &&
        sliceCoord <= box.maxZ + eps
      ) {
        coords.push(box.minX, box.maxX);
      }
    } else if (
      box.isHorizontal &&
      sliceCoord >= box.minX - eps &&
      sliceCoord <= box.maxX + eps
    ) {
      coords.push(box.minZ, box.maxZ);
    }
  }
  return sortUniqueCoords(coords);
}

function renderExteriorDimensions(floorConfig, designConfig, units) {
  const bounds = computeFloorBounds(floorConfig, designConfig);
  const {
    wallMinX,
    wallMaxX,
    wallMinZ,
    wallMaxZ,
    northWall,
    southWall,
    eastWall,
    westWall,
    terrace,
  } = bounds;

  const northNodes = sortUniqueCoords([
    wallMinX,
    ...collectWallOpeningNodes(northWall?.wallDef, "x"),
    wallMaxX,
  ]);
  const southNodes = sortUniqueCoords([
    wallMinX,
    ...collectWallOpeningNodes(southWall?.wallDef, "x"),
    wallMaxX,
  ]);
  const eastNodes = sortUniqueCoords([
    wallMinZ,
    ...collectWallOpeningNodes(eastWall?.wallDef, "z"),
    wallMaxZ,
  ]);
  const westNodes = sortUniqueCoords([
    wallMinZ,
    ...collectWallOpeningNodes(westWall?.wallDef, "z"),
    wallMaxZ,
  ]);

  const parts = ['<g class="layer-ext-dims">'];

  // North (top)
  parts.push(
    drawDimensionChain(northNodes, "x", wallMinZ - 0.65, {
      extStart: wallMinZ,
      units,
      textSide: -1,
    }),
  );
  parts.push(
    drawDimensionChain([wallMinX, wallMaxX], "x", wallMinZ - 1.2, {
      extStart: wallMinZ,
      units,
      textSide: -1,
    }),
  );

  // South (bottom)
  parts.push(
    drawDimensionChain(southNodes, "x", wallMaxZ + 0.65, {
      extStart: wallMaxZ,
      units,
      textSide: 1,
    }),
  );
  if (terrace) {
    const southBandNodes = sortUniqueCoords([
      terrace.minX,
      terrace.maxX,
      wallMinX,
      wallMaxX,
    ]);
    parts.push(
      drawDimensionChain(southBandNodes, "x", wallMaxZ + 1.2, {
        extStart: wallMaxZ,
        units,
        textSide: 1,
      }),
    );
    const southOuterMin = Math.min(wallMinX, terrace.minX);
    const southOuterMax = Math.max(wallMaxX, terrace.maxX);
    parts.push(
      drawDimensionChain([southOuterMin, southOuterMax], "x", wallMaxZ + 1.75, {
        extStart: wallMaxZ,
        units,
        textSide: 1,
      }),
    );
  } else {
    parts.push(
      drawDimensionChain([wallMinX, wallMaxX], "x", wallMaxZ + 1.2, {
        extStart: wallMaxZ,
        units,
        textSide: 1,
      }),
    );
  }

  // East (right)
  parts.push(
    drawDimensionChain(eastNodes, "z", wallMaxX + 0.65, {
      extStart: wallMaxX,
      units,
      textSide: -1,
    }),
  );
  parts.push(
    drawDimensionChain([wallMinZ, wallMaxZ], "z", wallMaxX + 1.2, {
      extStart: wallMaxX,
      units,
      textSide: -1,
    }),
  );

  // West (left)
  if (terrace) {
    const westEdge = Math.min(wallMinX, terrace.minX);
    const westBandNodes = sortUniqueCoords([
      wallMinZ,
      terrace.minZ,
      terrace.maxZ,
      wallMaxZ,
    ]);
    parts.push(
      drawDimensionChain(westNodes, "z", westEdge - 0.65, {
        extStart: wallMinX,
        units,
        textSide: -1,
      }),
    );
    parts.push(
      drawDimensionChain(westBandNodes, "z", westEdge - 1.2, {
        extStart: westEdge,
        units,
        textSide: -1,
      }),
    );
    parts.push(
      drawDimensionChain([wallMinZ, wallMaxZ], "z", westEdge - 1.75, {
        extStart: westEdge,
        units,
        textSide: -1,
      }),
    );
  } else {
    parts.push(
      drawDimensionChain(westNodes, "z", wallMinX - 0.65, {
        extStart: wallMinX,
        units,
        textSide: -1,
      }),
    );
    parts.push(
      drawDimensionChain([wallMinZ, wallMaxZ], "z", wallMinX - 1.2, {
        extStart: wallMinX,
        units,
        textSide: -1,
      }),
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}

function pickClearSliceCoord(bandMin, bandMax, axis, floorConfig) {
  const span = bandMax - bandMin;
  if (span < 0.9) return Number(((bandMin + bandMax) / 2).toFixed(2));

  const fractions = [0.22, 0.35, 0.65, 0.78];
  const rooms = (floorConfig.rooms || []).filter(
    (r) => r.interior !== false && Array.isArray(r.pos),
  );
  let bestCoord = bandMin + span * 0.25;
  let bestScore = -Infinity;

  for (const frac of fractions) {
    const cand = bandMin + span * frac;
    let minDist = Infinity;
    for (const r of rooms) {
      const rCoord = axis === "x" ? r.pos[2] : r.pos[0];
      minDist = Math.min(minDist, Math.abs(cand - rCoord));
    }
    if (minDist > bestScore) {
      bestScore = minDist;
      bestCoord = cand;
    }
  }
  return Number(bestCoord.toFixed(2));
}

function discoverDistinctSlices(floorConfig, bounds, axis) {
  const walls = floorConfig.walls || [];
  const boxes = walls.map(getWallBox);
  const { innerMinX, innerMaxX, innerMinZ, innerMaxZ } = bounds;

  const stops =
    axis === "x"
      ? sortUniqueCoords([
          innerMinZ,
          innerMaxZ,
          ...boxes
            .filter((b) => b.isHorizontal)
            .flatMap((b) => [b.minZ, b.maxZ])
            .filter((z) => z > innerMinZ + 0.05 && z < innerMaxZ - 0.05),
        ])
      : sortUniqueCoords([
          innerMinX,
          innerMaxX,
          ...boxes
            .filter((b) => !b.isHorizontal)
            .flatMap((b) => [b.minX, b.maxX])
            .filter((x) => x > innerMinX + 0.05 && x < innerMaxX - 0.05),
        ]);

  const seenSignatures = new Set();
  const slices = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (b - a < 0.45) continue;

    const sliceCoord = pickClearSliceCoord(a, b, axis, floorConfig);
    const nodes = computeWallSliceNodes(walls, axis, sliceCoord);
    if (nodes.length < 4) continue;

    const sig = nodes.map((n) => n.toFixed(2)).join("|");
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    slices.push({ sliceCoord, nodes });
  }

  return slices;
}

function renderInteriorDimensions(floorConfig, designConfig, bounds, units) {
  const walls = floorConfig.walls || [];
  const parts = ['<g class="layer-int-dims">'];

  const customSlices = floorConfig.dimensionSlices;
  if (customSlices) {
    for (const zSlice of customSlices.x || []) {
      const nodes = computeWallSliceNodes(walls, "x", zSlice);
      if (nodes.length >= 4) {
        parts.push(
          drawDimensionChain(nodes, "x", zSlice, { units, textSide: -1 }),
        );
      }
    }
    for (const xSlice of customSlices.z || []) {
      const nodes = computeWallSliceNodes(walls, "z", xSlice);
      if (nodes.length >= 4) {
        parts.push(
          drawDimensionChain(nodes, "z", xSlice, { units, textSide: -1 }),
        );
      }
    }
  } else {
    for (const { sliceCoord, nodes } of discoverDistinctSlices(
      floorConfig,
      bounds,
      "x",
    )) {
      parts.push(
        drawDimensionChain(nodes, "x", sliceCoord, { units, textSide: -1 }),
      );
    }
    for (const { sliceCoord, nodes } of discoverDistinctSlices(
      floorConfig,
      bounds,
      "z",
    )) {
      parts.push(
        drawDimensionChain(nodes, "z", sliceCoord, { units, textSide: -1 }),
      );
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderAnalysisOverlay(floorAnalysis) {
  const issues = (floorAnalysis?.issues || []).filter(
    (i) => i.severity === "error" || i.severity === "warning",
  );
  const parts = ['<g class="layer-analysis">'];
  const labelKeepouts = [];

  const renderArc = (a, cls) => {
    if (!a) return "";
    return `<path class="${cls}" d="M ${m2svg(a.hx)} ${m2svg(a.hz)} L ${m2svg(a.ox)} ${m2svg(a.oz)} A ${m2svg(a.r)} ${m2svg(a.r)} 0 0 ${a.sweepFlag} ${m2svg(a.cx)} ${m2svg(a.cz)} Z" />`;
  };

  for (const iss of issues) {
    const isErr = iss.severity === "error";
    const fillCls = isErr ? "cad-audit-error-fill" : "cad-audit-warn-fill";
    const geom = iss.geometry || {};

    if (geom.zoneBox) {
      const z = geom.zoneBox;
      parts.push(
        `<rect class="cad-audit-zone" x="${m2svg(z.minX)}" y="${m2svg(z.minZ)}" width="${m2svg(Math.max(0.04, z.maxX - z.minX))}" height="${m2svg(Math.max(0.04, z.maxZ - z.minZ))}" />`,
      );
    }

    if (geom.arc) parts.push(renderArc(geom.arc, fillCls));
    if (geom.arc2) parts.push(renderArc(geom.arc2, fillCls));

    if (geom.conflictBox) {
      const c = geom.conflictBox;
      parts.push(
        `<rect class="${fillCls}" x="${m2svg(c.minX)}" y="${m2svg(c.minZ)}" width="${m2svg(Math.max(0.04, c.maxX - c.minX))}" height="${m2svg(Math.max(0.04, c.maxZ - c.minZ))}" />`,
      );
    }

    if (geom.measureSegment) {
      const s = geom.measureSegment;
      const sx1 = m2svg(s.x1);
      const sy1 = m2svg(s.z1);
      const sx2 = m2svg(s.x2);
      const sy2 = m2svg(s.z2);
      const dx = sx2 - sx1;
      const dy = sy2 - sy1;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * 4;
      const py = (dx / len) * 4;
      const mCls = isErr ? "cad-audit-measure-err" : "cad-audit-measure-warn";
      const lCls = isErr ? "cad-audit-label-err" : "cad-audit-label-warn";

      parts.push(
        `<line class="${mCls}" x1="${sx1}" y1="${sy1}" x2="${sx2}" y2="${sy2}" />`,
      );
      parts.push(
        `<line class="${mCls}" x1="${(sx1 - px).toFixed(1)}" y1="${(sy1 - py).toFixed(1)}" x2="${(sx1 + px).toFixed(1)}" y2="${(sy1 + py).toFixed(1)}" />`,
      );
      parts.push(
        `<line class="${mCls}" x1="${(sx2 - px).toFixed(1)}" y1="${(sy2 - py).toFixed(1)}" x2="${(sx2 + px).toFixed(1)}" y2="${(sy2 + py).toFixed(1)}" />`,
      );

      if (iss.measuredM !== null && iss.measuredM !== undefined) {
        const mx = (sx1 + sx2) / 2;
        const my = (sy1 + sy2) / 2 - 5;
        const label = `${Math.round(iss.measuredM * 100)} cm`;
        parts.push(
          `<text class="${lCls}" x="${mx.toFixed(1)}" y="${my.toFixed(1)}">${esc(label)}</text>`,
        );
        labelKeepouts.push([mx, my - 3]);
      }
    }
  }

  // Second pass for numbered badges with greedy de-overlapping (avoids other badges & cm labels)
  const placedBadges = [...labelKeepouts];
  const minDist = 23;
  const candidateOffsets = [[0, 0]];
  for (const r of [24, 38, 52]) {
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      candidateOffsets.push([
        Math.round(Math.cos(ang) * r),
        Math.round(Math.sin(ang) * r),
      ]);
    }
  }

  for (const iss of issues) {
    if (!iss.badgeNum || !iss.geometry?.point) continue;
    const isErr = iss.severity === "error";
    const ox = m2svg(iss.geometry.point[0]);
    const oy = m2svg(iss.geometry.point[1]);

    let bx = ox;
    let by = oy;
    for (const [dx, dy] of candidateOffsets) {
      const tx = ox + dx;
      const ty = oy + dy;
      const clear = placedBadges.every(
        ([px, py]) => Math.hypot(tx - px, ty - py) >= minDist,
      );
      if (clear) {
        bx = tx;
        by = ty;
        break;
      }
    }
    placedBadges.push([bx, by]);

    if (Math.hypot(bx - ox, by - oy) > 4) {
      parts.push(
        `<line class="cad-audit-leader" x1="${ox}" y1="${oy}" x2="${bx}" y2="${by}" />`,
      );
    }

    const badgeCls = isErr ? "cad-audit-badge-err" : "cad-audit-badge-warn";
    parts.push(
      `<circle class="${badgeCls}" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="9.5" />`,
    );
    parts.push(
      `<text class="cad-audit-badge-txt" x="${bx.toFixed(1)}" y="${(by + 3.4).toFixed(1)}">${iss.badgeNum}</text>`,
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderSectionLines(designConfig, bounds) {
  const secPlanes = computeSectionPlanes(designConfig);
  const { wallMinX, wallMaxX, wallMinZ, wallMaxZ, terrace } = bounds;
  const parts = ['<g class="layer-section-lines">'];

  // A-A' horizontal cut
  const aaLeftM = terrace
    ? Math.min(wallMinX, terrace.minX) - 1.95
    : wallMinX - 1.5;
  const aaRightM = wallMaxX + 1.5;
  const aaY = m2svg(secPlanes.AA.cutZ);
  const aaX1 = m2svg(aaLeftM);
  const aaX2 = m2svg(aaRightM);

  parts.push(
    `<line class="cad-ridge" x1="${aaX1}" y1="${aaY}" x2="${aaX2}" y2="${aaY}" stroke="#0f172a" stroke-width="1.2" stroke-dasharray="14 4 3 4" />`,
  );
  for (const [ex, lbl] of [
    [aaX1, "A"],
    [aaX2, "A'"],
  ]) {
    parts.push(
      `<line x1="${ex - 14}" y1="${aaY}" x2="${ex + 14}" y2="${aaY}" stroke="#0f172a" stroke-width="2.5" />`,
    );
    parts.push(
      `<line x1="${ex}" y1="${aaY}" x2="${ex}" y2="${aaY - 32}" stroke="#0f172a" stroke-width="2" />`,
    );
    parts.push(
      `<polygon points="${ex},${aaY - 44} ${ex - 6},${aaY - 30} ${ex + 6},${aaY - 30}" fill="#0f172a" />`,
    );
    parts.push(
      `<text class="cad-sec-label" x="${ex}" y="${aaY - 52}">${lbl}</text>`,
    );
  }

  // B-B' vertical cut
  const bbTopM = wallMinZ - 1.5;
  const bbBotM = terrace ? wallMaxZ + 1.95 : wallMaxZ + 1.5;
  const bbX = m2svg(secPlanes.BB.cutX);
  const bbY1 = m2svg(bbTopM);
  const bbY2 = m2svg(bbBotM);

  parts.push(
    `<line class="cad-ridge" x1="${bbX}" y1="${bbY1}" x2="${bbX}" y2="${bbY2}" stroke="#0f172a" stroke-width="1.2" stroke-dasharray="14 4 3 4" />`,
  );
  for (const [ey, lbl] of [
    [bbY1, "B"],
    [bbY2, "B'"],
  ]) {
    parts.push(
      `<line x1="${bbX}" y1="${ey - 14}" x2="${bbX}" y2="${ey + 14}" stroke="#0f172a" stroke-width="2.5" />`,
    );
    parts.push(
      `<line x1="${bbX}" y1="${ey}" x2="${bbX - 32}" y2="${ey}" stroke="#0f172a" stroke-width="2" />`,
    );
    parts.push(
      `<polygon points="${bbX - 44},${ey} ${bbX - 30},${ey - 6} ${bbX - 30},${ey + 6}" fill="#0f172a" />`,
    );
    parts.push(
      `<text class="cad-sec-label" x="${bbX - 52}" y="${ey + 5}">${lbl}</text>`,
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderFloorPlanGroup(
  designConfig,
  floorKey,
  offsetX,
  offsetY,
  options,
  floorAnalysis = null,
) {
  const floorConfig =
    floorKey === "2np" ? designConfig.floor2 : designConfig.floor1;
  if (!floorConfig) return "";

  const bounds = computeFloorBounds(floorConfig, designConfig);
  const structElev = floorConfig.elevation ?? 0;
  const finishThick =
    (floorConfig.finishes || []).find((f) => f.material !== "terrace")
      ?.thickness ?? 0;
  const finishElev = structElev + finishThick;

  const title =
    floorKey === "2np" ? "PŮDORYS 2.NP (PATRO)" : "PŮDORYS 1.NP (PŘÍZEMÍ)";
  const baseLabel = structElev === 0 ? "základová deska" : "nosná deska";
  const elevText = `Úroveň č. podlahy ${formatElevation(finishElev)} m (${baseLabel} ${formatElevation(structElev)} m)`;

  const headingX = m2svg(bounds.wallMinX);
  const headingY = m2svg(bounds.wallMinZ - 2.25);

  const parts = [];
  parts.push(`<g transform="translate(${offsetX}, ${offsetY})">`);
  parts.push(
    `<text class="cad-plan-heading" x="${headingX}" y="${headingY}">${esc(title)}</text>`,
  );
  parts.push(
    `<text class="cad-plan-sub" x="${headingX}" y="${headingY + 22}">${esc(elevText)}</text>`,
  );

  parts.push(
    renderFinishesAndOverhangs(
      floorConfig,
      designConfig,
      floorKey,
      options.showHatches !== false,
    ),
  );
  parts.push(renderStairsAndChimney(designConfig, floorKey));
  parts.push(
    renderFurniture(floorConfig, floorKey, options.showFurniture !== false),
  );
  parts.push(renderWallsAndOpenings(floorConfig, options, bounds, floorKey));
  if (options.showInteriorDims !== false) {
    parts.push(
      renderInteriorDimensions(
        floorConfig,
        designConfig,
        bounds,
        options.units || "mm",
      ),
    );
  }
  if (options.showDimensions !== false) {
    parts.push(
      renderExteriorDimensions(
        floorConfig,
        designConfig,
        options.units || "mm",
      ),
    );
    if (floorKey === "1np") {
      parts.push(renderSectionLines(designConfig, bounds));
    }
  }
  parts.push(renderRoomStamps(floorConfig));
  if (options.showAnalysis && floorAnalysis) {
    parts.push(renderAnalysisOverlay(floorAnalysis));
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderRoomScheduleTable(x, y, width, title, floorConfig) {
  const schedule = computeRoomSchedule(floorConfig?.rooms || [], floorConfig);
  const rowH = 22;
  const headerH = 28;
  const interiorRooms = schedule.rooms.filter((r) => r.interior);
  const exteriorRooms = schedule.rooms.filter((r) => !r.interior);
  const totalRows = schedule.rooms.length + 1 + (exteriorRooms.length ? 1 : 0);
  const totalH = headerH + totalRows * rowH + 10;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(
    `<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`,
  );
  parts.push(
    `<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`,
  );
  parts.push(
    `<text class="cad-panel-head-txt" x="12" y="18">${esc(title)}</text>`,
  );

  let curY = headerH + 17;
  const renderRow = (id, name, area, bold = false, accent = false) => {
    const weight = bold ? "font-weight:700;" : "";
    const fill = accent ? "fill:#1d4ed8;" : "";
    parts.push(
      `<text class="cad-table-txt" style="${weight}" x="12" y="${curY}">${id ? `${esc(id)}  ` : ""}${esc(name)}</text>`,
    );
    parts.push(
      `<text class="cad-table-num" style="${weight}${fill}" x="${width - 12}" y="${curY}">${esc(formatArea(area))}</text>`,
    );
    curY += rowH;
  };

  for (const r of interiorRooms) {
    renderRow(r.id, r.name, r.areaSqm);
    parts.push(
      `<line class="cad-table-row-line" x1="10" y1="${curY - 15}" x2="${width - 10}" y2="${curY - 15}" />`,
    );
  }

  parts.push(
    `<line x1="10" y1="${curY - 15}" x2="${width - 10}" y2="${curY - 15}" stroke="#334155" stroke-width="1.2" />`,
  );
  renderRow(
    "",
    "Užitná plocha podlaží celkem",
    schedule.interiorTotalSqm,
    true,
    true,
  );

  for (const r of exteriorRooms) {
    parts.push(
      `<line class="cad-table-row-line" x1="10" y1="${curY - 15}" x2="${width - 10}" y2="${curY - 15}" />`,
    );
    renderRow(r.id, r.name, r.areaSqm);
  }

  parts.push("</g>");
  return {
    svg: parts.join("\n"),
    height: totalH,
    interiorTotalSqm: schedule.interiorTotalSqm,
  };
}

function renderCompassAndScale(x, y, width, options = {}) {
  const h = 124;
  const parcelRot = options.siteConfig?.parcelRotationDeg ?? 26.5;
  const houseRot =
    options.housePos?.rotY ?? options.siteConfig?.defaultHousePos?.rotY ?? 0;
  const totalRotDeg = parcelRot + houseRot;
  const rotStr = totalRotDeg.toFixed(1).replace(".", ",");
  const rad = (totalRotDeg * Math.PI) / 180;

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(
    `<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`,
  );

  // Dual North Arrow: Building axis (straight up) + True North (rotated +totalRotDeg CW)
  const cx = 58;
  const cy = 66;

  // Compass circle
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="32" fill="#ffffff" stroke="#334155" stroke-width="1.2" />`,
  );
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2 3" />`,
  );

  // Building axis (vertical / straight up)
  parts.push(
    `<line x1="${cx}" y1="${cy + 25}" x2="${cx}" y2="${cy - 27}" stroke="#94a3b8" stroke-width="0.9" stroke-dasharray="3 2" />`,
  );
  parts.push(
    `<line x1="${cx - 25}" y1="${cy}" x2="${cx + 25}" y2="${cy}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2 2" />`,
  );
  parts.push(
    `<line x1="${cx - 4}" y1="${cy - 27}" x2="${cx + 4}" y2="${cy - 27}" stroke="#64748b" stroke-width="1.2" />`,
  );
  parts.push(
    `<text class="cad-micro-text" style="font-size:7px;fill:#64748b;font-weight:600;text-anchor:middle;" x="${cx}" y="21">OSA DOMU</text>`,
  );

  // Rotation angle arc (between vertical and True North needle)
  if (Math.abs(totalRotDeg) >= 1) {
    const arcR = 20;
    const arcX = cx + arcR * Math.sin(rad);
    const arcY = cy - arcR * Math.cos(rad);
    parts.push(
      `<path d="M ${cx} ${cy - arcR} A ${arcR} ${arcR} 0 0 ${totalRotDeg >= 0 ? 1 : 0} ${arcX.toFixed(2)} ${arcY.toFixed(2)}" fill="none" stroke="#2563eb" stroke-width="1.1" stroke-dasharray="2 2" />`,
    );
    const midRad = rad / 2;
    const txtR = arcR + 6;
    const txtX = cx + txtR * Math.sin(midRad);
    const txtY = cy - txtR * Math.cos(midRad);
    parts.push(
      `<text class="cad-micro-text" style="font-size:7.5px;fill:#2563eb;font-weight:700;text-anchor:middle;" x="${txtX.toFixed(1)}" y="${txtY.toFixed(1)}">+${rotStr}°</text>`,
    );
  }

  // True North Needle (rotated by totalRotDeg around cx, cy)
  parts.push(`<g transform="rotate(${totalRotDeg.toFixed(2)}, ${cx}, ${cy})">`);
  // Left half (dark filled)
  parts.push(
    `<polygon points="${cx},${cy - 29} ${cx - 7},${cy + 4} ${cx},${cy} ${cx},${cy - 29}" fill="#0f172a" />`,
  );
  // Right half (white filled with stroke)
  parts.push(
    `<polygon points="${cx},${cy - 29} ${cx + 7},${cy + 4} ${cx},${cy} ${cx},${cy - 29}" fill="#ffffff" stroke="#0f172a" stroke-width="1" />`,
  );
  // South needle tail
  parts.push(
    `<polygon points="${cx},${cy + 16} ${cx - 4},${cy + 4} ${cx},${cy}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8" />`,
  );
  parts.push(
    `<polygon points="${cx},${cy + 16} ${cx + 4},${cy + 4} ${cx},${cy}" fill="#94a3b8" stroke="#94a3b8" stroke-width="0.8" />`,
  );
  parts.push(`</g>`);

  // Center pivot pin
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#0f172a" stroke="#ffffff" stroke-width="1" />`,
  );

  // Bold letter 'S' for True North placed outside needle tip
  const labelR = 41;
  const labelX = cx + labelR * Math.sin(rad);
  const labelY = cy - labelR * Math.cos(rad) + 4;
  parts.push(
    `<text class="cad-room-name" style="font-size:12px;font-weight:800;fill:#0f172a;text-anchor:middle;" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}">S</text>`,
  );

  // Graphic scale bar 0 - 5 m (1 m = 100 SVG units at 1:1 -> fit 0..3 m = 300px)
  const sx = 122;
  const sy = 56;
  const seg = 64;
  parts.push(
    `<text class="cad-title-label" x="${sx}" y="24">GRAFICKÉ MĚŘÍTKO (1:50)</text>`,
  );
  for (let i = 0; i < 5; i++) {
    const fill = i % 2 === 0 ? "#0f172a" : "#ffffff";
    parts.push(
      `<rect x="${sx + i * seg}" y="${sy}" width="${seg}" height="9" fill="${fill}" stroke="#0f172a" stroke-width="1" />`,
    );
    parts.push(
      `<text class="cad-micro-text" x="${sx + i * seg}" y="${sy + 22}">${i}</text>`,
    );
  }
  parts.push(
    `<text class="cad-micro-text" x="${sx + 5 * seg}" y="${sy + 22}">5 m</text>`,
  );
  parts.push(
    `<text class="cad-micro-text" style="text-anchor:start;font-weight:600;" x="${sx}" y="98">Skutečný sever (S): +${rotStr}° od osy domu</text>`,
  );
  const northAzimuth = Math.round(((360 - totalRotDeg) % 360 + 360) % 360);
  parts.push(
    `<text class="cad-micro-text" style="text-anchor:start;fill:#64748b;" x="${sx}" y="112">Severní fasáda: azimut ${northAzimuth}° (SSZ)</text>`,
  );

  parts.push("</g>");
  return { svg: parts.join("\n"), height: h };
}

function renderLegend(x, y, width, units, showHatches = true) {
  const h = 136;
  const structFill = showHatches ? "url(#hatch-structural)" : "#475569";
  const partFill = showHatches ? "url(#hatch-partition)" : "#94a3b8";
  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(
    `<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" />`,
  );
  parts.push(
    `<rect class="cad-panel-head" x="0" y="0" width="${width}" height="24" />`,
  );
  parts.push(
    `<text class="cad-panel-head-txt" x="12" y="16">LEGENDA KONSTRUKCÍ A ZNAČEK</text>`,
  );

  parts.push(
    `<rect x="14" y="36" width="28" height="14" fill="${structFill}" stroke="#0f172a" stroke-width="1.5" />`,
  );
  parts.push(
    `<text class="cad-table-txt" x="50" y="47">Nosné zdivo (380 / 240 / 175 mm)</text>`,
  );

  parts.push(
    `<rect x="14" y="60" width="28" height="14" fill="${partFill}" stroke="#334155" stroke-width="1.1" />`,
  );
  parts.push(
    `<text class="cad-table-txt" x="50" y="71">Dělicí příčka (140 mm zdivo / 125 mm SDK)</text>`,
  );

  parts.push(
    `<rect x="14" y="84" width="28" height="12" fill="#ffffff" stroke="#0f172a" stroke-width="1" />`,
  );
  parts.push(
    `<line x1="14" y1="90" x2="42" y2="90" stroke="#0284c7" stroke-width="1.4" />`,
  );
  parts.push(
    `<text class="cad-table-txt" x="50" y="94">Okno / HS portál · kóta: š×v (parapet)</text>`,
  );

  parts.push(
    `<line x1="14" y1="114" x2="42" y2="114" stroke="#64748b" stroke-width="1.1" stroke-dasharray="6 3" />`,
  );
  parts.push(
    `<text class="cad-table-txt" x="50" y="118">Přesah střechy / zastřešení · Kóty v ${units}</text>`,
  );

  parts.push("</g>");
  return { svg: parts.join("\n"), height: h };
}

function renderTitleBlock(x, y, width, designConfig, sheet, units) {
  const h = 152;
  const parts = [];
  const docTitle =
    sheet === "both"
      ? "PŮDORYS 1.NP A 2.NP"
      : sheet === "2np"
        ? "PŮDORYS 2.NP (PATRO)"
        : "PŮDORYS 1.NP (PŘÍZEMÍ)";

  const wM = (designConfig.footprint?.width ?? 8).toFixed(1).replace(".", ",");
  const lM = (designConfig.footprint?.length ?? 12)
    .toFixed(1)
    .replace(".", ",");

  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(
    `<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${h}" stroke-width="1.8" />`,
  );
  parts.push(
    `<line x1="0" y1="54" x2="${width}" y2="54" stroke="#334155" stroke-width="1.1" />`,
  );
  parts.push(
    `<line x1="0" y1="104" x2="${width}" y2="104" stroke="#334155" stroke-width="1.1" />`,
  );
  parts.push(
    `<line x1="${width * 0.52}" y1="104" x2="${width * 0.52}" y2="${h}" stroke="#334155" stroke-width="1.1" />`,
  );
  parts.push(
    `<line x1="${width * 0.78}" y1="104" x2="${width * 0.78}" y2="${h}" stroke="#334155" stroke-width="1.1" />`,
  );

  parts.push(
    `<text class="cad-title-label" x="14" y="16">PROJEKT / OBJEKT</text>`,
  );
  parts.push(
    `<text class="cad-title-main" x="14" y="40">RODINNÝ DŮM 6+KK · VOJÁČKOVI TROUBELICE</text>`,
  );

  parts.push(
    `<text class="cad-title-label" x="14" y="71">OBSAH VÝKRESU</text>`,
  );
  parts.push(
    `<text class="cad-title-sub" x="14" y="92">${esc(docTitle)} · PŮDORYS ${wM} × ${lM} m</text>`,
  );

  parts.push(
    `<text class="cad-title-label" x="14" y="121">ZDROJ MODELU</text>`,
  );
  const rawLabel = String(designConfig.label || designConfig.id || "");
  if (rawLabel.length > 28) {
    const parenIdx = rawLabel.indexOf("(");
    let line1 = rawLabel;
    let line2 = "";
    if (parenIdx > 0) {
      line1 = rawLabel.slice(0, parenIdx).trim();
      line2 = rawLabel.slice(parenIdx).trim();
    } else {
      line1 = rawLabel.slice(0, 26).trim();
      line2 = rawLabel.slice(26).trim();
    }
    parts.push(
      `<text class="cad-title-val" x="14" y="134" style="font-size:10px;">${esc(line1)}</text>`,
    );
    parts.push(
      `<text class="cad-title-val" x="14" y="145" style="font-size:8.5px;fill:#475569;">${esc(line2)}</text>`,
    );
  } else {
    parts.push(
      `<text class="cad-title-val" x="14" y="140">${esc(rawLabel)}</text>`,
    );
  }

  parts.push(
    `<text class="cad-title-label" x="${width * 0.52 + 12}" y="121">MĚŘÍTKO</text>`,
  );
  parts.push(
    `<text class="cad-title-val" x="${width * 0.52 + 12}" y="140">1 : 50</text>`,
  );

  parts.push(
    `<text class="cad-title-label" x="${width * 0.78 + 12}" y="121">JEDNOTKY</text>`,
  );
  parts.push(
    `<text class="cad-title-val" x="${width * 0.78 + 12}" y="140">${esc(units)}</text>`,
  );

  parts.push("</g>");
  return parts.join("\n");
}

function renderAnalysisPanel(x, y, width, maxHeight, analysisReport, sheet) {
  if (!analysisReport || maxHeight < 70) return "";

  let items = [];
  if (sheet === "both") {
    const f1 = (analysisReport.floor1?.issues || [])
      .filter((i) => i.severity !== "info")
      .map((i) => ({ ...i, floorTag: "1.NP" }));
    const f2 = (analysisReport.floor2?.issues || [])
      .filter((i) => i.severity !== "info")
      .map((i) => ({ ...i, floorTag: "2.NP" }));
    items = [...f1, ...f2].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      if (a.floorTag !== b.floorTag)
        return a.floorTag.localeCompare(b.floorTag);
      return (a.badgeNum || 0) - (b.badgeNum || 0);
    });
  } else if (sheet === "2np") {
    items = (analysisReport.floor2?.issues || [])
      .filter((i) => i.severity !== "info")
      .map((i) => ({ ...i, floorTag: "" }));
  } else {
    items = (analysisReport.floor1?.issues || [])
      .filter((i) => i.severity !== "info")
      .map((i) => ({ ...i, floorTag: "" }));
  }

  const errCount = items.filter((i) => i.severity === "error").length;
  const warnCount = items.filter((i) => i.severity === "warning").length;

  const headerH = 26;
  const rowH = 20;
  const padBottom = 10;
  const displayCount = Math.max(1, items.length);
  const desiredH = headerH + displayCount * rowH + padBottom;
  const totalH = Math.min(desiredH, maxHeight);
  const maxRows = Math.max(
    1,
    Math.floor((totalH - headerH - padBottom) / rowH),
  );

  const parts = [];
  parts.push(`<g transform="translate(${x}, ${y})">`);
  parts.push(
    `<rect class="cad-panel-box" x="0" y="0" width="${width}" height="${totalH}" />`,
  );
  parts.push(
    `<rect class="cad-panel-head" x="0" y="0" width="${width}" height="${headerH}" />`,
  );
  parts.push(
    `<text class="cad-panel-head-txt" x="12" y="17">KONTROLA DISPOZICE</text>`,
  );

  const pillBg =
    errCount > 0 ? "#dc2626" : warnCount > 0 ? "#d97706" : "#16a34a";
  const pillText = `${errCount} chyb · ${warnCount} var.`;
  parts.push(
    `<rect x="${width - 134}" y="4" width="124" height="18" rx="3" fill="${pillBg}" />`,
  );
  parts.push(
    `<text class="cad-room-id-txt" x="${width - 72}" y="16" style="font-size:9.5px;">${esc(pillText)}</text>`,
  );

  let curY = headerH + 16;
  if (items.length === 0) {
    parts.push(
      `<text class="cad-table-txt" x="14" y="${curY}" style="fill:#15803d;font-weight:700;">✓ Bez zjištěných kolizí či ergonomických problémů</text>`,
    );
  } else {
    const truncated = items.length > maxRows;
    const rowsToRender = truncated ? Math.max(0, maxRows - 1) : items.length;

    for (let idx = 0; idx < rowsToRender; idx++) {
      const iss = items[idx];
      const isErr = iss.severity === "error";
      const dotColor = isErr ? "#dc2626" : "#d97706";
      const prefix = `${iss.floorTag ? `${iss.floorTag} ` : ""}#${iss.badgeNum || idx + 1}${iss.roomId ? ` [${iss.roomId}]` : ""}`;
      const maxTitleChars = iss.floorTag ? 33 : 38;
      const rawTitle = String(iss.title || "");
      const cleanTitle =
        rawTitle.length > maxTitleChars
          ? `${rawTitle.slice(0, maxTitleChars - 1)}…`
          : rawTitle;
      const valStr =
        iss.measuredM !== null && iss.measuredM !== undefined
          ? `${Math.round(iss.measuredM * 100)} cm`
          : "KOLIZE";

      parts.push(
        `<circle cx="15" cy="${curY - 3.5}" r="4" fill="${dotColor}" />`,
      );
      parts.push(
        `<text class="cad-table-txt" x="25" y="${curY}" style="font-size:10.5px;"><tspan style="font-weight:700;">${esc(prefix)}</tspan> ${esc(cleanTitle)}</text>`,
      );
      parts.push(
        `<text class="cad-table-num" x="${width - 12}" y="${curY}" style="font-size:10.5px;fill:${dotColor};">${esc(valStr)}</text>`,
      );
      if (idx < rowsToRender - 1 || truncated) {
        parts.push(
          `<line class="cad-table-row-line" x1="10" y1="${curY + 5}" x2="${width - 10}" y2="${curY + 5}" />`,
        );
      }
      curY += rowH;
    }

    if (truncated) {
      const remaining = items.length - rowsToRender;
      parts.push(
        `<text class="cad-table-txt" x="14" y="${curY}" style="font-size:10.5px;font-style:italic;fill:#475569;">+ ${remaining} dalších nálezů (viz detailní výpis)</text>`,
      );
    }
  }

  parts.push("</g>");
  return parts.join("\n");
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
  if (options?.sheet === "elevations") {
    return generateElevationsSvg(designConfig, options);
  }
  if (options?.sheet === "sections") {
    return generateSectionsSvg(designConfig, options);
  }

  const {
    sheet = "1np",
    showDimensions = true,
    showInteriorDims = true,
    showFurniture = true,
    showOpeningTags = true,
    showHatches = true,
    showAnalysis = false,
    analysisReport = null,
    units = "mm",
  } = options;

  const resolvedAnalysis = showAnalysis
    ? analysisReport || analyzeDesignLayout(designConfig)
    : null;

  const opts = {
    sheet,
    showDimensions,
    showInteriorDims,
    showFurniture,
    showOpeningTags,
    showHatches,
    showAnalysis,
    units,
    tagByKey: options.tagByKey || buildOpeningSchedule(designConfig).tagByKey,
  };

  const isBoth = sheet === "both";
  const sheetW = isBoth ? 3360 : 2180;
  const sheetH = 1760;
  const sidebarX = isBoth ? 2770 : 1610;
  const sidebarW = sheetW - sidebarX - 36;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="100%" height="100%" role="img" aria-label="Technický půdorys rodinného domu">`,
  );
  parts.push(buildDefsAndStyles());

  // Paper sheet & border frame
  parts.push(
    `<rect class="cad-sheet-bg" x="0" y="0" width="${sheetW}" height="${sheetH}" />`,
  );
  parts.push(
    `<rect class="cad-border-outer" x="20" y="20" width="${sheetW - 40}" height="${sheetH - 40}" />`,
  );
  parts.push(
    `<rect class="cad-border-inner" x="26" y="26" width="${sheetW - 52}" height="${sheetH - 52}" />`,
  );

  // Floor plan drawings
  if (isBoth) {
    parts.push(
      renderFloorPlanGroup(
        designConfig,
        "1np",
        1050,
        910,
        opts,
        resolvedAnalysis?.floor1,
      ),
    );
    parts.push(
      `<line x1="1620" y1="55" x2="1620" y2="${sheetH - 55}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="8 6" />`,
    );
    parts.push(
      renderFloorPlanGroup(
        designConfig,
        "2np",
        2190,
        910,
        opts,
        resolvedAnalysis?.floor2,
      ),
    );
  } else if (sheet === "2np") {
    parts.push(
      renderFloorPlanGroup(
        designConfig,
        "2np",
        800,
        910,
        opts,
        resolvedAnalysis?.floor2,
      ),
    );
  } else {
    parts.push(
      renderFloorPlanGroup(
        designConfig,
        "1np",
        1045,
        910,
        opts,
        resolvedAnalysis?.floor1,
      ),
    );
  }

  // Right Info Column: Compass + Scale -> Room Schedule(s) -> Legend -> [Analysis] -> Title Block
  let curY = 42;
  const compass = renderCompassAndScale(sidebarX, curY, sidebarW, options);
  parts.push(compass.svg);
  curY += compass.height + 14;

  if (isBoth) {
    const t1 = renderRoomScheduleTable(
      sidebarX,
      curY,
      sidebarW,
      "MÍSTNOSTI 1.NP (PŘÍZEMÍ)",
      designConfig.floor1,
    );
    parts.push(t1.svg);
    curY += t1.height + 12;

    const t2 = renderRoomScheduleTable(
      sidebarX,
      curY,
      sidebarW,
      "MÍSTNOSTI 2.NP (PATRO)",
      designConfig.floor2,
    );
    parts.push(t2.svg);
    curY += t2.height + 12;

    const totalInterior = (t1.interiorTotalSqm + t2.interiorTotalSqm)
      .toFixed(1)
      .replace(".", ",");
    parts.push(
      `<rect x="${sidebarX}" y="${curY}" width="${sidebarW}" height="32" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2" />`,
    );
    parts.push(
      `<text class="cad-table-txt" style="font-weight:700;" x="${sidebarX + 12}" y="${curY + 20}">CELKOVÁ UŽITNÁ PLOCHA DOMU (1.NP + 2.NP)</text>`,
    );
    parts.push(
      `<text class="cad-table-num" style="font-weight:800;fill:#1d4ed8;" x="${sidebarX + sidebarW - 12}" y="${curY + 20}">${totalInterior}\u00A0m²</text>`,
    );
    curY += 44;
  } else if (sheet === "2np") {
    const t2 = renderRoomScheduleTable(
      sidebarX,
      curY,
      sidebarW,
      "TABULKA MÍSTNOSTÍ — 2.NP",
      designConfig.floor2,
    );
    parts.push(t2.svg);
    curY += t2.height + 14;
  } else {
    const t1 = renderRoomScheduleTable(
      sidebarX,
      curY,
      sidebarW,
      "TABULKA MÍSTNOSTÍ — 1.NP",
      designConfig.floor1,
    );
    parts.push(t1.svg);
    curY += t1.height + 14;
  }

  const legend = renderLegend(
    sidebarX,
    curY,
    sidebarW,
    units,
    opts.showHatches !== false,
  );
  parts.push(legend.svg);
  curY += legend.height + 12;

  // Title block anchored at bottom right
  const titleBlockY = sheetH - 42 - 152;
  if (showAnalysis && resolvedAnalysis) {
    const maxPanelH = titleBlockY - curY - 12;
    parts.push(
      renderAnalysisPanel(
        sidebarX,
        curY,
        sidebarW,
        maxPanelH,
        resolvedAnalysis,
        sheet,
      ),
    );
  }
  parts.push(
    renderTitleBlock(
      sidebarX,
      titleBlockY,
      sidebarW,
      designConfig,
      sheet,
      units,
    ),
  );

  parts.push("</svg>");
  return parts.join("\n");
}
