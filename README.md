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

After optimizing, **Move parts** is enabled automatically above the sheet diagram. Drag a piece within its current sheet, or select it in the Part menu and enter X/Y in centimeters. Arrow keys move a focused piece by 1 mm; Shift + arrow moves by 1 cm. Dragging snaps near sheet edges and neighboring parts. Invalid moves are rejected if they cross sheet boundaries, overlap pieces, violate kerf clearance or violate saw-kerf clearance. Manual layouts may use non-guillotine arrangements.

Undo move keeps up to 40 moves in the current session. Manual layouts are saved with the project and restored after a reload; saved project JSON includes them. Offcuts, printed reports and cutting-list CSV use the edited positions. Re-optimizing or changing inputs replaces manual positions with a new automatic plan. On a manual drop, the piece is moved into the earliest preceding board with a valid space when possible. It keeps its orientation unless rotation is allowed for that part. An emptied source board is removed and panel statistics are recalculated. Use the inline Undo transfer button to restore the previous boards. Manual rotation controls are not included.

## Offline use on iPhone

Open the private site in Safari while online and signed in. Wait for **Offline ready on this device** at the bottom. Use Share → Add to Home Screen → Open as Web App → Add, then open the new Home Screen app online once and wait for Offline ready there too. That installed app can then reopen offline, optimize jobs and move parts. Jobs and cached files stay in that browser/app on that device. Clearing website data or device storage eviction can remove them; reopen online to prepare again. The hosted site remains owner-private.

When an update is available, use **Update app** in the footer while online. Before publishing source changes, run `node prepare-offline.cjs` to update the offline shell revision. The service worker caches only listed static app files and never account pages or API responses. All fonts use local system fallbacks so the app does not require external font downloads.

## Printing from an installed iPhone app

Print / PDF opens report actions. Use Share PDF, then Print or Save to Files from the iPhone share sheet. Save PDF is the fallback when file sharing is unavailable. Browser print remains available outside the installed iOS app. PDFs are generated locally using the bundled jsPDF 4.2.1 (MIT; license in dist/vendor/) and remain available offline after the app update is installed.

Manual dragging snaps near neighboring part edges and sheet boundaries. The attraction radius is 12 screen pixels for mouse/stylus and 18 for touch, independent of the diagram scale. Adjacent pieces retain the configured blade kerf. Nearby valid positions are preferred over overlapping alignment targets, and the final location is checked for sheet bounds, physical overlaps and blade clearance. Feedback under the sheet explains snaps and rejected moves.

## Optimization priority

The optimizer first maximizes requested parts placed. For layouts placing the same parts, it minimizes panel count, then consumed stock area for equal panel counts. It compares part orders, stock sizes, split policies and permitted orientations, including short-side and long-side fit strategies on jobs up to 80 pieces. Kerf, per-part rotation and guillotine cutting constraints still apply. The result is the best searched layout; it is not a guarantee of global mathematical optimality.

## Reusable remnants

For layouts with equal placed parts, panel count, consumed stock area and earlier-board utilization, the optimizer favors large solid right/bottom offcuts by comparing squared offcut areas, then the largest remnant, fragment count and top-left compactness. Offcut rectangles remain actual cut leftovers; saw-kerf strips are never merged into reusable material. These preferences do not override panel efficiency or make every job leave only two rectangles.

Manual free placement no longer requires a full straight guillotine cut. Non-guillotine layouts remain saved and printable, with a Manual placement note in the PDF. Their free rectangles are conservative estimates that exclude blade-clearance margins; plan the cutting sequence for these arrangements. Automatic optimization still produces guillotine layouts.

When panel count and consumed stock area tie, layouts are ranked by material utilization on Board 1, then Board 2 and subsequent boards. This takes priority over offcut shape; reusable offcuts remain the tie-breaker for equally filled boards. Board usage measures occupied area, rather than the number of pieces.

With rotation enabled, automatic optimization also searches maximal-rectangle free nesting, including edge-contact placements for smaller jobs. It may use non-guillotine arrangements and interior free space to reduce panels and fill earlier boards. The guillotine result remains a baseline candidate. Rotation off preserves the existing guillotine behavior. Kerf, stock quantities, orientation locks and physical overlap checks still apply. The PDF identifies unrestricted candidates as Free layout.


On every board, automatic packing starts with a remaining repeated-piece batch (batch orders are searched for efficient panel use), continues that type while it fits, then fills gaps with the next suitable batch. A batch may span boards; the rule restarts on each new board. Matching uses original dimensions, rotation permission, material and edge treatment, preserving labels and IDs. This favors repeatable cutting batches while still exhausting earlier boards and searching stock sizes and placements to minimize panel count. Rotation-enabled layouts still permit unrestricted nesting; grouping does not guarantee stack-cuttable machining sequences.


Large-first update: every new board tries the largest-area piece type first, then smaller types, retaining identical-piece batches. Manual moves also trigger forward consolidation: later-board pieces are tried largest first in actual geometric gaps on earlier boards, respecting boundaries, kerf and rotation permissions. Existing parts keep their coordinates; the piece just dragged is excluded from automatic refill. Empty boards are removed, statistics/offcuts/PDF/storage reflect the result, and the inline Undo move restores the manual edit plus all resulting transfers in one step.


Transfer approval update: after each valid manual move, show one compatible-piece notification with dimensions and source/destination sheets. Move piece approves exactly one transfer; Not now dismisses it without transferring. Additional matches require separate approval. New moves refresh the suggestion; input edits, Optimize and Undo clear it. Approval checks the current layout and settings against the suggestion to prevent stale transfers. Saved layouts and PDF output include only approved moves.
