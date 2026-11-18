# Project Instructions & CAD Floor Plan Guidelines

## Overview
This repository contains a 3D IFC and 2D CAD architectural viewer for residential house designs (currently **Rodinný dům 6+kk · Dream House**).

## Skills & Automated Tools
- **Floor Plan Drawings Skill**: See [.agents/skills/floorplan-drawings/SKILL.md](file:///.agents/skills/floorplan-drawings/SKILL.md) for detailed procedures on generating, rendering, and visually inspecting 2D CAD floor plans.

## Running Tests & Visual Inspection
- **Test execution**: `npm test` runs [test/drawings.test.js](file:///test/drawings.test.js) via Node's native test runner (`node --test`).
- **Visual Inspection via PNG**: To inspect floor plans as images, tests rasterize SVG to PNG into `test/output/` using `@resvg/resvg-js`.
  Use `read_file` on `test/output/pudorys-1np.png`, `pudorys-2np.png`, or `pudorys-both.png` to visually examine layouts with multimodal vision.

## Architectural & CAD Standards
1. **Furniture Positioning**:
   - Check furniture boundaries against inner wall coordinates (`innerMinX`, `innerMaxX`, `innerMinZ`, `innerMaxZ`). Furniture must never protrude through or into exterior walls.
   - Maintain ergonomic circulation distances (minimum 90 cm between kitchen island and dining table).
   - Place sanitary fixtures (toilets, vanities) flush with installation walls.
2. **Room Stamp Placement**:
   - Place room tags in open circulation areas, never overlapping furniture or fixtures.
3. **CAD Drawing Rendering**:
   - In [src/builders/FloorPlanSvgGenerator.js](file:///src/builders/FloorPlanSvgGenerator.js), render room badges *after* dimension lines so badges mask underlying lines.
   - Maintain `paint-order: stroke fill; stroke: #ffffff;` white halos on dimension and opening text.
   - Keep title block (razítko) text wrapped to avoid overlapping the scale (MĚŘÍTKO) column.
