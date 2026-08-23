# Ciri portrait fuse-bead pattern v5

- Canvas size: 87 x 87 cells.
- Occupied bounding box: 72 x 87 cells.
- Board layout: 3 x 3 boards, each 29 x 29 cells.
- Occupied cells: 3837 beads.
- Palette: 25 adaptive RGB reference colors. These are not codes for a specific bead brand.
- Physical size with standard 5 mm beads: approximately 43.5 x 43.5 cm.

## V5 source and changes

- Rebuilt from the user-supplied `ChatGPT Image 2026年8月22日 11_25_24.png`.
- Used the built-in image editor to align the blade, guard, handle, and gripping fist on one vertical axis.
- Removed the detached silver ring-shaped hilt from the lower-left area during the image edit.
- Preserved the generated sword proportions and forked guard. No deterministic rectangular sword was overlaid.
- Measured sword center drift over the upper 480 source pixels: approximately 2 pixels on a 1254-pixel canvas.
- Used a 0.50 foreground threshold and a one-cell dark inner outline.
- Preserved one olive-green bead for each iris.

## Files

- `ciri_portrait_72x87_v5_preview.png`: revised pixel preview with a transparent background.
- `ciri_portrait_72x87_v5_chart.png`: complete chart, coordinates, board boundaries, legend, and quantities.
- `tiles/ciri_portrait_72x87_v5_board_rN_cN.png`: nine printable 29 x 29 board sections.
- `ciri_portrait_72x87_v5.csv`: row-by-row placement data. Empty cells mean no bead.
- `ciri_portrait_72x87_v5_inventory.csv`: color reference and required bead count.
- `ciri_portrait_72x87_v5_metadata.json`: generation settings.
- `ciri_portrait_72x87_v5_imagegen_prompt.txt`: exact built-in image editor prompt.
