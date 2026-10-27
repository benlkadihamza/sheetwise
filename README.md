# Sheetwise

A browser-based sheet cutting planner. Enter stock dimensions and part quantities, calculate cutting layouts, measure remnants, and print a report with one sheet and its parts table per page.

## Run locally

Install Node.js 18 or newer, then run:

```sh
npm start
```

Open http://127.0.0.1:4174/. No dependencies need to be installed. Set PORT to use a different local port.

## Features

- Dimensions in centimeters; saw kerf in millimeters (4 mm default).
- Sheet count calculated from requested parts.
- Optional 90-degree rotation, individual-piece packing and side remnants.
- Per-edge banding selections and length totals.
- Dimensions-only hover tooltips and remnant dimension lines.
- Unplaced parts list and printable per-sheet reports.
- Projects saved in browser local storage.

## Checks

```sh
npm test
```

The optimizer compares heuristic arrangements; it does not guarantee a global mathematical optimum. Dimensions entered for parts are cutting dimensions; banding totals do not include trimming allowance.

## Files

- `dist/`: static web application; can be served by a static hosting service.
- `server.cjs`: dependency-free local preview server.
- `check.cjs`: geometry and optimizer checks.

## Workshop workflow

Name the job, enter stock dimensions and parts in centimeters, set blade kerf in millimeters, then optimize. Stock counts are calculated automatically; stock rows are alternative sizes of the same material. Run separate jobs for different materials or thicknesses.

Save project file / Open project transfers the complete job as JSON. Import CSV replaces the parts list using `label,width_cm,height_cm,quantity`; download the template for an example. Cutting-list CSV exports placed pieces and their coordinates. Print / PDF includes all sheets and any unplaced parts. The on-screen checklist persists while switching sheets and resets on optimization. The project itself auto-saves in this browser; file backups protect against cleared browser storage.

## Manual layout adjustments

After optimizing, **Move parts** is enabled automatically above the sheet diagram. Drag a piece within its current sheet, or select it in the Part menu and enter X/Y in centimeters. Arrow keys move a focused piece by 1 mm; Shift + arrow moves by 1 cm. Dragging snaps near sheet edges and neighboring parts. Invalid moves are rejected if they cross sheet boundaries, overlap pieces, violate kerf clearance or prevent guillotine cuts.

Undo move keeps up to 40 moves in the current session. Manual layouts are saved with the project and restored after a reload; saved project JSON includes them. Offcuts, printed reports and cutting-list CSV use the edited positions. Re-optimizing or changing inputs replaces manual positions with a new automatic plan. Moving between sheets and manual rotation are not included.

## Offline use on iPhone

Open the private site in Safari while online and signed in. Wait for **Offline ready on this device** at the bottom. Use Share → Add to Home Screen → Open as Web App → Add, then open the new Home Screen app online once and wait for Offline ready there too. That installed app can then reopen offline, optimize jobs and move parts. Jobs and cached files stay in that browser/app on that device. Clearing website data or device storage eviction can remove them; reopen online to prepare again. The hosted site remains owner-private.

When an update is available, use **Update app** in the footer while online. Before publishing source changes, run `node prepare-offline.cjs` to update the offline shell revision. The service worker caches only listed static app files and never account pages or API responses. All fonts use local system fallbacks so the app does not require external font downloads.
