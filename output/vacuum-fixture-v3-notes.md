# Vacuum locating fixture fit refinement

Mode: built-in imagegen edit.
Edit target: assets/approved-cell-vacuum-v2.png.

The edit target was the first generated draft; that intermediate is now retained at output/vacuum-fixture-v2.png.
Intended project output: assets/approved-cell-vacuum-v3.png.

First edit and full source prompt: [vacuum-fixture-v2-notes.md](vacuum-fixture-v2-notes.md).

Integration calibration: output image is 941×1671 and rendered into the established 941×1672 photo plane. The measured dark pocket floor spans approximately x492..567 and y879..909, center about (530,894.5). The token top-face center is (530,891); its 3.5px sidewall meets the pocket support floor. Coin radius remains 36×17. Laser raster, gripper fixture point and portrait camera were recalibrated to this center. The previous procedural jaw overlays were removed; fixture holding is vacuum from underneath.

Static entry points and the fixture's scene/scan/camera imports carry the vacuum3 cache version, so a previously opened live page loads the new geometry together with the new background.

Full prompt:

Use case: precise-object-edit. Edit the supplied empty machine photograph with the small vacuum fixture. Keep EVERYTHING outside the small round vacuum puck pixel-aligned and unchanged, same 941x1672 full portrait camera. The new fixture is mechanically good; this is only a token-fit correction. The dark seating recess is currently too wide. Reduce the dark circular token seat's diameter by about twenty percent, keeping it perfectly circular in the same perspective. Target empty seat ellipse is 74 pixels wide and35 pixels tall in this941x1672 image, with center at535,892. The whole compact puck should be centered on that point too, approximately10pixels RIGHT and4pixels UP from its current center; retain enough broad metal flange around the smaller seat for the three recessed mounting screws. Top supporting face must be flat, with only a SHALLOW locating rebate, a fine thin black O-ring inside the seat perimeter, tiny suction holes, and no deep cup or tall walls. Gold blanks will be animated separately; do NOT render a blank or any gold token. Keep the puck's photoreal brushed aluminum body, brass side vacuum fitting and the black hose physically connected after the small adjustment. Keep the same tooling plate, bed, shoulder pedestal, frame, all other mechanisms, lighting and framing exactly. No clamps, no fingers over the recess, no labels, no UI, no text. Correctly supported shallow vacuum nest for a thin flat round disk.
