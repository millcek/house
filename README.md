# 🏡 Vojáčkovi Troubelice — 3D & IFC Web Viewer

A fast, lightweight web viewer for Industry Foundation Classes (`.ifc`) building models, integrated with Three.js and your **40 × 27 m** plot.

## ✨ Features

- **Direct In-Browser IFC Parsing**: Powered by WebAssembly (`web-ifc`), zero server-side conversion needed.
- **Site Context (40 × 27 m)**: Renders the terrain, boundaries, 1m grid, access roads, and realistic sunlight/shadows.
- **Drag & Drop Revisions**: Drop any `.ifc` file directly onto the window to render it instantly.
- **House Placement Adjustments**: Sliders to adjust Position (X, Z) and Orientation (Rotation Y) directly on your parcel.
- **BIM Element Inspector**: Click any wall, slab, window, or door in the IFC model to highlight it and view its IFC type, GlobalId, dimensions, and property sets.
- **Version Management**: Easy workflow to compare iterations as you refine your house design (Vojáčkovi Troubelice).

---

## 🚀 Getting Started

### 1. Install & Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Loading Your IFC Model

You have three convenient ways to load models:

1. **Drag and Drop**: Simply drag any `.ifc` file from your desktop and drop it anywhere into the browser window.
2. **File Picker**: Click the **"📁 Load IFC File"** button in the top bar.
3. **Preloaded Versions**: Place your versioned IFC files into `public/models/` (e.g. `public/models/house_v1.ifc`, `public/models/house_v2.ifc`). You can then add `<option value="/models/house_v1.ifc">Version 1</option>` to the `<select id="version-select">` dropdown in `index.html`.

---

## 🎮 Controls

| Action | Control |
|---|---|
| **Rotate Scene (Orbit)** | Left Mouse Button + Drag |
| **Pan Scene** | Right Mouse Button + Drag |
| **Zoom** | Scroll Wheel |
| **Inspect BIM Element** | Left Click on any part of the IFC house |
| **Focus / Center Camera** | Click **🎯 Fit View** |
| **Toggle Plot / Grid** | Top toolbar buttons |

---

## 🏗️ Recommended IFC Authoring Workflow

When exporting your IFC files from your CAD/BIM software (such as **Archicad**, **Revit**, **FreeCAD**, or **Blender with Bonsai/BlenderBIM**):
1. **Schema:** IFC 2x3 or IFC 4 (Coordination View).
2. **Origin:** If possible, export with the ground floor finished level at $Z = 0$ (or elevation $0.00$). The viewer will automatically align the lowest point with the terrain surface.
