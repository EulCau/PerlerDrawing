# Couple portrait fuse-bead pattern v1

- Canvas size: 87 x 87 cells.
- Occupied bounding box: 87 x 81 cells.
- Board layout: 3 x 3 boards, each 29 x 29 cells.
- Occupied cells: 5641 beads.
- Palette: 24 adaptive RGB reference colors. These are not codes for a specific bead brand.
- Physical size with standard 5 mm beads: approximately 43.5 x 43.5 cm.

## Image preparation

- Removed the complete night forest background.
- Converted both people to a simplified cel-shaded cartoon style before grid reduction.
- Removed the woman's single thin forehead strand and isolated flyaway hairs.
- Lowered the woman's gathered blouse neckline modestly while retaining full chest coverage.
- Removed bright eyeglass reflections and preserved readable eyes.
- Reduced hair, skin, glasses, and clothing to large regions with two or three tonal steps.
- Used a 0.50 foreground threshold and a one-cell dark inner outline.

## Files

- `couple_portrait_87x81_v1_preview.png`: final pixel preview with a transparent background.
- `couple_portrait_87x81_v1_chart.png`: complete chart, coordinates, board boundaries, legend, and quantities.
- `tiles/couple_portrait_87x81_v1_board_rN_cN.png`: nine printable 29 x 29 board sections.
- `couple_portrait_87x81_v1.csv`: row-by-row placement data. Empty cells mean no bead.
- `couple_portrait_87x81_v1_inventory.csv`: color reference and required bead count.
- `couple_portrait_87x81_v1_metadata.json`: generation settings.
- `couple_portrait_87x81_v1_imagegen_prompt.txt`: exact built-in image editor prompt.
