# 高清演示头像图集

- 文件：`assets/portrait-artwork-atlas-v1.png`
- 方式：内置 imagegen；参考 `assets/workshop-reference.png` 重新绘制四枚成品上的头像。
- 原图尺寸：1254 × 1254；每个象限 627 × 627，运行时在高清画布上圆形裁剪。
- 用途：替换原来从约 130 像素宽成品中截取的低清演示图。加工、成品机位、传送带使用相同头像来源。
- 这是本地演示图集；尚未连接真实观众头像接口。

## 最终提示词

Use case: identity-preserve.
Asset type: one square 2-by-2 avatar texture atlas for a simulated livestream engraving machine, replacing blurry tiny crops from the reference medals.
Input image: workshop-reference.png is the character and style reference; use ONLY the four finished portraits on its front conveyor as subjects.
Primary request: redraw those four anime portrait artworks sharply at high resolution as FLAT square illustrations. Exact atlas layout: top-left is the dark-haired young man in blue-gray clothing against blue sky; top-right is the smiling long dark-haired young woman with pink blossom hair ornaments and pink clothing; bottom-left is the smiling white-haired young woman with eyes closed; bottom-right is the dark-haired young man in orange-blue outdoor clothing and goggles.
Each quadrant is exactly one quarter of the whole square, edge to edge without gutters or borders. Center each head and shoulders within its quadrant so the entire face and hair ornaments fit within the central 85-percent circular safe area. Match cheerful expressions and detailed polished anime illustration style seen on the medals; use crisp fine outlines, eye highlights, rich but tasteful colors, botanical/sky background details. Render as a 2048x2048 square atlas so each avatar is at least 1024 pixels wide.
Constraints: no metal coins, no rims, no objects, no machine, no perspective, no photoreal skin, no text, no watermark, no labels, no grid lines or empty margins. This is artwork to be composited on a physical disk by the app, not a photograph of medals.

## 实际输出与运行接入

实际生成资产为 **1254 × 1254**，不是提示词目标的 2048 × 2048；四个象限各 **627 × 627**，没有间隔。保留上面的生成提示词原样，避免把目标尺寸误当作实际清晰度。

`art.js` 根据当前演示头像索引读取一个象限，`makeAvatar` 默认输出 **768 × 768** 圆形画布。原始插画细节来自 627px 图集象限，已经替代历史约 130px 宽的成品裁图。加工、近俯视成品相机和输送带复用同一张作品图像；作品效果分读取这张头像的实际像素，同一图像评分稳定。

当前加工显示约 649px / 60% 画面宽，成品显示 756px / 70% 画面宽。默认完整周期 10 秒，其中近俯视成品与评分展示 2.5 秒。此图集为参考重绘的本地演示插画，尚未连接真实观众头像接口。
