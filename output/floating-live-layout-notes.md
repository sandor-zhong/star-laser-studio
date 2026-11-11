# Floating live camera layout

The 1080 × 1920 output keeps one fixed machine camera. The former physical wall LCD is replaced by a Canvas floating live view, based on the user's 2026-11-11 reference. The application output stays suitable for a pure live browser source.

- Live window: `(135,205,810,395)`, rounded corners 28px, thin cyan edge and four optical corner marks.
- Feed: 1024 × 512, tilted token basis `(383,-32,24,185)`, face center `(440,265)`, sidewall thickness 16.
- The existing empty fixture photograph is mapped with the same affine basis to floor center `(440,281)`; all portrait masks use the same production raster as the main scene.
- The nozzle uses its actual world coordinate `(LASER_ORIGIN.x + pose.x, LASER_ORIGIN.nozzleY + pose.y - pose.lift)` projected through that same camera. Sparks, local glow and wisps render only when the sampled laser is active.
- The detail window's connector follows the actual lower spindle's right anchor and is visible only while the active piece remains on the fixture.
- HUD typography, grid and warm-gold nickname/progress/score capsule are Canvas drawing. The sidebar reports real scan progress, completed fine lanes out of 64, and the current phase.
- Upper background reuses the existing workshop photograph's empty upper portion with shallow focus. No new generated bitmap is needed for this layout.

Existing photo assets used: `assets/workcell-exchange-base-v1.png`, `assets/monitor-fixture-camera-v1.png`, `assets/spindle-layer.png`, and `assets/receiving-tray-layer-v1.png`. Previous asset generation prompts remain in their original records. The physical LCD header is retained as a historical asset but is not loaded by the live scene.
