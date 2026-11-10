# Completed portrait inspection camera

Mode: built-in imagegen edit/additional camera view.
Reference: assets/approved-cell-vacuum-v3.png.
Intended project output: assets/portrait-inspection-camera-v1.png.

Full prompt:

Use case: precise-object-edit / additional camera view.
Reference/edit input: the supplied photograph of a black automated laser engraving workcell with a small silver vacuum nest on its brushed metal tooling plate. Create a SECOND CAMERA ANGLE of this SAME small vacuum fixture, for the completed workpiece showcase in a realistic livestream. This is NOT a new machine and not a graphic mockup.

Output: one photoreal portrait9:16 camera frame, intended as a1080x1920 background plate. Extremely close macro industrial photograph, lens looking almost vertically down, approximately75 degrees above the horizontal tooling plate. The round seating area must therefore appear nearly circular, ellipse height approximately95 percent of width, not the strongly flattened ellipse in the reference. Preserve the vacuum nest's identity: silver machined low circular body and flange, exactly three small recessed screw heads, dark flat shallow locating recess with a fine seal and tiny suction holes, brass vacuum fitting and black pneumatic tube connected at the upper/right side, same clean machined aluminum mounting plate, warm amber reflections and subtle teal workshop fill. True metal milling details, natural contact shadows, photographic material finish.

MOST IMPORTANT COMPOSITION: the EMPTY dark circular token seating recess is the hero and fills approximately70 to72 percent of the frame WIDTH, centered at horizontal50 percent and vertical42 percent of the frame. Its nearly circular visible seating mouth should be huge: a thin round token placed there will occupy roughly70 percent of the livestream screen width. The surrounding silver outer flange is approximately1.7 times wider than the recess, so it MUST be partly cropped by both left and right edges of this very tight close-up. Do not zoom out to fit the entire fixture. Show enough of the attached brass fitting/black hose above-right to identify the same physical vacuum device. The lower third of the frame shows uncluttered real brushed metal tooling plate and soft natural shadows, to later receive a broadcast score overlay.

The nest is EMPTY. Do NOT render a medal, coin, portrait, avatar, person, gripper, hand, spindle over the seat, laser beam, smoke, decorative stand, monitor, text, score, UI, watermark, arrow, badge or label. It must be a clean EMPTY photoreal camera plate onto which the actual user's portrait token is composited later. No extra circular parts below the main recess. Same material scale and believable near-overhead perspective. Seat floor is shallow, flat and supported, with tiny vacuum ports; not a deep bowl. The fixture remains bolted to the same machine's tooling plate. This second view is a real camera close-up after the laser is off and parked.

## 接入与校准 · 2026-11-10

- 实际项目资产：`assets/portrait-inspection-camera-v1.png`，941 × 1672，由内置 imagegen 生成；上面的完整提示词保持原样。
- 直播画布固定为 1080 × 1920。加工相机沿用工作站照片的透视，以 7.85× 近景显示定位座中的同一圆片；头像横向直径约 649px，占输出宽度 60%。
- 独立成品相机观察同一真空定位座和同一库存记录，不能新增或复制一件成品。只在激光关闭、雕刻头归位且圆片仍受定位座支撑时显示。
- 新底图座面中心约为原图 `(466,701)`，半径约 `(310,288)`。相机比例为 `378/310`，将该座面中心映射至屏幕 `(540,820)`。圆片上表面中心设为 `(540,812)`，与座面保持 8px 厚度接触关系；横向半径为 378px，纵向半径约 351px。头像直径 756px，占屏幕宽度 70%，仍保留真实近俯视的轻微椭圆透视。
- 成品展示的逻辑时间段为 8.00–12.50 秒，默认 1.8× 播放对应约 2.5 秒。整个机械周期仍为 18 秒，默认完整周期约 10 秒 / 件；之后恢复全景，连续显示机械臂搬运、皮带步进、滑道和接料盘。
- `score-overlay.js` 在屏幕底部绘制轻量暖金与浅白文字，避开头像区域。展示 0–100「作品效果分」、从 0 计到结果的动画、一句短评及清晰度 / 构图 / 色彩三个指标。`portrait-score.js` 只分析圆形内区像素，固定图像得到固定分数，并降低透明、空白、平色及随机噪点的得分；这是作品图像效果评价，不是颜值或人格评价。
- 当前输出：`PREVIEW-portrait-processing-1080x1920.png`、`PREVIEW-portrait-rating-1080x1920.png`、`PREVIEW-portrait-rating-1080x1920.webm`。此前近景预览仅用于历史对照。

## 高清头像与加工相机补充

成品相机中的头像来源已切换为 `assets/portrait-artwork-atlas-v1.png`。图集由内置 imagegen 以参考图四张成品头像重新绘制，实际尺寸 1254 × 1254，2 × 2 排列、每张 627 × 627；`makeAvatar` 默认输出 768 × 768 圆形画布，替代原先约 130px 成品裁图。生成提示词见 [portrait-artwork-notes.md](portrait-artwork-notes.md)。成品、加工和输送带仍使用同一张作品与库存记录，756px / 70% 的展示校准不变。

加工镜头另接入 `assets/machining-detail-plate-v1.png` 高清空底板，在 `camera.detail` 0.8→1.0 时淡入；同一个动态雕刻头、头像与逐行激光轨迹在其上实时合成。它与本成品相机底图承担不同机位，均不是预录视频。加工头像继续保持约 649px / 60% 占宽。生成提示词与座面坐标映射见 [machining-detail-notes.md](machining-detail-notes.md)。

