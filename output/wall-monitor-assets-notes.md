# Physical wall monitor assets

Generated with the built-in image generation tool. The user reference guides the physical wall monitor style. Live portrait, laser head, progress and score use the same production record; they are not baked into these assets.

Runtime calibration: the 1629 × 965 header is fitted to 1080 × 760, with its live opening at `(125.3,181.9,868,444.2)`. A 1024 × 512 offscreen canvas supplies the live image. The fixture photograph uses source seat center `(830,455)` mapped to `(512,261)` in that canvas, at horizontal scale 1 and vertical scale `179/194` to match the support ellipse. The workpiece top is `(512,245)` with ellipse radii `(372,179)` and sidewall thickness 16; its base touches that floor. The finished avatar therefore spans about 631 output pixels. The same inverse fixture transform projects the physical spindle axis and scanned points. The fixed machine camera uses scale 1.08 and offset `(31.86,340)`; the header fades from y675 to y700, before the machine starts at y709.36.

## Header

Final asset: `assets/wall-monitor-header-v1.png`

Mode: image edit using the user reference and existing workshop lighting as references.

Prompt:

Use case: precise-object-edit / product-mockup. Asset type: a photorealistic upper-wall background panel for a 1080x1920 livestream scene, NOT a screenshot or app UI.
References: first attached image is the desired REAL industrial wall-monitor style; second image shows the existing workshop lighting and metal surfaces to match.
Create ONLY the UPPER WALL section of this workshop, in landscape approximately1080x640 framing. A large black industrial LCD is physically mounted flush on the dark workshop wall, with brushed charcoal steel bezel, real thin glass, small recessed screws, a dark ventilation grille above, subtle warm amber downlights on the top trim, very restrained cool teal fill from the room. The monitor is front-facing and its active display opening must be a straight horizontal RECTANGLE with vertical sides (no extreme trapezoid or tilted screen). It spans about86 percent of the image width, with screen opening roughly x110..1030,y130..570 if imagined in1080x640 pixels. Keep the entire bezel inside the image. The screen itself is completely BLANK uniform almost-black glass, no content; later code will insert live video there. Leave a little real dark wall around the screen. Lower edge should be quiet dark wall, without machine parts, for blending to the workcell underneath. Photographic texture, warm realistic reflected light, no stylized sci-fi HUD.
No machine, no engraving head, no coins, no portraits, no phone status bar, no streaming app chrome, no logos, no time, no viewer counts, no numbers, no text, no neon outlines, no UI, no watermark. One landscape photo of the physical monitor wall only.

## Fixed fixture camera

Final asset: `assets/monitor-fixture-camera-v1.png`

Mode: image edit using the existing empty vacuum fixture camera as reference.

Prompt:

Use case: precise-object-edit / additional camera view. Asset type: clean camera background texture for the physical LCD above a laser engraving machine.
Reference/edit target: the supplied EMPTY stainless vacuum nest macro photograph. Preserve its identity and photographic material: low circular brushed silver vacuum fixture, exactly three recessed socket screws around its flange, flat dark vacuum seat, brushed metal tooling plate, soft amber light from left and restrained cool reflection at right.
Make one LANDSCAPE16:9 macro view (intended1024x576), a fixed camera looking downward about40 degrees above the horizontal tooling plate, enough that the circular token seat projects as an ellipse whose height is about55 percent of its width. Composition: the EMPTY dark token seat should be centered at horizontal50 percent and vertical52 percent, occupy about64 percent of the frame WIDTH; the silver flange surrounds it and may be partly cropped at left/right. Seat is shallow flat and supported, not a deep bowl. The top quarter shows uncluttered real tooling plate and a little out-of-focus hardware, so a separately composited moving laser head can enter from the top. The bottom10 percent is plain tooling plate for a small status strip.
The fixture is EMPTY, with no gold token or avatar. Do not include spindle, laser, cable over the seat, gripper, hands, portraits, smoke, text, score, labels, screen frame or UI. All moving parts and the exact same actual workpiece will be composited later by code. Sharp natural machined steel, three screws, real contact shadows, no stylized render.

