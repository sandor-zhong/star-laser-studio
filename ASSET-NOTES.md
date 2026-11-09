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


## V0.4 完整生产流程底板

使用内置 imagegen 编辑 `assets/workshop-motion-plate.png`，项目输出为 `assets/workshop-empty-stage.png`。保留原图金属质感，将加工位和传送轨道清空，圆片、夹爪和出料机构在 Canvas 中独立合成。

完整提示词：

> Use case: precise-object-edit. Create an empty machine background plate for a photorealistic production animation. Preserve EXACT original941x1672 portrait camera framing, ALL machine structure, rails, original dark workshop lighting, frame, glass, reflections. Change ONLY these regions: 1. Remove the large gold medal at the central work fixture (center524869), including its gold rim, reveal a realistic empty dark steel circular recessed fixture with a smaller central flat graphite support pad, keep all surrounding silver fixture and clamps unchanged. 2. Remove all four gold medals from the foreground conveyor belt (centers3531139,4991120,6421100,7771084), reconstruct continuous realistic dark woven rubber belt surface with matching texture and lighting. 3. Remove the three loose gold blank discs along the left input feeder, reconstruct its dark mechanical feed track. Keep the machine empty with no workpieces anywhere. The spindle and chain were already removed, do not add any. Do not alter any other details or composition. No text, no UI, no new objects.
