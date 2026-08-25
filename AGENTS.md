# AGENTS.md

本文件为 AI 编码助手在本仓库工作时的完整指引。更详细的背景请同时参考 `README.md`（英文）与 `README_cn.md`（中文）。

## 项目简介

Free Koodo Reader 是一个本地优先、无官方云服务的跨平台电子书阅读器，基于 Electron + React (CRA) + Redux 构建。桌面端走 Electron，Android 端通过 Capacitor 包装现有 Web 构建。

### 四层架构

| 层 | 位置 | 职责 |
|---|------|------|
| Electron 主进程 | `main.js` | IPC handlers, SQLite (better-sqlite3), 云同步, 原生集成 |
| React 渲染进程 | `src/` | UI, Redux 状态管理, 书籍渲染 |
| 阅读引擎 | `src/assets/lib/kookit-extra.min.mjs` | 闭源 ESM — 书籍解析、SQL 语句、同步工具 |
| Go HTTP 服务 | `httpserver/` | 可选的 KOReader / OPDS 集成 |

## 重要提醒

**不要尝试读取或修改** `src/assets/lib/` 下的混淆/压缩文件：
- `kookit-extra.min.mjs`、`kookit.min.js`、`kookit-extra-browser.min.js`

这些是混淆/压缩后的产物，无法阅读。如需查阅源码，请直接读取本地源码仓库：`D:\Project\kookit`、`D:\Project\kookit-extra`。

## 当前目标

下一个目标是**完成 Android 端开发**，推荐方案（详见下文计划）：

- 使用 **Capacitor** 包装现有 Web 构建（已完成脚手架与发布链路）；
- 在 `src/platform/` 建立平台抽象层，替换 `window.electronAPI` 的直接调用；
- 桌面端继续走 Electron，Android 端走 Capacitor。

### Android 迁移计划（当前状态）

1. **平台抽象层**（部分完成）：`src/platform/` 已有环境检测（`isElectron` / `isCapacitor` / `isAndroid` / `isNarrowScreen` / `isMobileDevice`），被侧边栏自动折叠与阅读器 `isMobile` 使用；剩余工作是把 232 处 `window.electronAPI` 引用逐步迁移到 FileSystem / Database / Dialog / OCR / TTS / Cloud 接口。
2. **Capacitor 脚手架**（完成）：`capacitor.config.ts` + `android/` 工程；`npx cap sync android` 只复制 Web 资产与插件，不会覆盖 `android/app/build.gradle` 的签名配置。
3. **Android 平台适配**（未开始）：`CapacitorPlatform` 适配器，文件/数据库（sql.js WASM 或 Capacitor SQLite）/TTS/OCR/对话框。
4. **包名与签名**（完成）：`xyz.freekoodo.reader` 三处对齐；release APK 使用专用 keystore（见"Android 发布说明"）。
5. **验证**（部分完成）：CI 有 GUI 冒烟、debug/release APK 构建与渲染器检查；**待办：Android 真机/模拟器手动测试**（导入、阅读、WebDAV 同步、TTS、OCR、MDX 词典）。

### 关键取舍

- 不要重写渲染层：WebView 直接复用现有 React/Redux + 阅读引擎（引擎自带 `ReactNativeWebView` 支持）。
- 不要重新引入官方云服务/账号/Pro/AI 云。
- 本地文件夹同步是桌面概念，Android 用应用私有存储 / SAF。
- 若上游移动端源码开源，可重新评估方案。

## 默认分支与 CI

- 默认分支：`main`；在 `main` 上直接修改并推送，CI 自动运行：类型检查 → ESLint（零警告）→ 单元与冒烟测试 → 打包文件守卫（`verify-package-files`：main.js/preload.js 的 require 图必须被 `build.files` 覆盖）→ 生产构建 → GUI 冒烟测试（Xvfb 下启动真实 Electron 验证渲染器挂载）→ Android debug APK（含渲染器存在性检查、包名一致性检查）。带并发取消与作业超时。
- **测试套件（`yarn test`，56 个用例）**：i18n 完整性（en↔zh-CN key 一致）、平台检测、WebDAV 单元 + 真实 HTTPS 服务器冒烟、**IPC 契约**（preload 白名单 ↔ main.js 处理器双向校验）、**preload 安全边界**（通道白名单/fs/path/crypto/错误传播）、**数据库服务**（isElectron=false 浏览器模式 CRUD）、**打包守卫**（`build.files` 覆盖 main 进程 require 图，防止 "Cannot find module" 启动崩溃，v3.0.4 教训）。新增关键逻辑时同步补充测试。
- **注意**：`build/`（渲染器产物）被 git 忽略，任何打包（`yarn release`、release workflow）都必须先执行 `yarn build`，否则会发布白屏版本。CI 与 release workflow 已内置缺失检查与冒烟测试；release workflow 另有**打包产物冒烟**（ubuntu 上 `electron-builder --dir` 后在 Xvfb 启动打包产物并断言 `KOODO_SMOKE_RESULT: PASS`，通过后才执行 `--publish always`）。
- **WebDAV 冒烟测试**：`yarn test` 中的 `webdavLive.test.ts` 会启动真实 HTTPS WebDAV 服务器（自签名测试证书 fixture），用生产 `WebDavService`（渲染端）跑完整的 建目录→上传→存在性→列表→下载比对→删除，并校验 HTTPS-only 策略；`webdavCloudLive.test.ts` 对主进程层 `webdavCloud.js`（打包后 cloud-upload/download 的实际代码路径）做同样的真服务器往返，并验证"服务器连上但不响应"时请求会被绝对超时中止而不是永久挂起。修改 `src/utils/storage/webdavService.ts` 或 `webdavCloud.js` 后必须运行 `yarn test`。

## 关键 IPC 通道

- `open-book` / `new-tab` / `exit-tab` — 窗口生命周期
- `database-command` — 数据库操作（所有数据库操作必须通过此通道）
- `cloud-upload` / `cloud-download` — 云同步
- `before-reader-close` → `reader-close-ready` — 阅读器两阶段关闭

## Redux 与容器模式

- Redux 切片：`book`, `reader`, `manager`, `viewArea`, `backupPage`, `sidebar`, `progressPanel`；每个切片在 `src/store/actions/` 与 `src/store/reducers/` 各有一个文件。
- 状态类型使用 `stateType`（`src/store/index.tsx`）；所有 `mapStateToProps` 都应使用它。
- Container 模式：`index.tsx` (Redux connect) → `component.tsx` → `interface.tsx`，位于 `src/containers/` 下。

## 页面路由与格式支持

- 路由：`/manager/*` 主界面（书库、笔记、回收站）；`/epub`、`/pdf`、`/mobi`、`/txt`、`/md` 等阅读器路径；`/login`、`/stats`、`/redirect`。
- 支持格式：EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, HTML/XML/XHTML/MHTML/HTM。

## 关键约束

- **不要主动提交代码**：除非用户明确要求，否则不执行 `git commit`、`git push` 等操作。
- **不包含任何官方云服务**：不要重新引入 Koodo 官方账号、登录、Pro、付费、AI 云服务、官方 API/域名。
- WebDAV 同步使用 `webdav` 开源包，**仅支持 HTTPS**，凭据本地加密存储。
- **Android 开发约束**：
  - 新代码不要直接调用 `window.electronAPI`，应通过 `src/platform/` 抽象层。
  - 保持 Web 构建始终可用；桌面端继续走 Electron。
  - Android 数据库优先使用 `sql.js` WASM 或 Capacitor SQLite，不使用 `better-sqlite3`。
  - Android 文件访问使用 Capacitor Filesystem / Storage Access Framework，不使用 Electron `fs`。
  - 新增 Android 相关代码时同步更新本文件与 README。
- 用户可见文本必须使用 `react-i18next` 的 `t("key")`，不得硬编码。
- TypeScript 避免 `any`，在 `interface.tsx` 中定义类型。
- 不要从渲染进程直接操作 SQLite；所有数据库操作必须通过 `database-command` IPC。
- 新增 i18n key 需在 `src/assets/locales/en.json` 中添加（zh-CN 同步补充；CI 有 en↔zh-CN key 一致性测试）。
- 修改 `src/utils/reader/` 下工具函数会影响 iframe 中书籍渲染，需手动回归测试。
- 添加窗口打开通道时遵循 `new-tab` → `WebContentsView` / `open-book` → `BrowserWindow` 模式。
- 所有 IPC 参数需校验后再执行文件系统/数据库/Shell 操作。
- 不要将令牌、密码或完整书籍路径记录到 info 级别日志。

## 常用命令

```bash
yarn          # 安装依赖
yarn dev      # 桌面开发模式（Electron + React 热重载）
yarn start    # Web 开发模式
yarn build    # 生产构建（打包前必须执行，build/ 被 git 忽略）
yarn test     # 单元测试 + WebDAV/平台/i18n 冒烟测试（CI 同款）
yarn lint     # ESLint（CI 要求零警告）
node scripts/smoke-test.js  # GUI 冒烟测试（需 Xvfb，等价于 CI 的 smoke-test job）
yarn release  # 打包分发
yarn rebuild  # 重新编译原生模块
yarn android:sync          # 同步 Web 构建到 Android 工程
yarn android:build         # 构建 Android debug APK
yarn android:build:release # 构建 Android release APK
```

## 项目结构（概要）

```
.
├── main.js                 # Electron 主进程
├── httpserver/             # Go HTTP 服务 (KOReader/OPDS)
├── public/                 # 静态资源 + WASM 库
├── android/                # Android 工程（Capacitor 生成）
├── capacitor.config.ts     # Capacitor 配置（appId 需与桌面 build.appId 对齐）
├── src/
│   ├── assets/             # 阅读引擎、多语言、样式、图片
│   ├── components/         # 可复用 UI 组件（books, dialogs, popups, searchBox ...）
│   ├── constants/          # 常量定义
│   ├── containers/         # 容器组件 (Redux stateful)：lists / panels / settings / sidebar / viewer
│   ├── models/             # 数据模型 (Book, Bookmark, Note, HtmlBook, Plugin)
│   ├── pages/              # 页面级组件 (manager, reader, login, redirect, stats)
│   ├── platform/           # 平台抽象层（Electron / Capacitor / Web 检测与适配）
│   ├── router/             # React Router 路由配置
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # file / reader / request / storage 工具
├── scripts/                # 构建/测试脚本（smoke-test.js 等）
└── assets/                 # 构建资源 (图标、安装配置)
```

## Android 发布说明

- 包名：`xyz.freekoodo.reader`（桌面 `build.appId`、Capacitor `appId`、Android `applicationId` 三者必须一致，CI 有对齐检查）。
- 签名：release APK 使用 `android/app/keystore/free-koodo-reader.jks`，凭据在 `android/app/keystore.properties`；CI 可用 Secrets（`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`）覆盖。
- 版本：`package.json` `version` 与 `android/app/build.gradle` 的 `versionCode`/`versionName` 需同步递增。

## 开发流程建议

1. 先阅读相关模块的 `interface.tsx`、`actions`、`reducers` 和现有测试/示例。
2. 修改前确认是否涉及 IPC、数据库、阅读引擎或 i18n，遵循上述约束。
3. 修改后运行 `yarn test` / `yarn lint` 或相关局部验证，并手动回归受影响的阅读器功能。
4. 展示改动说明，由用户决定是否提交。
