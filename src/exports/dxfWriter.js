/**
 * Zero-dependency AutoCAD R12 (AC1009) ASCII DXF writer in 1:1 millimeter scale.
 *
 * Uses strict R12 entities (LINE, POLYLINE+VERTEX+SEQEND, CIRCLE, ARC, TEXT)
 * and \U+XXXX Unicode escapes so Czech characters render cleanly across AutoCAD,
 * ArchiCAD, Revit, BricsCAD, QCAD, and LibreCAD.
 */

export const DXF_LAYERS = [
  { name: '0', color: 7, linetype: 'CONTINUOUS' },
  { name: 'A-WALL-LOAD', color: 7, linetype: 'CONTINUOUS' },
  { name: 'A-WALL-PART', color: 8, linetype: 'CONTINUOUS' },
  { name: 'A-WALL-HATCH', color: 9, linetype: 'CONTINUOUS' },
  { name: 'A-WIND', color: 4, linetype: 'CONTINUOUS' },
  { name: 'A-DOOR', color: 3, linetype: 'CONTINUOUS' },
  { name: 'A-DOOR-SWING', color: 8, linetype: 'DASHED' },
  { name: 'A-STAIR', color: 7, linetype: 'CONTINUOUS' },
  { name: 'A-FURN', color: 8, linetype: 'CONTINUOUS' },
  { name: 'A-ROOF', color: 5, linetype: 'DASHED' },
  { name: 'A-FLOOR', color: 252, linetype: 'CONTINUOUS' },
  { name: 'A-DIM', color: 1, linetype: 'CONTINUOUS' },
  { name: 'A-ANNO-ROOM', color: 5, linetype: 'CONTINUOUS' },
  { name: 'A-ANNO-OPEN', color: 6, linetype: 'CONTINUOUS' },
  { name: 'A-SITE-BOUNDARY', color: 1, linetype: 'CENTER' },
  { name: 'A-SITE-BUILD', color: 7, linetype: 'CONTINUOUS' },
  { name: 'A-SITE-DIM', color: 3, linetype: 'DASHED' },
  { name: 'A-ELEV-ROOF', color: 5, linetype: 'CONTINUOUS' },
  { name: 'A-ELEV-TERRAIN', color: 3, linetype: 'CONTINUOUS' },
  { name: 'A-SEC-CUT', color: 1, linetype: 'CENTER' },
  { name: 'A-SEC-STRUCT', color: 7, linetype: 'CONTINUOUS' },
  { name: 'A-SEC-INSUL', color: 2, linetype: 'CONTINUOUS' },
  { name: 'A-TITLE', color: 7, linetype: 'CONTINUOUS' },
];

const DXF_LINETYPES = [
  { name: 'CONTINUOUS', desc: 'Solid line', pattern: [] },
  { name: 'DASHED', desc: 'Dashed __ __ __', pattern: [150.0, -75.0] },
  { name: 'HIDDEN', desc: 'Hidden _ _ _', pattern: [80.0, -50.0] },
  { name: 'CENTER', desc: 'Center ____ _ ____ _', pattern: [300.0, -75.0, 50.0, -75.0] },
];

/**
 * Encodes text to pure 7-bit ASCII using AutoCAD \U+XXXX escapes for non-ASCII characters.
 * Replaces control characters (\r, \n, \t) with spaces.
 *
 * @param {string} str
 * @returns {string}
 */
export function encodeDxfText(str) {
  const cleaned = String(str ?? '').replace(/[\r\n\t]+/g, ' ');
  let out = '';
  for (const ch of cleaned) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 32) {
      out += ' ';
    } else if (cp <= 127) {
      out += ch;
    } else if (cp <= 0xffff) {
      out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    }
  }
  return out;
}

function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  const rounded = Number(n.toFixed(3));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function normDeg(deg) {
  if (!Number.isFinite(deg)) return 0;
  const mod = ((deg % 360) + 360) % 360;
  return Object.is(mod, -0) ? 0 : mod;
}

function pushPairs(buf, pairs) {
  for (let i = 0; i < pairs.length; i += 2) {
    buf.push(String(pairs[i]), String(pairs[i + 1]));
  }
}

export class DxfWriter {
  constructor() {
    this.entities = [];
    this.extMinX = Infinity;
    this.extMinY = Infinity;
    this.extMaxX = -Infinity;
    this.extMaxY = -Infinity;
  }

  _trackPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < this.extMinX) this.extMinX = x;
    if (y < this.extMinY) this.extMinY = y;
    if (x > this.extMaxX) this.extMaxX = x;
    if (y > this.extMaxY) this.extMaxY = y;
  }

  addLine(layer, x1, y1, x2, y2, opts = {}) {
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    this._trackPoint(x1, y1);
    this._trackPoint(x2, y2);

    const pairs = [0, 'LINE', 8, layer || '0'];
    if (opts.linetype) pairs.push(6, opts.linetype);
    if (opts.color !== undefined) pairs.push(62, opts.color);
    pairs.push(10, fmt(x1), 20, fmt(y1), 30, '0', 11, fmt(x2), 21, fmt(y2), 31, '0');
    pushPairs(this.entities, pairs);
  }

  addPolyline(layer, points, { closed = false, linetype, color } = {}) {
    if (!Array.isArray(points)) return;
    const valid = points.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (valid.length < 2) return;

    const head = [0, 'POLYLINE', 8, layer || '0'];
    if (linetype) head.push(6, linetype);
    if (color !== undefined) head.push(62, color);
    head.push(66, 1, 10, '0', 20, '0', 30, '0', 70, closed ? 1 : 0);
    pushPairs(this.entities, head);

    for (const [x, y] of valid) {
      this._trackPoint(x, y);
      pushPairs(this.entities, [0, 'VERTEX', 8, layer || '0', 10, fmt(x), 20, fmt(y), 30, '0']);
    }

    pushPairs(this.entities, [0, 'SEQEND', 8, layer || '0']);
  }

  addRect(layer, x, y, w, h, opts = {}) {
    if (![x, y, w, h].every(Number.isFinite)) return;
    this.addPolyline(
      layer,
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      { ...opts, closed: true }
    );
  }

  addCircle(layer, cx, cy, r, opts = {}) {
    if (![cx, cy, r].every(Number.isFinite) || r <= 0) return;
    this._trackPoint(cx - r, cy - r);
    this._trackPoint(cx + r, cy + r);

    const pairs = [0, 'CIRCLE', 8, layer || '0'];
    if (opts.linetype) pairs.push(6, opts.linetype);
    if (opts.color !== undefined) pairs.push(62, opts.color);
    pairs.push(10, fmt(cx), 20, fmt(cy), 30, '0', 40, fmt(r));
    pushPairs(this.entities, pairs);
  }

  addEllipsePoly(layer, cx, cy, rx, ry, segments = 16, opts = {}) {
    if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return;
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const ang = (i * 2 * Math.PI) / segments;
      pts.push([cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)]);
    }
    this.addPolyline(layer, pts, { ...opts, closed: true });
  }

  addArc(layer, cx, cy, r, startDeg, endDeg, opts = {}) {
    if (![cx, cy, r, startDeg, endDeg].every(Number.isFinite) || r <= 0) return;
    const s = normDeg(startDeg);
    const e = normDeg(endDeg);

    // Track start/end points plus any cardinal extrema crossed by the CCW sweep
    const sweep = e >= s ? e - s : 360 - s + e;
    const angles = [s, e];
    for (const card of [0, 90, 180, 270]) {
      const rel = ((card - s) % 360 + 360) % 360;
      if (rel <= sweep) angles.push(card);
    }
    for (const deg of angles) {
      const rad = (deg * Math.PI) / 180;
      this._trackPoint(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
    }

    const pairs = [0, 'ARC', 8, layer || '0'];
    if (opts.linetype) pairs.push(6, opts.linetype);
    if (opts.color !== undefined) pairs.push(62, opts.color);
    pairs.push(10, fmt(cx), 20, fmt(cy), 30, '0', 40, fmt(r), 50, fmt(s), 51, fmt(e));
    pushPairs(this.entities, pairs);
  }

  addText(layer, x, y, text, { height = 110, rotation = 0, hAlign = 0, vAlign = 0, color } = {}) {
    const encoded = encodeDxfText(text).trim();
    if (!encoded || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this._trackPoint(x, y);

    const safeH = Number.isFinite(height) && height > 0 ? height : 110;
    const pairs = [0, 'TEXT', 8, layer || '0'];
    if (color !== undefined) pairs.push(62, color);
    pairs.push(10, fmt(x), 20, fmt(y), 30, '0', 40, fmt(safeH), 1, encoded);
    if (Number.isFinite(rotation) && rotation !== 0) {
      pairs.push(50, fmt(normDeg(rotation)));
    }
    pairs.push(7, 'STANDARD');
    if (hAlign !== 0 || vAlign !== 0) {
      pairs.push(72, hAlign, 73, vAlign, 11, fmt(x), 21, fmt(y), 31, '0');
    }
    pushPairs(this.entities, pairs);
  }

  toString() {
    const minX = Number.isFinite(this.extMinX) ? this.extMinX : 0;
    const minY = Number.isFinite(this.extMinY) ? this.extMinY : 0;
    const maxX = Number.isFinite(this.extMaxX) ? this.extMaxX : 1000;
    const maxY = Number.isFinite(this.extMaxY) ? this.extMaxY : 1000;

    const lines = [];

    // 1. HEADER
    pushPairs(lines, [
      0, 'SECTION',
      2, 'HEADER',
      9, '$ACADVER', 1, 'AC1009',
      9, '$DWGCODEPAGE', 3, 'ANSI_1250',
      9, '$EXTMIN', 10, fmt(minX), 20, fmt(minY), 30, '0',
      9, '$EXTMAX', 10, fmt(maxX), 20, fmt(maxY), 30, '0',
      9, '$LIMMIN', 10, fmt(minX), 20, fmt(minY),
      9, '$LIMMAX', 10, fmt(maxX), 20, fmt(maxY),
      9, '$LUNITS', 70, 2,
      9, '$LUPREC', 70, 0,
      9, '$LTSCALE', 40, '1',
      9, '$TEXTSIZE', 40, '120',
      0, 'ENDSEC',
    ]);

    // 2. TABLES (LTYPE, LAYER, STYLE)
    pushPairs(lines, [0, 'SECTION', 2, 'TABLES']);

    // LTYPE table
    pushPairs(lines, [0, 'TABLE', 2, 'LTYPE', 70, DXF_LINETYPES.length]);
    for (const lt of DXF_LINETYPES) {
      const totalLen = lt.pattern.reduce((s, v) => s + Math.abs(v), 0);
      pushPairs(lines, [
        0, 'LTYPE',
        2, lt.name,
        70, 0,
        3, lt.desc,
        72, 65,
        73, lt.pattern.length,
        40, fmt(totalLen),
      ]);
      for (const seg of lt.pattern) {
        pushPairs(lines, [49, fmt(seg)]);
      }
    }
    pushPairs(lines, [0, 'ENDTAB']);

    // LAYER table
    pushPairs(lines, [0, 'TABLE', 2, 'LAYER', 70, DXF_LAYERS.length]);
    for (const lay of DXF_LAYERS) {
      pushPairs(lines, [
        0, 'LAYER',
        2, lay.name,
        70, 0,
        62, lay.color,
        6, lay.linetype,
      ]);
    }
    pushPairs(lines, [0, 'ENDTAB']);

    // STYLE table
    pushPairs(lines, [
      0, 'TABLE', 2, 'STYLE', 70, 1,
      0, 'STYLE',
      2, 'STANDARD',
      70, 0,
      40, '0',
      41, '1',
      50, '0',
      71, 0,
      42, '120',
      3, 'txt',
      4, '',
      0, 'ENDTAB',
    ]);

    pushPairs(lines, [0, 'ENDSEC']);

    // 3. BLOCKS (empty)
    pushPairs(lines, [0, 'SECTION', 2, 'BLOCKS', 0, 'ENDSEC']);

    // 4. ENTITIES
    pushPairs(lines, [0, 'SECTION', 2, 'ENTITIES']);
    for (let i = 0; i < this.entities.length; i++) {
      lines.push(this.entities[i]);
    }
    pushPairs(lines, [0, 'ENDSEC', 0, 'EOF']);

    return `${lines.join('\r\n')}\r\n`;
  }
}
