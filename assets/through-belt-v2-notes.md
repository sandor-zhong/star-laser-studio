# 连续传送带 v2 与同步评分

内置 image_gen 编辑；素材保存到 `D:/star-laser-studio/assets/challenge-through-belt-v2.png`。参考为 `assets/challenge-machine-v1.png`，原生成结果为 `C:/Users/Administrator/.codex/generated_images/01a1bf0c-8618-7930-a661-6927a093c786/exec-6ce5d1a8-2964-450d-bdd1-5865bfcddfff.png`。

当前没有收料盘、成品托盘或满盘换盘。画面底部的滚筒在取景范围之外，成品与其他物料保持相同步进，完整边缘离屏后才归档。评分在雕刻开始时从零开始，按同一显影进度递增，在 scanEnd 达到本件一次抽取的最终随机分；之后不再增加。

验证：114 项 JavaScript 单元测试通过；浏览器 30 轮连续生产、3,390 次状态采样通过。包括无托盘阻塞、完整离屏才归档、暂停冻结分数、雕刻结束前未提前到最终值、结束时同步定格，以及出料后分数不变。测试预览与录屏使用示例头像及固定样本分数；实际直播任务仍由服务端各自随机分配一次。

## 实际提示词

Precise local edit of this photoreal industrial laser machine background for a 1080x1920 live animation. Keep the reference photograph and framing EXACTLY unchanged above y=950 in its 941x1672 coordinate system: same empty upright U cradle, gantry, glass enclosure, pedestal, handle, workshop lighting and geometry. ONLY lengthen the existing black forward conveyor toward the camera so it continues beyond the BOTTOM EDGE of the image. Its rear cloth corners stay at approximately (325,953) and (578,953); its side rails diverge smoothly toward approximately (85,1685) and (865,1685). The cloth fills the bottom foreground, its weave grows naturally with perspective, and the metal amber-lit side rails continue out of frame. Remove the old front roller and crossbar near y=1410 and the tabletop immediately below the old conveyor: those are now replaced by continuous same-material conveyor. The conveyor's end roller is OUTSIDE the image below the bottom edge, so there is no visible endpoint, gap, receiving bin, tray, dish or collection box. Preserve the dark table and floor only OUTSIDE the extended belt. Do NOT add avatars, disks, products, robot arm links, spindle head, laser effects, HUDs, scores, text or any other objects. This is a clean reusable photo plate; keep every unaffected pixel/structure as close as possible to the source.

