---
name: floorplan-drawings
description: >-
  How to generate, rasterize, visually inspect, and validate 2D architectural CAD floor plan drawings as images.
  Use whenever generating floor plans, inspecting furniture layouts for collisions, testing SVG drawings, or rendering plans to PNG for visual review.
---

# Floor Plan Drawings & Visual CAD Inspection

This guide explains how to generate, rasterize, visually inspect, and validate 2D architectural floor plan drawings (výkresy půdorysu) in this project.

## Why Visual Inspection Requires PNG Rasterization

- **SVG files are text/XML**: Reading `.svg` returns thousands of raw XML tags and coordinates. The vision encoder of the agent cannot perceive 2D spatial layout, overlaps, or typographic hierarchy from text XML.
- **PNG files activate multimodal vision**: Converting SVG to `.png` via `@resvg/resvg-js` allows `read_file` to pass a high-resolution raster image directly into the model's visual processor, enabling human-like architectural inspection of line weights, clearances, badges, and dimensions.

## Workflow: Generating & Inspecting Drawings

### 1. Run Automated Test Suite
To verify SVG generation and export high-resolution PNG images:
```bash
npm test
# or
npm run test:drawings
```
This executes [test/drawings.test.js](../../../test/drawings.test.js) and writes images into `test/output/`:
- `test/output/pudorys-1np.png` (Ground floor / Přízemí, 2000px width)
- `test/output/pudorys-2np.png` (First floor / Patro, 2000px width)
- `test/output/pudorys-both.png` (Combined A3 sheet with summary schedule, 3200px width)

### 2. View Floor Plan Image in Chat
Call the `read_file` tool directly on the generated PNG:
```javascript
read_file({ Path: '/Users/milan/src/house/test/output/pudorys-1np.png' })
```
The model will receive the binary image and visually inspect:
- Wall geometry and thicknesses (380 mm external, 160 mm / 240 mm internal).
- Door swing arcs, window sill/glass lines, and opening tags (`š×v (parapet)`).
- Furniture placements and clear circulation passages.
- Room badges, area numbers, and schedule tables.
- Title block (rohové razítko) and north compass arrow.

### 3. Programmatic Rendering in Node / Tests
```javascript
import { Resvg } from '@resvg/resvg-js';
import { generateFloorPlanSvg } from './src/builders/FloorPlanSvgGenerator.js';
import { getDesignVariant } from './src/designs/index.js';

const design = getDesignVariant('concept'); // dreamHouseV1
const svg = generateFloorPlanSvg(design, { sheet: '1np', units: 'mm' });

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 2000 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
});
const pngBuffer = resvg.render().asPng();
```

---

## Architectural Layout & Drafting Standards

When modifying rooms in [src/designs/dreamHouseV1.js](../../../src/designs/dreamHouseV1.js) or the generator in [src/builders/FloorPlanSvgGenerator.js](../../../src/builders/FloorPlanSvgGenerator.js), enforce these standards:

### 1. Furniture Bounds & Wall Clearances
- **No protrusions past exterior walls**: Always check coordinate bounds against inner wall faces (e.g. `innerMaxZ = 5.62 m`). A bed at `pos.z = 5.00 m` with length `2.00 m` reaches `z = 6.00 m`, which pokes through the wall. Keep bed centers $\le 4.45\text{ m}$.
- **Kitchen / Dining ergonomics**: Maintain at least $90\text{ cm}$ clearance between the kitchen island and dining chairs to allow pulling chairs out and comfortable passage.
- **Sanitary fixtures against plumbing walls**: Mount toilets and washbasins directly against installation walls (e.g., east wall in 2.05 at $X = 3.28\text{ m}$, not floating in the middle of the room).

### 2. Room Stamp Placement
- Place room tags (`room.pos`) in the **geometric center of clear circulation space**, never on top of sofas, kitchen islands, beds, or shower enclosures.
- For narrow rooms (e.g. WC 2.05), place the badge in the open floor space between vanity and toilet bowl.

### 3. CAD Dimension Chains & Layer Order
- **Layer order matters**: Always render `renderRoomStamps` **after** dimension lines. The opaque white halo of the room badge cleanly masks dimension lines passing beneath it.
- **White stroke halo on text**: All CAD labels (`.cad-dim-text`, `.cad-tag-text`, `.cad-micro-text`) must use `paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px;` so dimension numbers and tags remain crisp and readable over hatches, walls, and furniture.
- **Curated dimension chains**: Prefer explicit `dimensionSlices` in `floorConfig` (e.g. central corridor lines) over blindly slicing across every room, to avoid cluttering furniture layouts.

### 4. Title Block (Razítko)
- Always handle long model variant names in `renderTitleBlock` by cleanly wrapping to two lines (`line1` for model name, `line2` for variant description) so it never collides with the `MĚŘÍTKO` column.
