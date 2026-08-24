# AGENTS.md

本文件为 AI 编码助手在本仓库工作时的完整指引。更详细的背景请同时参考 `README.md` 和 `HANDOFF.md`。

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

**不要尝试读取或修改** `src/assets/lib/` 下的这些文件：
- `kookit-extra.min.mjs`
- `kookit.min.js`
- `kookit-extra-browser.min.js`

这些是混淆/压缩后的产物，无法阅读。如需查阅源码，请直接读取本地源码仓库：
- `D:\Project\kookit`
- `D:\Project\kookit-extra`

## 当前目标

下一个目标是**完成 Android 端开发**。当前推荐方案是：

- 使用 **Capacitor** 包装现有 Web 构建。
- 在 `src/platform/` 中建立平台抽象层，替换 `window.electronAPI` 的直接调用。
- 桌面端继续走 Electron，Android 端走 Capacitor。
- 详细分析和迁移计划见 `HANDOFF.md`。

## 默认分支与 CI

- 默认分支：`main`
- 开发流程：在 `main` 上直接修改并推送，CI 会自动运行类型检查、ESLint（零警告）、单元测试、生产构建、GUI 冒烟测试（Xvfb 下启动真实 Electron 验证渲染器挂载）和 Android debug APK 构建。
- **注意**：`build/`（渲染器产物）被 git 忽略，任何打包（`yarn release`、release workflow）都必须先执行 `yarn build`，否则会发布白屏版本。CI 与 release workflow 已内置缺失检查与冒烟测试。

## 关键 IPC 通道

- `open-book` / `new-tab` / `exit-tab` — 窗口生命周期
- `database-command` — 数据库操作（所有数据库操作必须通过此通道）
- `cloud-upload` / `cloud-download` — 云同步
- `before-reader-close` → `reader-close-ready` — 阅读器两阶段关闭

## Redux 与容器模式

- Redux 切片：`book`, `reader`, `manager`, `viewArea`, `backupPage`, `sidebar`, `progressPanel`；每个切片在 `src/store/actions/` 和 `src/store/reducers/` 中各有一个文件。
- 状态类型使用 `stateType`（定义在 `src/store/index.tsx`），所有 `mapStateToProps` 应使用此类型。
- Container 模式：`index.tsx` (Redux connect) → `component.tsx` → `interface.tsx`，位于 `src/containers/` 下。

## 页面路由与格式支持

- 页面路由：`/manager/*`（主界面：书库、笔记、回收站等）；`/epub`、`/pdf`、`/mobi`、`/txt`、`/md` 等格式路径（阅读器）；`/login`、`/stats`、`/redirect`。
- 支持的电子书格式：EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, HTML/XML/XHTML/MHTML/HTM。

## 关键约束

- **不要主动提交代码**：除非用户明确要求，否则不执行 `git commit`、`git push` 等操作。
- **不包含任何官方云服务**：不要重新引入 Koodo 官方账号、登录、Pro、付费、AI 云服务、官方 API/域名。
- WebDAV 同步使用 `webdav` 开源包，**仅支持 HTTPS**，凭据本地加密存储。
- **Android 开发约束**：
  - 新代码不要直接调用 `window.electronAPI`，应通过 `src/platform/` 抽象层。
  - 保持 Web 构建始终可用；桌面端继续走 Electron。
  - Android 数据库优先使用 `sql.js` WASM 或 Capacitor SQLite，不使用 `better-sqlite3`。
  - Android 文件访问使用 Capacitor Filesystem / Storage Access Framework，不使用 Electron `fs`。
  - 新增 Android 相关代码时同步更新 `HANDOFF.md`。
- 用户可见文本必须使用 `react-i18next` 的 `t("key")`，不得硬编码。
- TypeScript 避免 `any`，在 `interface.tsx` 中定义类型。
- 不要从渲染进程直接操作 SQLite；所有数据库操作必须通过 `database-command` IPC。
- 新增 i18n key 需在 `src/assets/locales/en.json` 中添加。
- 修改 `src/utils/reader/` 下工具函数会影响 iframe 中书籍渲染，需手动回归测试。
- 添加窗口打开通道时遵循 `new-tab` → `WebContentsView` / `open-book` → `BrowserWindow` 模式。
- 所有 IPC 参数需校验后再执行文件系统/数据库/Shell 操作。
- 不要将令牌、密码或完整书籍路径记录到 info 级别日志。

## 常用命令

```bash
yarn          # 安装依赖
yarn dev      # 桌面开发模式
yarn start    # Web 开发模式
yarn build    # 生产构建（打包前必须执行，build/ 被 git 忽略）
yarn test     # 运行测试
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
├── HANDOFF.md              # 项目交接 / Android 迁移计划
├── main.js                 # Electron 主进程
├── httpserver/             # Go HTTP 服务 (KOReader/OPDS)
├── public/                 # 静态资源 + WASM 库
├── android/                # Android 工程（Capacitor 生成）
├── capacitor.config.ts     # Capacitor 配置（appId 需与桌面 build.appId 对齐）
├── src/
│   ├── assets/             # 阅读引擎、多语言、样式、图片
│   ├── components/         # 可复用 UI 组件（books, dialogs, popups, searchBox ...）
│   ├── constants/          # 常量定义
│   ├── containers/         # 容器组件 (Redux stateful)
│   │   ├── lists/          # 列表 (bookList, cardList, noteList, navList, contentList)
│   │   ├── panels/         # 面板 (navigationPanel, operationPanel, progressPanel, settingPanel)
│   │   ├── settings/       # 设置页面各选项卡
│   │   ├── sidebar/        # 侧边栏
│   │   └── viewer/         # 书籍阅读视图
│   ├── models/             # 数据模型 (Book, Bookmark, Note, HtmlBook, Plugin)
│   ├── pages/              # 页面级组件 (manager, reader, login, redirect, stats)
│   ├── platform/           # 平台抽象层（Electron / Capacitor / Web 检测与适配）
│   ├── router/             # React Router 路由配置
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # 工具函数
│       ├── file/           # 文件操作 (bookUtil, coverUtil, fontUtil, sqlUtil, export, backup, restore)
│       ├── reader/         # 阅读器逻辑 (highlightUtil, noteUtil, styleUtil, ttsUtil, themeUtil, etc.)
│       ├── request/        # HTTP 请求
│       └── storage/        # 存储服务 (databaseService, syncService)
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
