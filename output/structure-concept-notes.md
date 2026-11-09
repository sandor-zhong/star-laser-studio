# 自动上下料结构概念

此文件对应 output/structure-concept-v1.png 与过程稿 output/structure-concept-v2.png；机械复核后的确认方案见 output/structure-concept-v3.png 和 structure-mechanical-review.md。v3 已接入现有动画，概念图不属于制造图纸。

## 建议局部调整

保留黑色封闭机架、独立激光雕刻头、中央加工夹具。

1. 左侧毛坯料仓提供确定的取料位置。
2. 增加独立取放臂，带可见机械基座、连接关节、升降腕部和真空吸盘。每块圆片被吸住、抬起、搬运、放下和释放，不能以换图代替转移。
3. 前部增加搬运开口。搬运期间激光头抬起停靠，打印期间取放臂退回，机罩关闭。
4. 前传送带使用统一平面的定位工位，材料保持接触皮带、沿同一中心线移动。
5. 右端增设与末端滚筒连接的带侧挡边落料槽，下方收料盘完整可见。经过出口的成品累积保留在盘中。

物料路径：毛坯料仓 → 取放臂 → 中央夹具 → 取放臂 → 定位传送带 → 右端落料槽 → 收料盘。

效果图展示出料瞬间：激光头抬起并停靠，机械臂持有成品，准备放入传送带左侧空工位。

## 图像生成记录

方式：内置 imagegen 编辑，未使用 CLI/API 回退。

初稿参考图：assets/workshop-reference.png。初稿项目输出：output/structure-concept-v1.png。

完整初稿提示词：

Use case: product-mockup. Create ONE extremely photorealistic structural concept rendering of an automated laser engraving workcell, based on the supplied machine photograph. Output portrait 9:16, intended for a 1080x1920 pure livestream. Preserve the black aluminum enclosed machine, transparent amber-tinted enclosure, high-end metal textures, warm task lighting, teal workshop accents and gold anime portrait medals. Zoom out slightly so the entire machine AND a new right-side collection tray fit fully inside the image. This is the UNLOADING moment, not a cutting moment: laser head is visibly raised and parked at the back-right, beam OFF, central circular machining fixture empty. STRUCTURAL CHANGES MUST BE CLEAR: (1) At the left is a compact organized blank-stock magazine with three plain gold round blanks in a feed track. (2) Add a separate compact industrial SCARA pick-and-place arm, with a bolted fixed base on the left inner machine frame, two clearly connected machined-aluminum horizontal links, visible round elbow bearings, pneumatic tubes, and a vertical vacuum/gripper wrist. It must be mechanically plausible and unobstructed. The wrist is HOLDING one completed gold portrait medal, attached to the wrist visibly, directly above an EMPTY locating pocket at the left loading end of the FRONT conveyor, just before placing it. Arm base, links, wrist and held medal all remain clearly visible and connected; no floating material. Provide an actual raised front transfer hatch/opening in the enclosure where this arm reaches out to the conveyor; it must not intersect closed glass or solid frame beams. (3) The front conveyor is a single coherent flat belt, with three finished medals seated fully flat in shallow locating nests, all same physical diameter, aligned exactly to ONE centerline parallel to the belt's long edges. Their perspective and ellipse angle must agree with the belt plane; no skewed, tilted or floating discs. Empty leftmost nest is under the gripper. (4) On the RIGHT end of this same belt, add a short visible sloped stainless-steel discharge chute with side guides, visibly connected after the end roller and leading into a shallow grounded metal receiving tray on the workbench, slightly right and forward of the machine. Finished gold portrait medals visibly accumulate in the tray. Entire chute, tray, and received medals are within the frame, physically supported, not cropped away. All stations share a plausible material path: left blank magazine -> robot -> center fixture -> robot -> front indexing conveyor -> right chute -> collection tray. Keep the photographic style extremely realistic like a professional industrial equipment photo, fine brushed metal, authentic joint details, contact shadows, correct perspective, no generic toy robot, no cartoon machinery. No interface, no text, no labels, no arrows, no watermark. This is a structural design concept photo, show clean uncluttered mechanics and make the material handling route unambiguous.

修订参考图：output/structure-concept-v1.png。构图修订输出：output/structure-concept-v2.png。

完整修订提示词：

Use case: precise-object-edit. Refine this photorealistic structural concept, changing ONLY framing and the collection tray edge visibility. Zoom the camera out roughly8 percent and center the full machine-plus-chute-plus-tray assembly in the portrait9:16 image. The receiving tray at bottom right MUST be ENTIRELY visible with its entire right wall/corner and all coins, leaving a clear margin of workbench to the right of it. Keep ALL mechanical layout, original photographic textures, lighting, arm joints, vacuum gripper holding a medal above the empty left belt pocket, parked right-side laser head, blank stock feeder, conveyor alignment, front opening, connected discharge chute and receiver unchanged. Preserve all visible physical connections. No text, no labels, no arrows, no UI. This is a concept photo for a1080x1920 livestream composition; leave enough margin for all hardware and collected material to remain in frame.

