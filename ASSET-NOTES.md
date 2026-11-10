# 写实场景资产记录

方式：内置 imagegen 图像编辑工具；不是 CLI/API 回退。

输入：用户提供的参考图片，项目副本为 `assets/workshop-reference.png`。

输出：`assets/workshop-blank.png`，941 × 1672。该资产由原始工具输出复制入项目。

完整提示词：

> Use case: precise-object-edit. This is a production background asset for an interactive photorealistic laser engraving simulator. Edit target: supplied image. Preserve EXACT composition, camera, every machine part, workshop, reflections, black frame, glass, spindle, conveyor, gold medal rims, all positions, portrait aspect ratio. Change ONLY the printed inner faces of all five medals (one under laser and four on the conveyor) to clean blank satin warm gold metal, with realistic subtle brushed reflections. Remove ONLY the cyan laser beam and glowing cyan laser spot under nozzle, leaving nozzle and all ambient teal workshop lights unchanged. No added objects, no UI, no text. Keep extremely photorealistic, same beautiful photographic quality. Critical: do not move or resize any medal, machine, or camera.


## V0.3 机械运动分层

内置 imagegen 编辑，输入均为 `assets/workshop-blank.png`；输出项目资产：

- `assets/workshop-motion-plate.png`：移除雕刻头及拖链的背景板，941 × 1672。
- `assets/spindle-layer.png`：透明雕刻头层，981 × 1602；在 Canvas 中按 0.32 倍绘制并对齐喷嘴锚点。

背景板完整提示词：

> Use case: precise-object-edit. Edit the provided photograph as a clean background plate for compositing a moving CNC spindle in a web animation. Preserve EXACT original 941x1672 portrait composition, all frame edges, perspective, machine body, glass, gold blank medals, work fixture, conveyor, photo quality, workshop and lights. Remove ONLY the central moving vertical spindle/toolhead assembly (located around x398..605 y406..828 in the provided image), including its motor, long Z carriage, front black block, spindle nozzle and its white tubing. Also remove the black articulated curved cable chain above/right of the head (around x503..779 y414..593). Reconstruct the realistic horizontal silver guide rails, lead screw, and dark machine interior that were occluded behind the removed toolhead and chain. The two horizontal rails MUST be uninterrupted across the newly exposed central region and match the existing rails left and right. Preserve the large blank gold medal and metal clamps underneath. Keep fixed side motors and gantry frame. Do not leave ANY ghost or duplicate of the spindle or cable chain. No new objects, no text, no UI. Pixels outside the removed components should match the source as closely as possible.

透明层完整提示词：

> Use case: background-extraction. Create a transparent-background foreground layer of the central moving CNC spindle/toolhead assembly from the provided reference image for an animation. Keep exact 941x1672 portrait canvas and original position and scale of the extracted component. Isolate ONLY the central moving vertical assembly located roughly x398..605 y406..828: the silver Z carriage and black vertical motor at top, front large black spindle block with silver edges, polished cylindrical spindle and nozzle, and small attached white tubing/purple-black cables that belong to this moving head. Include all head hardware and metallic texture with photographic fidelity. Exclude the large curved articulated black cable chain to the right and exclude ALL horizontal rails/lead screws behind the head. All workshop, machine frame, medals, background and rails must become truly transparent, including holes around cables and between the vertical supports. No halo, no drop shadow baked onto canvas, do not recenter or crop the head, do not change the component's shape, position, size, textures, perspective, or lighting. Exact transparent layer alignment with reference is critical.

生成器实际将透明主体放大并重新居中，代码使用喷嘴锚点与缩放补偿。背景、喷嘴贴图与激光落点都已在浏览器中核对。


## 真空定位座重制

方式：内置 imagegen 编辑。历史真空定位座底图与当前结构参照：[assets/approved-cell-vacuum-v3.png](assets/approved-cell-vacuum-v3.png)。当前整机已换用下文记录的可见换盘空底图。

生成与尺寸修订的完整提示词、源图和接入坐标见 [output/vacuum-fixture-v3-notes.md](output/vacuum-fixture-v3-notes.md)，其中链接到初稿提示词记录。底图中的巨型圆盘夹具已换成低矮真空定位座，旧的程序夹爪图层已移除。

## V0.4 完整生产流程底板

使用内置 imagegen 编辑 `assets/workshop-motion-plate.png`，项目输出为 `assets/workshop-empty-stage.png`。保留原图金属质感，将加工位和传送轨道清空，圆片、夹爪和出料机构在 Canvas 中独立合成。

完整提示词：

> Use case: precise-object-edit. Create an empty machine background plate for a photorealistic production animation. Preserve EXACT original941x1672 portrait camera framing, ALL machine structure, rails, original dark workshop lighting, frame, glass, reflections. Change ONLY these regions: 1. Remove the large gold medal at the central work fixture (center524869), including its gold rim, reveal a realistic empty dark steel circular recessed fixture with a smaller central flat graphite support pad, keep all surrounding silver fixture and clamps unchanged. 2. Remove all four gold medals from the foreground conveyor belt (centers3531139,4991120,6421100,7771084), reconstruct continuous realistic dark woven rubber belt surface with matching texture and lighting. 3. Remove the three loose gold blank discs along the left input feeder, reconstruct its dark mechanical feed track. Keep the machine empty with no workpieces anywhere. The spindle and chain were already removed, do not add any. Do not alter any other details or composition. No text, no UI, no new objects.

## 大头像与独立成品评分相机 · 2026-11-10

新增项目资产：`assets/portrait-inspection-camera-v1.png`，941 × 1672。使用**内置 imagegen**，以 `assets/approved-cell-vacuum-v3.png` 为参照，生成同一真空定位座的独立近俯视相机空底图；这是另一机位的照片合成素材。完整生成提示词及接触面校准记录见 [output/showcase-camera-notes.md](output/showcase-camera-notes.md)。近俯视相机、真空定位座和机械运动素材继续使用；整机全景底图在可见换盘阶段更新。

新底图不包含头像、激光、文字或评分，实际正在加工的同一头像圆片与作品效果分由 Canvas 合成。加工相机的头像直径约 **649px / 60% 画面宽**；加工完成且刀头归位后，独立成品相机将头像显示为 **756px / 70% 画面宽**，默认展示 **2.5 秒**，近俯视印面接近正圆。近景变化由镜头和素材坐标校准实现，不改变输送带与搬运时的物料尺寸。

成品下方的 **0–100「作品效果分」** 基于图像清晰度、构图、色彩，由同一图像像素稳定计算，附计分动画和一句短评；它不是颜值分，也不分析人物外貌或人格。默认完整周期为 **10 秒 / 件**，对应 18 秒机械时钟按 1.8× 播放。

本轮预览：`PREVIEW-portrait-processing-1080x1920.png`（加工）、`PREVIEW-portrait-rating-1080x1920.png`（成品评分）、`PREVIEW-portrait-rating-1080x1920.webm`（完整流程）。旧 PREVIEW 文件保留用于历史对照。

## 本轮高清资产索引与校准补充

以下资产均由**内置 imagegen**生成。实际文件尺寸以项目中的 PNG 为准，生成提示词中的目标尺寸不代表实际输出尺寸。

| 资产 | 实际尺寸与用途 | 完整提示词及记录 |
| --- | --- | --- |
| `assets/portrait-inspection-camera-v1.png` | 941 × 1672；同一定位座的近俯视成品相机空底图，头像合成后占宽 70%。 | [output/showcase-camera-notes.md](output/showcase-camera-notes.md) |
| `assets/portrait-artwork-atlas-v1.png` | 1254 × 1254；2 × 2 图集、每张 627 × 627，以参考图四张成品头像重绘，替代约 130px 的历史裁图。 | [output/portrait-artwork-notes.md](output/portrait-artwork-notes.md) |
| `assets/machining-detail-plate-v1.png` | 916 × 1717；去除头像、活动雕刻头与激光后的高清加工夹具空底板。 | [output/machining-detail-notes.md](output/machining-detail-notes.md) |
| `assets/workcell-exchange-base-v1.png` | 941 × 1671；当前整机全景空底图，移除固定收料盘及接触阴影，保留滑槽与机器。 | [output/tray-exchange-assets-notes.md](output/tray-exchange-assets-notes.md) |
| `assets/receiving-tray-layer-v1.png` | 1730 × 909，RGBA；独立空收料盘，运行时裁取源区域 `(80,110,1590,715)` 并映射到照片平面 `(548,1211,342,158)`。 | [output/tray-exchange-assets-notes.md](output/tray-exchange-assets-notes.md) |

`makeAvatar` 默认生成 768 × 768 圆形画布，清晰度来自 627px 原始插画，不再放大约 130px 的旧成品裁图。图集由参考重绘得到，是本地演示插画；加工、成品相机和输送带始终使用同一张当前作品。

加工底板在 `camera.detail` 从 0.8 进入 1.0 时平滑淡入。其座面参考中心约为源图 `(458,992)`；运行时采用 `1080/916` 的统一缩放，顶部偏移为 `1108 - 992 × scale`，再通过加工相机逆变换映射回工作站照片平面。当前动态雕刻头、激光、逐行显影和圆片叠加在这张空底板上，并非预录加工画面；头像仍约 649px / 60% 画面宽。

## 细纹显影、金属材料与可见换盘 · 2026-11-10

本轮新增的两个位图为表中 `assets/workcell-exchange-base-v1.png` 和 `assets/receiving-tray-layer-v1.png`，均使用内置 imagegen 编辑原真空定位座整机图，完整提示词保存在 [output/tray-exchange-assets-notes.md](output/tray-exchange-assets-notes.md)。历史整机、夹具和加工素材及其提示词保留，便于对照。

收料盘、盘内作品及接触阴影沿同一导轨运动：照片平面水平向右 430px，垂直偏移为水平偏移的 `-0.018` 倍。1.5 实际秒时满盘已完全离开全景画面，随后移交库存；空盘返回并完成归位共需 3.8 实际秒。盘满后自动执行，手动「更换收料盘」请求会等待当前一轮落料结束，暂停冻结换盘。换盘本身不使用预录视频。

`coin-material.js` 的倒角、细微车纹、侧壁和位置反射由 Canvas 绘制，未使用新的 imagegen 材质图。扫描为 16 趟机械往复、每趟 4 条局部细纹，合计 64 条；光点局部偏转小于 0.8 照片像素，头像遮罩只展示已扫描的各条细纹。扫描仍为 3.6 秒机械时钟，默认约 2 实际秒，整轮默认约 10 秒。

本轮预览文件为 `PREVIEW-realism-production-1080x1920.webm`（两件生产及一次换盘，本次实录约 26 秒）、`PREVIEW-realism-processing-1080x1920.png`、`PREVIEW-realism-finished-1080x1920.png` 和 `PREVIEW-realism-full-tray-1080x1920.png`。
