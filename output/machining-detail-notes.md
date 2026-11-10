# 加工近景高清底板

- 文件：`assets/machining-detail-plate-v1.png`
- 生成方式：内置 imagegen，对运行画面作参考编辑。去除活动雕刻头、头像圆片和激光；重建高清空真空夹具和台面。
- 代码将高清底板叠加在加工相机对应的场景平面中，沿用同一个头像、逐行扫描轨迹和活动雕刻头；其余上下料阶段仍展示全景底图。
- 高清底板随加工近景最后 20% 的推进淡入，退场在成品展示相机下方完成。

## 最终提示词

Use case: precise-object-edit.
Asset type: photorealistic high resolution machining camera background plate for a 1080x1920 portrait livestream simulation.
Edit target: supplied screenshot PREVIEW-portrait-processing-1080x1920.png.
Primary request: remove ONLY the entire laser spindle/head/nozzle and its black cable in the upper/right part of the image, remove the gold disk and all printed anime artwork from the fixture center, remove the cyan laser beam/spot. Reconstruct the background behind those moving objects. Keep the metal vacuum fixture in precisely the same projected position, shape, size, perspective and proportions as the screenshot. The fixture is a realistic low-profile stainless-steel circular vacuum nest: broad brushed steel annular flange with three recessed socket screws, flat empty dark charcoal circular vacuum seat in the center. Seat's projected center MUST remain at pixel (540,1077), horizontal radius 324px, vertical radius 153px in a 1080x1920 frame. Do not add jaws, rings or any object over the seat. Maintain the outer flange perspective from the target.
Sharpen and reconstruct realistic fine brushed metal, screw sockets, subtle tool marks and contact shadows throughout, avoiding pixelated blur. Preserve the workshop/tooling plate background colors and warm light from left, slight cool reflections from right. The background above the fixture should be out-of-focus workshop/tooling plate without any visible printing head or cable. Same oblique machining camera angle, not overhead. Keep the tabletop and bottom plate edge at the same location.
Constraints: no laser, no coin, no portrait, no print head, no tool, no cable, no UI, no text, no score. This background will have the real moving laser and disk composited back by code at exact coordinates. Make one portrait 1080x1920 image, photorealistic product macro photography.

## 实际输出与坐标校准

实际 PNG 为 **916 × 1717**，与提示词要求的 1080 × 1920 不同；运行时使用统一比例缩放，避免拉伸夹具。源图座面参考中心约 `(458,992)`，取 `scale = 1080/916`，将底板顶边放在 `1108 - 992 × scale`，使该参考中心对齐输出约 `(540,1108)`。代码再使用加工相机的逆变换映射回工作站照片平面，因此底板与动态物料、机械头共用相机变换。

底板淡入范围为 `camera.detail = 0.8…1.0`。底板只有静态空夹具和台面；当前作品的高清头像、逐行显影、激光和同一动态雕刻头仍由程序实时合成，不使用预录加工片段，也不复制物料。加工头像横向直径仍约 **649px，占 1080 输出宽度 60%**。

加工完成后切换到 `assets/portrait-inspection-camera-v1.png` 的独立近俯视机位；该机位中的同一成品头像直径为 **756px / 70%**，默认显示作品效果分 **2.5 秒**，完整周期默认 **10 秒 / 件**。高清头像本身来自 `assets/portrait-artwork-atlas-v1.png`，图集与原提示词记录见 [portrait-artwork-notes.md](portrait-artwork-notes.md)。
