# Ciri portrait fuse-bead pattern v1

- Canvas size: 87 x 87 cells.
- Occupied bounding box: 74 x 87 cells.
- Board layout: 3 x 3 boards, each 29 x 29 cells.
- Occupied cells: 4006 beads.
- Palette: 25 adaptive RGB reference colors. These are not codes for a specific bead brand.
- Physical size with standard 5 mm beads: approximately 43.5 x 43.5 cm.

## Files

- `ciri_portrait_74x87_v1_preview.png`: final pixel preview with a transparent background.
- `ciri_portrait_74x87_v1_chart.png`: complete chart, coordinates, board boundaries, legend, and quantities.
- `tiles/ciri_portrait_74x87_v1_board_rN_cN.png`: nine printable 29 x 29 board sections.
- `ciri_portrait_74x87_v1.csv`: row-by-row placement data. Empty cells mean no bead.
- `ciri_portrait_74x87_v1_inventory.csv`: color reference and required bead count.
- `ciri_portrait_74x87_v1_metadata.json`: generation settings and semantic accent cells.
- `ciri_portrait_74x87_v1_imagegen_prompt.txt`: exact prompt used to create the simplified master illustration.

## Assembly order

1. Use the thick blue boundaries in the complete chart to identify the nine boards.
2. Build from `ciri_portrait_74x87_v1_board_r1_c1` through `ciri_portrait_74x87_v1_board_r3_c3`. The row and column numbers are global coordinates, not local tile coordinates.
3. Match each two-digit bead label to `P01` through `P25` in the legend or inventory CSV.
4. Buy at least 5 percent extra of each color to allow for color matching and damaged beads.

The adaptive RGB values preserve this illustration well, but real bead colors vary by brand and batch. Remap the palette before assembly if an exact MARD, Perler, or Hama color chart is required.
