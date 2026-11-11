# 写实场景资产记录

历史位图生成方式：内置 imagegen 图像编辑工具；不是 CLI/API 回退。当前特写调整使用 Canvas，不新增位图。

当前运行方案为固定整机与上方青色悬浮实况窗。窗内固定画布为 1024 × 512，当前物料、末端聚焦镜筒、激光、显影和评分由同一物料记录与扫描时钟实时合成，引线跟随活动雕刻头右侧锚点。圆片倾斜约 −13.7°，窗内不显示夹具、定位座或吸盘，背景只复用既有工作站照片上部的虚化环境；历史 `assets/monitor-fixture-camera-v1.png` 已停止加载。青色边框、角标、暖金标签、淡网格、引线，以及白热核心、青色辉光、金属火花和少量烟雾均为 Canvas 原生绘制，本轮不新增 imagegen 资产。下文保留历次素材与完整提示词，历史全屏近景、墙面实体 LCD 和浮窗夹具阶段已明确标注。

## 直播观众头像来源与接入

新增直播接入不生成或覆盖场景位图。真实观众头像来自用户提供的 `douyin-browser-ws-relay` 统一事件字段 `user.avatar_url`，由本项目服务端经同源代理供显示页读取，再复用原有圆片材质、逐条显影和评分流程。头像缺失或读取失败时使用现有 `assets/portrait-artwork-atlas-v1.png` 演示插画回退，后台状态明确标注来源与失败原因；历史插画不作为真实观众照片展示依据。

特写仍使用上方青色实况窗，后台可选择仅礼物、全部作品或关闭；启用时显示当前实际加工的同一件头像，整机主镜头保持固定。接入过程不读取或复制外部项目的 Cookie、签名链接或上传凭据，仅导入房间号、relay 地址和消费 Token 作为初始连接设置，运行配置保留在本项目已被 Git 忽略的 `.local` 中。启动、后台和上游采集器要求见 [README.md](README.md)。当前可用性验证应区分合成事件与真实抖音事件，不据模拟截图宣称已经连通真实直播间。

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

## 历史：大头像与全屏成品评分相机 · 2026-11-10

历史项目资产：`assets/portrait-inspection-camera-v1.png`，941 × 1672。使用**内置 imagegen**，以 `assets/approved-cell-vacuum-v3.png` 为参照，生成同一真空定位座的独立近俯视空底图。完整生成提示词及历史接触面校准见 [output/showcase-camera-notes.md](output/showcase-camera-notes.md)。该图曾作为实况窗夹具素材的结构参照，当前页面不加载这两张历史特写夹具图片。

该历史底图不包含头像、激光、文字或评分。旧版加工相机曾将头像放大到约 **649px / 60% 画面宽**，再以独立全屏成品相机展示 **756px / 70% 画面宽**的近俯视成品，默认展示 **2.5 秒**。当前整机镜头固定，放大的头像与加工细节在悬浮实况窗内实时显示。

**0–100「作品效果分」**的算法继续按图像清晰度、构图、色彩稳定计算，当前计分动画和短评显示在实况窗内；它不是颜值分，也不分析人物外貌或人格。默认完整周期为 **10 秒 / 件**，对应 18 秒机械时钟按 1.8× 播放。

历史预览：`PREVIEW-portrait-processing-1080x1920.png`（加工）、`PREVIEW-portrait-rating-1080x1920.png`（全屏成品评分）、`PREVIEW-portrait-rating-1080x1920.webm`（旧版流程）。

## 生成资产索引与校准补充

以下资产均由**内置 imagegen**生成。实际文件尺寸以项目中的 PNG 为准，生成提示词中的目标尺寸不代表实际输出尺寸。

| 资产 | 实际尺寸与用途 | 完整提示词及记录 |
| --- | --- | --- |
| `assets/portrait-inspection-camera-v1.png` | 941 × 1672；历史全屏近俯视成品相机空底图，曾作为实况窗夹具结构参照，当前页面不加载。 | [output/showcase-camera-notes.md](output/showcase-camera-notes.md) |
| `assets/portrait-artwork-atlas-v1.png` | 1254 × 1254；2 × 2 图集、每张 627 × 627，以参考图四张成品头像重绘，替代约 130px 的历史裁图。 | [output/portrait-artwork-notes.md](output/portrait-artwork-notes.md) |
| `assets/machining-detail-plate-v1.png` | 916 × 1717；历史全屏加工夹具空底板，当前页面不加载。 | [output/machining-detail-notes.md](output/machining-detail-notes.md) |
| `assets/workcell-exchange-base-v1.png` | 941 × 1671；当前整机全景空底图，移除固定收料盘及接触阴影，保留滑槽与机器。 | [output/tray-exchange-assets-notes.md](output/tray-exchange-assets-notes.md) |
| `assets/receiving-tray-layer-v1.png` | 1730 × 909，RGBA；独立空收料盘，运行时裁取源区域 `(80,110,1590,715)` 并映射到照片平面 `(548,1211,342,158)`。 | [output/tray-exchange-assets-notes.md](output/tray-exchange-assets-notes.md) |
| `assets/wall-monitor-header-v1.png` | 1629 × 965；历史墙面实体 LCD、黑色边框与空白玻璃屏幕，当前页面不加载。 | [output/wall-monitor-assets-notes.md](output/wall-monitor-assets-notes.md) |
| `assets/monitor-fixture-camera-v1.png` | 1672 × 941；历史实况窗固定夹具空底图，当前页面不加载。 | [output/wall-monitor-assets-notes.md](output/wall-monitor-assets-notes.md) |

`makeAvatar` 默认生成 768 × 768 圆形画布，清晰度来自 627px 原始插画，不再放大约 130px 的旧成品裁图。图集由参考重绘得到，是本地演示插画；加工位、实况窗和输送带始终使用同一张当前作品。

历史全屏加工底板曾在 `camera.detail` 从 0.8 进入 1.0 时平滑淡入；其座面源参考中心约为 `(458,992)`，当时采用 `1080/916` 的统一缩放和顶部偏移 `1108 - 992 × scale`。这些记录用于回溯旧素材，当前页面采用固定主镜头和悬浮实况窗投影。

## 细纹显影、金属材料与可见换盘 · 2026-11-10

本轮新增的两个位图为表中 `assets/workcell-exchange-base-v1.png` 和 `assets/receiving-tray-layer-v1.png`，均使用内置 imagegen 编辑原真空定位座整机图，完整提示词保存在 [output/tray-exchange-assets-notes.md](output/tray-exchange-assets-notes.md)。历史整机、夹具和加工素材及其提示词保留，便于对照。

收料盘、盘内作品及接触阴影沿同一导轨运动：照片平面水平向右 430px，垂直偏移为水平偏移的 `-0.018` 倍。1.5 实际秒时满盘已完全离开全景画面，随后移交库存；空盘返回并完成归位共需 3.8 实际秒。盘满后自动执行，手动「更换收料盘」请求会等待当前一轮落料结束，暂停冻结换盘。换盘本身不使用预录视频。

`coin-material.js` 的倒角、细微车纹、侧壁和位置反射由 Canvas 绘制，未使用新的 imagegen 材质图。扫描为 16 趟机械往复、每趟 4 条局部细纹，合计 64 条；光点局部偏转小于 0.8 照片像素，头像遮罩只展示已扫描的各条细纹。扫描仍为 3.6 秒机械时钟，默认约 2 实际秒，整轮默认约 10 秒。

该阶段的历史预览文件为 `PREVIEW-realism-production-1080x1920.webm`（两件生产及一次换盘，历史实录约 26 秒）、`PREVIEW-realism-processing-1080x1920.png`、`PREVIEW-realism-finished-1080x1920.png` 和 `PREVIEW-realism-full-tray-1080x1920.png`。

## 历史：固定整机与墙面实体 LCD · 2026-11-10

该阶段生成 `assets/wall-monitor-header-v1.png`（1629 × 965）和 `assets/monitor-fixture-camera-v1.png`（1672 × 941），均使用**内置 imagegen**按参考图和现有工坊素材编辑生成。两张图的完整提示词、引用素材与用途记录见 [output/wall-monitor-assets-notes.md](output/wall-monitor-assets-notes.md)。墙面素材仅提供真实边框、空屏玻璃和环境；夹具素材为空加工位，未烘焙头像、激光、评分或动态 UI。两张素材现均保留作历史对照，当前页面不加载。

当时将当前物料与工具映射到固定 1024 × 512 的实体 LCD 屏内画布，并在底条绘制昵称、进度和评分。当前方案保留同一物料记录、时钟和可见性规则，改用下文的青色悬浮实况窗。

作品效果分在加工完成、雕刻头归位后揭晓，与该成品保存的分数一致。输送带各成品上方的分数随物料移动，进入滑槽时淡出；这套行为继续沿用。

该阶段历史预览为 `PREVIEW-wall-monitor-processing-1080x1920.png`、`PREVIEW-wall-monitor-finished-1080x1920.png` 和 `PREVIEW-wall-monitor-production-1080x1920.webm`。

## 历史：青色悬浮实况窗与夹具底图 · 2026-11-11

该阶段界面由 **Canvas 原生绘制**，未新增 imagegen 图片：实况窗使用青色细框和角标、暖金标签、淡网格；上方环境使用既有工作站照片的上部裁切与浅景深。`assets/wall-monitor-header-v1.png` 停止加载，其原文件与提示词继续保留。窗内当时复用 `assets/monitor-fixture-camera-v1.png` 的空夹具照片，活动圆片、雕刻头与激光实时合成；当前已换成下文的无夹具特写。

主镜头固定为照片平面 1.08 倍、输出纵向偏移 260px。实况视口为输出 `(135,205,810,395)`，内部画布 1024 × 512；圆片偏左并保留轻微倾斜。右侧信息展示真实扫描进度、条数和阶段，数据与实际扫描时钟相同，不显示虚构功率或精度。昵称、完工评分及短评引用当前物料记录，与皮带上的成品分数一致。

当且仅当当前活动物料位于夹具时，引线连接浮窗底边与实际活动雕刻头右侧小锚点。浮窗端点为 `(screen.x + 0.87 × screen.width, screen.y + screen.height)`；雕刻头端点将照片平面 `(LASER_ORIGIN.x + pose.x + 34, LASER_ORIGIN.nozzleY + pose.y - pose.lift - 42)` 经过固定主镜头转换到输出坐标。引线随扫描、升降与归位移动，物料转到吸盘或皮带、待机及换盘时隐藏。

`monitor-state.js`、`monitor-view.js` 与 `monitor-overlay.js` 分别提供同一记录和时钟的状态、固定投影与可见性、真实进度和评分显示。实况窗图像不增加物理库存；成品离开加工视野后不残留完整头像，皮带分数标签在加工和评分期间保持可见。

该阶段历史预览为 `PREVIEW-floating-live-processing-1080x1920.png`、`PREVIEW-floating-live-finished-1080x1920.png` 和 `PREVIEW-floating-live-production-1080x1920.webm`。此前素材、完整提示词与 PREVIEW 文件保留作历史对照。

## 当前：无夹具倾斜材料与激光接触特效 · 2026-11-11

本轮不调用 imagegen，不新增或重写历史位图。窗内背景复用 `assets/workcell-exchange-base-v1.png` 上部的既有工作室环境，进行虚化和暗色玻璃调色；不再投影 `assets/monitor-fixture-camera-v1.png`。活动圆片使用 `coin-material.js` 原有金属材质，末端聚焦镜筒从既有透明 `assets/spindle-layer.png` 裁取，下方整机依然使用完整雕刻头图层和真实取放臂。

视口位置 `(135,205,810,395)` 和固定主镜头不变。窗内圆片投影中心为 `(420,260)`，两基向量为 `(426,−104)` 与 `(64,210)`，侧壁厚度 18px，水平轴倾斜约 −13.72°。圆片、镜筒位置、光束端点和逐条显影区域仍由同一机械时钟投影，局部特效不会创建另一件物料或独立进度。

`laser-effects.js` 在真实接触点绘制白热核心、青色局部辉光和细光束，配以短暂金属火花与少量上升烟雾。只有激光开启且未暂停时绘制，关光、评分和搬运时清空。HUD 保留薄青框、光学角标、淡网格、紧凑真实扫描数据与暖金昵称进度/评分标签，不显示虚构加工功率或精度。

校准记录见 [output/laser-macro-layout-notes.md](output/laser-macro-layout-notes.md)。当前预览导出为 `PREVIEW-laser-macro-processing-1080x1920.png`、`PREVIEW-laser-macro-finished-1080x1920.png` 和 `PREVIEW-laser-macro-production-1080x1920.webm`；历史资产、提示词和验证记录均保留。
