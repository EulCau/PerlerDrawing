# Ciri portrait fuse-bead pattern v2

- Canvas size: 87 x 87 cells.
- Occupied bounding box: 74 x 86 cells.
- Board layout: 3 x 3 boards, each 29 x 29 cells.
- Occupied cells: 3881 beads.
- Palette: 25 adaptive RGB reference colors. These are not codes for a specific bead brand.
- Physical size with standard 5 mm beads: approximately 43.5 x 43.5 cm.

## V2 changes

- Replaced the original forked and canvas-touching weapon silhouette with a grid-aligned vertical sword.
- Added one empty row above the sword tip.
- Used a four-cell-wide vertical blade, a compact guard, and a three-cell-wide handle.
- Increased the foreground coverage threshold from 0.28 to 0.50.
- Converted every four-connected outer boundary cell to a solid dark charcoal inner outline.
- Preserved one olive-green bead for each iris.

The built-in image editor was retried three times for this revision, but every generated output was rejected by its output safety filter. Therefore, the V2 sword and boundary are deterministic grid-level edits applied to the existing simplified master.

## Files

- `ciri_portrait_74x86_v2_preview.png`: revised pixel preview with a transparent background.
- `ciri_portrait_74x86_v2_chart.png`: complete chart, coordinates, board boundaries, legend, and quantities.
- `tiles/ciri_portrait_74x86_v2_board_rN_cN.png`: nine printable 29 x 29 board sections.
- `ciri_portrait_74x86_v2.csv`: row-by-row placement data. Empty cells mean no bead.
- `ciri_portrait_74x86_v2_inventory.csv`: color reference and required bead count.
- `ciri_portrait_74x86_v2_metadata.json`: generation settings and exact structural edit coordinates.
