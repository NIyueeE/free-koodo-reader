# Free Koodo Reader

一个本地优先、注重隐私的 [Koodo Reader](https://github.com/koodo-reader/koodo-reader) 分支。保留强大的跨平台电子书阅读体验，同时移除官方云服务、账号、Pro 付费和 AI 云功能。

## 本分支特点

- 无登录 / 账号 / Pro / 付费系统
- 无官方 Koodo 云同步和 AI 服务
- 无 macOS 构建产物和 Apple 相关兼容代码
- WebDAV 同步使用开源 `webdav` 包实现，且**仅支持 HTTPS**
- 云凭据本地存储并加密
- 仍然支持本地文件夹同步

## 功能

- 格式支持：
  - EPUB、PDF、MOBI、AZW3、AZW、TXT、FB2
  - 漫画压缩包：CBR、CBZ、CBT、CB7
  - 富文本：MD、DOCX
  - 网页文本：HTML、XML、XHTML、MHTML、HTM
- 平台支持：Windows、Linux、Web、Android（Capacitor）
- 同步 / 备份：
  - WebDAV（仅 HTTPS）
  - 本地文件夹
- TTS：
  - 系统本地语音
  - 自定义 TTS API / 自托管语音插件
- OCR：
  - 系统 OCR（Windows）
  - 本地 OCR（PaddleOCR、Tesseract）
  - 外部 OCR API
- 本地 MDX 词典支持

## 快速开始

```bash
# 安装依赖
yarn

# 桌面开发模式（Electron + React 热重载）
yarn dev

# Web 开发模式（仅浏览器）
yarn start

# 生产构建
yarn build

# 类型检查
npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false

# 打包分发
yarn release

# Android（Capacitor）
yarn android:sync          # 将 Web 构建同步到 Android 工程
yarn android:build         # 构建 debug APK
yarn android:build:release # 构建 release APK
```

## CI/CD

仓库使用 GitHub Actions（带并发取消与作业超时）：

- `ci.yml` — 每次推送/PR 到 `main` 时执行：
  - TypeScript 类型检查
  - ESLint（零警告，有警告即失败）
  - 单元与冒烟测试（`yarn test`）：i18n 完整性、平台检测、**真实 HTTPS WebDAV 冒烟**（完整同步往返）、**IPC 契约**（preload 白名单 ↔ main.js 处理器）、**preload 安全边界**、**数据库服务**（浏览器模式 CRUD）
  - 渲染器生产构建（`build/` 被 git 忽略，因此构建必须显式执行 —— 缺少渲染器正是历史白屏 bug 的根因）
  - 包标识一致性检查（桌面 `appId` == Capacitor `appId` == Android `applicationId`）
  - Android debug APK 构建 + 渲染器存在性检查
  - **GUI 冒烟测试**：在 Xvfb 下启动真实 Electron 应用，验证渲染器完成挂载（不会白屏），并上传截图工件
- `release.yml` — 手动触发或推送 `v*` 标签时构建桌面端（Windows/Linux）和 Android 发布包：
  - 打包前先执行与 CI 相同的类型检查 / ESLint / 单元与冒烟测试
  - 打包前始终先构建渲染器，`build/index.html` 缺失时直接失败，避免发布白屏版本
  - Android release APK 使用专用签名文件 `android/app/keystore/free-koodo-reader.jks`（凭据在 `android/app/keystore.properties`，可通过 CI Secrets `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` 覆盖），并用 `apksigner` 校验签名证书
- `docker-publish.yml` — 发布 Docker 镜像（自托管 Web 部署，手动触发）。

## Android

- 包名：`xyz.freekoodo.reader`（与桌面端 `appId` 一致）。
- 窄屏（≤ 768px）下主界面侧边栏自动折叠为图标栏，头部搜索框、设置按钮与对话框均有响应式布局，手机和平板可用性良好。
- 签名：release APK 使用 `free-koodo-reader.jks` 签名（store password 与 key password 位于 `keystore.properties`）。

## 仓库

- GitHub：https://github.com/NIyueeE/free-koodo-reader
- 默认分支：`main`
- 问题 / 反馈：https://github.com/NIyueeE/free-koodo-reader/issues

## 许可证

本项目基于 Koodo Reader，使用 AGPL-3.0 许可证。详见 [LICENSE](./LICENSE)。
