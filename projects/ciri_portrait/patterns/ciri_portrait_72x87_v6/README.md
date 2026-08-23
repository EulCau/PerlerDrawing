# Ciri portrait fuse-bead pattern v6

- Canvas size: 87 x 87 cells.
- Occupied bounding box: 72 x 87 cells.
- Board layout: 3 x 3 boards, each 29 x 29 cells.
- Occupied cells: 3816 beads.
- Palette: 25 adaptive RGB reference colors. These are not codes for a specific bead brand.
- Physical size with standard 5 mm beads: approximately 43.5 x 43.5 cm.

## V6 correction

- Removed the 21-cell left blade protrusion at rows 15-35 and column 16.
- The straight blade now occupies columns 17-21 consistently.
- The widening below row 38 belongs to the intended forked guard and remains unchanged.
- Retained the V5 image-generated master, vertical sword alignment, removed lower-left hilt, 0.50 foreground threshold, and one-cell dark inner outline.

## Files

- `ciri_portrait_72x87_v6_preview.png`: corrected pixel preview with a transparent background.
- `ciri_portrait_72x87_v6_chart.png`: complete chart, coordinates, board boundaries, legend, and quantities.
- `tiles/ciri_portrait_72x87_v6_board_rN_cN.png`: nine printable 29 x 29 board sections.
- `ciri_portrait_72x87_v6.csv`: row-by-row placement data. Empty cells mean no bead.
- `ciri_portrait_72x87_v6_inventory.csv`: color reference and required bead count.
- `ciri_portrait_72x87_v6_metadata.json`: generation settings and exact trim coordinates.
- `ciri_portrait_72x87_v6_imagegen_prompt.txt`: exact prompt used for the V5 corrected master.
