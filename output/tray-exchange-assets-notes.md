# 可见换盘素材

方式：内置 imagegen 编辑与透明背景提取，原图 `assets/approved-cell-vacuum-v3.png`。

- `assets/workcell-exchange-base-v1.png`：去掉固定收料盘及其接触阴影的整机空底图，滑槽和机器保留。
- `assets/receiving-tray-layer-v1.png`：保持原视角和光照的独立透明空托盘层，运动时与盘内成品一起平移。
- 两张最终素材均已复制到项目 assets，原始生成输出保留。

## 最终提示词组

Use case: precise-object-edit. Asset type: clean background plate for an animated photorealistic laser engraving workcell.
Edit target: approved-cell-vacuum-v3.png, the supplied portrait photo.
Change ONLY the stainless receiving tray on the workbench at the lower-right (approximately x550..887,y1210..1380 in the 941x1672 source) and its small contact shadow: REMOVE this tray entirely and reconstruct the continuous dark brushed workbench surface behind it. Keep the fixed angled stainless chute above the tray EXACTLY unchanged, including the chute's bottom outlet around x787,y1220, and keep all machine structure, belt, vacuum fixture, lighting, reflections, camera, geometry and all other pixels unchanged. Do not add a tray, bin, coins, rails, labels or hands. The tabletop in the erased region must be empty photorealistic metal with consistent warm left reflections and subtle cool right fill. Keep EXACT source composition and 941x1672 portrait framing. No crop, no new parts, no text, no UI, no watermark. This clean plate allows a separate receiving tray layer to move out of the frame; no ghost rim or tray shadow should remain.

---

Use case: background-extraction. Asset type: transparent foreground layer of the EMPTY stainless receiving tray in the supplied photo.
Edit target: approved-cell-vacuum-v3.png. Extract ONLY the low rectangular stainless steel receiving tray resting at lower-right, approximately x550..887,y1210..1369 in the original941x1672 photo. Preserve the EXACT tray perspective, brushed steel, warm reflections on rear inner wall and bright rim, cool right reflection, rounded corners, shallow thickness and three-dimensional front wall. Remove the fixed diagonal chute and reconstruct any small part of the rear rim that was hidden by it. The tray is completely EMPTY. Exclude all workbench, machine, chute and shadows outside the tray. Produce genuine transparent alpha around the isolated tray and in all excluded space; no black, white or checkerboard backdrop. Best as a tightly cropped transparent tray cutout with small padding; do not rotate, change camera angle or flatten the tray. Photographic fidelity, not illustration or 3D graphic. No coins, no hands, no text, no UI.

## 实际尺寸与运行时校准

两张素材均由**内置 imagegen**生成并复制到项目，未使用 CLI/API 回退。提示词中的 941 × 1672 为生成时的目标构图，实际输出和接入如下：

| 项目文件 | 实际尺寸 | 接入方式 |
| --- | --- | --- |
| `assets/workcell-exchange-base-v1.png` | 941 × 1671 | 当前整机空底图；绘制到统一 941 × 1672 照片平面，替换历史 `assets/approved-cell-vacuum-v3.png` 全景底图。 |
| `assets/receiving-tray-layer-v1.png` | 1730 × 909，RGBA | 源矩形 `(80,110,1590,715)` 映射到照片平面目标矩形 `(548,1211,342,158)`；与盘内作品共用平移。 |

收料盘下方的导轨与接触阴影由 Canvas 生成。盘体、盘内成品及随盘移动的阴影使用同一偏移，滑槽与导轨保持固定。换盘水平总行程为 430 照片像素，垂直偏移 `offsetY = -0.018 × offsetX`；盘左缘退出后位于约 x980，超过全景右侧可见边界约 x909，因此交接库存时整盘及其成品均已不可见。

## 换盘时序与交接

以下均为实际秒，不受加工速度倍率影响：

| 阶段 | 时间 | 盘体与库存 |
| --- | --- | --- |
| 满盘退出 | 0–1.5 秒 | 装载的盘体与作品一起向右运动，使用五次平滑曲线，起停速度为零。 |
| 屏外交接 | 1.5–2.05 秒 | 盘体保持完全屏外；1.5 秒起可一次性移交盘内库存。 |
| 空盘返回 | 2.05–3.55 秒 | 空盘沿同一条导轨返回，不显示已移交的作品。 |
| 归位等待 | 3.55–3.8 秒 | 空盘已归位，等待归位阶段结束后才允许下一件进料。 |

盘容量仍为 24 件，满盘自动换盘；手动「更换收料盘」如遇当前加工或落料，等待完整一轮结束再执行。重复请求不会重启动作，暂停冻结运动，重置取消换盘。同浏览器标签通过 BroadcastChannel 同步换盘请求。

时序模型及其单元测试分别在 `tray-exchange.js`、`tray-exchange.test.mjs`；真实 Canvas 的生产、物料交接和暂停检查在 `tests/motion-preview.html`。本轮预览为 `PREVIEW-realism-production-1080x1920.webm`，以及加工、成品、满盘三个 `PREVIEW-realism-*-1080x1920.png` 文件。原始提示词保留在上文，后续校准不替换生成记录。
