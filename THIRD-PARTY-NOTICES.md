# 直播接入源码来源

- `live_relay/cloud_server.py`、`dyhub_bridge.py`、`relay_publisher.py`：从用户提供的 `douyin-browser-ws-relay` 项目复制，保留事件协议；本项目调整了包导入、配置文件位置，并为网关补充可配置启动入口。未复制原项目的 `.env`、虚拟环境、Cookie、日志和个人数据。
- `vendor/dyhub/`：从本机 DyHub 0.3.1 源码副本纳入，原仓库 <https://github.com/ymstar/dyhub>，本地提交 `3a79c57d85c59289db3b77211b3ec01fae47d42c`。保留源码、依赖锁文件、原 README 和 MIT `LICENSE`；增加 `build.mjs` 供 Windows 构建，不改变采集实现。
- `vendor/dyhub/third_party/douyin-sign/`：DyHub 随附的签名组件，上游声明来源为 <https://github.com/saermart/DouyinLiveWebFetcher>，许可为 **AGPL-3.0**。保留原始源码和来源说明，并补入该上游完整 `LICENSE`。这些组件不能仅按 DyHub 的 MIT 许可处理。发布或再分发时保留这些源码、许可与来源；本文件不改变任何上游许可。

依赖包按 `vendor/dyhub/package-lock.json` 和 `requirements.txt` 安装；不把 `node_modules`、虚拟环境、运行数据或凭据打包进 Git。
