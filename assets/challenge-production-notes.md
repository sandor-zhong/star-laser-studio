# 上一版立式头像挑战工坊记录

本文件为历史版本。当前无托盘连续传送、同步评分方案见 through-belt-v2-notes.md。

本记录对应最新参考图：正面固定机位、大面积立式头像加工、前向输送带上的大尺寸倾斜头像与金色标签、顶部青色 Top 10 和右侧金色积分板。独立特写窗口已取消。画布为 **1080 × 1920**；生成底图提供静态环境，头像、分数、机械运动、激光与 UI 由代码实时绘制。

## 本次生成素材来源

| 项目素材 | 生成源文件 | 用途 |
| --- | --- | --- |
| `assets/challenge-machine-v1.png` | `generated_images/01a1bf0c-8618-7930-a661-6927a093c786/exec-7c4daf2b-db3b-484c-814f-1c7136040d9d.png` | 干净的正面立式工坊底板，作为当前主场景静态背景 |
| `assets/challenge-drawer-source-v1.png` | `generated_images/01a1bf0c-8618-7930-a661-6927a093c786/exec-fbb8d576-a301-46af-8600-5b4293360475.png` | 收料盒动态图层的源图，用于盒体与盒内成品共同退出和返回 |

上述源图由本次 imagegen 工作生成；文件名用于追溯生成产物，不是运行时网络地址。运行时加载项目 `assets/` 中的素材。

## 提示词目标摘要

这里记录生成意图摘要，**不是未留存的逐字提示词原文**：

- 写实工业工坊，黑色金属框架、透明防护罩、暖金照明和少量青色环境光，正面固定视角，9:16 竖屏构图。
- 加工位支持大圆形材料竖直夹持，让肖像面向直播观众；保留机械臂、激光头运动空间以及合理的装卸料位置。
- 前向输送带延伸至观众方向，留出可见的材料支撑、带端出口和收料位置。
- 输出可用于实时合成的干净底板，不把参考图中的肖像、数值、排行榜、进度文字或激光特效烘焙进静态图片。
- 收料结构需要单独合成，使盒体、阴影和盒内作品在换盘时作为整体运动；屏外交接后返回空盒。

如需逐字复现生成，仍应查阅本次 imagegen 原始调用；不要将上述结构摘要误认为完整原始提示词。

### 最终底板的实际编辑提示词

采用内置 `image_gen`，编辑目标为上表收料盒源图；完整提示词如下：

> Precise local background edit for an animated machine plate. Preserve this EXACT photo, its geometry and tall framing, all lights, machine frame, empty U cradle, pedestal, front conveyor, front roller and metal table. ONLY REMOVE the separate empty receiving drawer/bin that sticks out below the front belt roller in the bottom foreground (roughly x200..735, y1420..1575 in the 941x1672 reference). Remove the entire bin including its handle and its contact shadow. Inpaint the continuing dark reflective workshop tabletop beneath the roller naturally, leaving bare space for a MOVING bin layer. The conveyor's front roller and fixed outer support/short drop lip remain unchanged. Do not add any medallions, laser head, robot arm, UI, text, scores, holder or other objects. Change no other part of the photo, keep all proportions/alignment. This is just removing one receiving bin to animate it later; keep every unaffected element as close to source as possible.

## 动态合成

当前 `photo-scene.js` 导出 `challenge-scene.js` 的场景实现。`production-layout.js` 统一立式夹具、吸取路径、前向输送带和落料几何；`production-optics.js` 将同一激光扫描和显影进度映射到立式加工面；宏观投影接口保留用于历史对照。主相机固定，特写不占物理库存。

圆片装卸使用连续可见的机械取放，带上成品按最新参考图以大尺寸倾斜摆放。头像、金属圆片、接触阴影与积分标签跟随同一记录移动。成品离开输送带后继续经过出口进入收料盒；换盘先整体退出，完全离屏后交接库存，再返回空盒。

激光接触点由 `laser-effects.js` 实时绘制白热核心、青色辉光、飞溅金属火花和少量烟雾。只在真正扫描且未暂停时出现；其位置与显影遮罩使用同一路径。右侧 HUD 显示实际进度、扫描条数和加工阶段，不伪造功率、速度或精度测量。

## 随机积分与排行榜

每件作品独立生成一个 **0–100,000（含两端）** 的整数积分。实时服务由 `studio_runtime.py` 在创建任务时分配一次，完成回报不能用客户端字段替换服务端结果。离线使用 `challenge-score.js` 在创建物料时分配一次。评分不依赖头像像素、观众身份、外貌或赠送金额；礼物升级既有作品保留原结果。

加工及雕刻头归位阶段隐藏结果，积分揭晓阶段从 0 渐进计到本件积分，随后随作品保留。右板明确写「随机积分 · 0–100,000」，不把娱乐性随机结果标成真实 AI 图像分析。星级由积分区间派生，不绘制虚构的清晰度、相似度等分项。

顶部榜单仅包含实际完成作品，积分降序、同分完成顺序稳定，最多 10 件。空榜显示等待第一件作品完成。已完成排行与可见收料盒库存相互独立，换空盒不会清空本场积分排名。预览检查页注入的固定头像及积分仅用于可重复画面检查。

## 历史资料与验证范围

旧夹具、横向输送带、实体墙面屏幕以及倾斜俯视特写的素材和 `output/` 记录继续保留，但不代表当前布局。`portrait-score.js` 与测试是历史 0–100 像素分析实现，当前生产使用随机积分。

当前结构单元测试入口为 `production-layout.test.mjs`、`production-optics.test.mjs`、`challenge-score.test.mjs`、`challenge-hud.test.mjs` 和 `monitor-overlay.test.mjs`。2026-11-12 的完整检查为 JavaScript 112 项、服务端 27 项通过；Canvas 连续生产 25 轮、2,902 次采样及一次满盘交接通过。实际截图、录屏和结果 JSON 使用 `PREVIEW-challenge-` 前缀；入场与礼物联调使用独立模拟服务，不冒充真实观众或真实送礼验证。
