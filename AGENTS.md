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
- **测试套件（`yarn test`，57 个用例）**：i18n 完整性（en↔zh-CN key 一致）、平台检测（含移动桥接 shim）、WebDAV 单元 + 真实 HTTPS 服务器冒烟、**IPC 契约**（preload 白名单 ↔ main.js 处理器双向校验）、**preload 安全边界**（通道白名单/fs/path/crypto/错误传播）、**数据库服务**（isElectron=false 浏览器模式 CRUD）、**打包守卫**（`build.files` 覆盖 main 进程 require 图，防止 "Cannot find module" 启动崩溃，v3.0.4 教训）。新增关键逻辑时同步补充测试。
- **注意**：`build/`（渲染器产物）被 git 忽略，任何打包（`yarn release`、release workflow）都必须先执行 `yarn build`，否则会发布白屏版本。CI 与 release workflow 已内置缺失检查与冒烟测试；release workflow 另有**打包产物冒烟**（ubuntu 上 `electron-builder --dir` 后在 Xvfb 启动打包产物并断言 `KOODO_SMOKE_RESULT: PASS`，通过后才执行 `--publish always`）。
- **WebDAV 冒烟测试**：`yarn test` 中的 `webdavLive.test.ts` 会启动真实 HTTPS WebDAV 服务器（自签名测试证书 fixture），用生产 `WebDavService`（渲染端）跑完整的 建目录→上传→存在性→列表→下载比对→删除，并校验 HTTPS-only 策略；`webdavCloudLive.test.ts` 对主进程层 `webdavCloud.js`（打包后 cloud-upload/download 的实际代码路径）做同样的真服务器往返，并验证"服务器连上但不响应"时请求会被绝对超时中止而不是永久挂起。修改 `src/utils/storage/webdavService.ts` 或 `webdavCloud.js` 后必须运行 `yarn test`。

## GitHub CI/CD 协调模式

### 远程仓库布局

- `origin` = 上游 `koodo-reader/koodo-reader`：**只读**（push 返回 403），仅用于同步上游。
- `fork` = `NIyueeE/free-koodo-reader`：实际开发与发布仓库（gh CLI 登录账号 `NIyueeE`）。**main 提交和 `v*` tag 都推送到 fork**，全部历史 Release 都在 fork 上；签名等 Actions Secrets 也配置在 fork。
- 提交说明遵循 conventional style（`fix(...)`/`feat(...)`/`chore(release): bump version to X.Y.Z`）。

### Workflow 拓扑

| Workflow | 触发 | 阶段 |
|---|---|---|
| `ci.yml` | push 到 main / PR | 类型检查 → ESLint（零警告）→ 测试 → 打包守卫 → 生产构建 → GUI 冒烟 → Android debug APK |
| `release.yml` | push `v*` tag（或手动） | ① verify：类型/lint/测试/渲染器构建 → 上传 `web-build` artifact；② 三平台打包（ubuntu / windows / arm64）：下载 artifact → ubuntu 先 `electron-builder --dir` + 打包产物冒烟 → `--publish always`（electron-builder 用 `GH_TOKEN` 自动创建 release 并上传产物）；③ android：`yarn build` + `cap sync` + `assembleRelease` 签名 APK → 校验签名与渲染器 → `gh release upload` → `gh release edit --draft=false --latest` |

### 发布 SOP

1. 同步递增版本：`package.json` `version` 与 `android/app/build.gradle` `versionCode`/`versionName`（versionCode = 主×1000 + 次×100 + 修订，如 3.0.6 → 3006）。
2. `git push fork main`，等 `ci.yml` 全绿：`gh run watch <run-id> -R NIyueeE/free-koodo-reader --exit-status`。
3. `git tag -a vX.Y.Z -m "..."` 并 `git push fork vX.Y.Z`，release workflow 自动启动（全程约 20 分钟）。**不要**手动预先创建 release（electron-builder 会自动建）。
4. 结束后校验：`gh release view vX.Y.Z -R NIyueeE/free-koodo-reader` —— 必须 `isDraft=false`、`isPrerelease=false`、18 个产物齐全（Win x64/ia32/arm64 exe+blockmap、Portable、Zip；Linux x64/arm64 AppImage/deb、rpm、snap；`app-release.apk`；自动更新元数据 `latest*.yml` ×3）。
5. 写发布说明：workflow 创建的 release 初始 **body 为空、标题为 "X.Y.Z"**，用 `gh release edit vX.Y.Z -R NIyueeE/free-koodo-reader --title "Free Koodo Reader vX.Y.Z" --notes-file <file>` 补全。风格对齐历史 note：英文、`# Free Koodo Reader vX.Y.Z` 标题 + 一段加粗导语 + `##` 分节（每条加粗导语句）+ 末尾 Testing/Verification 节。

### 注意事项

- 渲染器 `build/` 不入库，永远不要绕过 CI 守卫手工发布；workflow 内置产物缺失检查与打包冒烟。
- 长任务监控用 `gh run watch <run-id> --exit-status`（后台运行），不要轮询 `gh run list`。
- 本仓库 shell 任务里清理进程用 `pkill electron` / `pkill Xvfb`（按进程名）；`pkill -f electron` 会匹配到自身命令行导致脚本自杀。

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

## 移动端（窄屏）布局适配工作流

适配对象：手机竖屏（Android/Capacitor 与窄桌面窗口共用一套规则）。**断点契约**：`isNarrowScreen()`（`window.innerWidth <= 768`，`src/platform/index.ts`）与 CSS `@media (max-width: 768px)`（`src/assets/styles/responsive.css`）必须保持一致；窄屏下侧边栏自动折叠为 70px 图标条，且 JS 会把 `isCollapsed=yes` 持久化到配置（窄窗口测试会污染该配置）。

### 级联规则（覆盖失效的根因）

- `responsive.css` 经 `global.css` 在应用入口**最先**加载；组件 CSS 在其后加载，同优先级规则**后者胜**。
- 组件样式里已有 `!important`（如 `.book-operation-panel { width: 450px !important }`），媒体查询覆盖必须用 `body` 前缀（或双写类名）+ `!important` 拿下优先级。
- 组件的 JS 内联样式（阅读面板锁定时的 `marginLeft`、header 的 `marginLeft`/`width` 等）只能被带 `!important` 的 CSS 覆盖。
- JS 定位的浮层（`.action-dialog-container` 200px 上下文菜单）靠 `clampMenuPosition()` 自适应视口，**不要**在媒体查询里强制全宽。

### 桌面固定尺寸清单（窄屏必须覆盖，改版时先查此表）

| 元素 | 桌面值 | 窄屏策略 |
|---|---|---|
| `.book-list-cover-item`（封面+详情卡） | 400px | 100% 流式行（封面 105px + 元信息） |
| `.card-list-item`（笔记/摘录卡） | min-width 330px | 100% 单列（组件会内联 `calc(50vw - 70px)`，需 `!important`） |
| `.operation-panel-container` / `.progress-panel-container`（阅读器上/下面板） | 450px | 100vw（index.css 与组件 CSS 都写了 450px，两处都要压住） |
| `.navigation-panel-container` / `.setting-panel-container`（阅读器抽屉） | 299px | `min(299px, 88vw)`；JS 关闭偏移是 `translateX(±309px)`，抽屉宽度**不得超过 309px** 否则关不严 |
| `.setting-dialog-container` | 760px | 已在 responsive.css 适配（侧栏横向滚动） |

### 引擎适配契约

- 所有 `BookHelper.getRendition(...)` 调用必须传 `isMobile: isMobileDevice() ? "yes" : "no"`，禁止硬编码 `"no"`。
- `isMobile: "yes"` 时引擎会劫持 `console.*` 并把书内事件（链接点击、捏合缩放、滚动到底）发到 `window.ReactNativeWebView.postMessage`——该对象只存在于上游 React Native 壳。`src/index.tsx` 启动时调用 `installMobileBridge()`（幂等 shim，`src/platform/index.ts`）兜底；缺失时第一次日志/手势即抛 `Cannot read properties of undefined (reading 'postMessage')`。
- 阅读模式默认值：`ConfigService.getReaderConfig("readerMode") || (isMobileDevice() ? "single" : "double")`——手机竖屏禁止默认双页（每栏仅 ~180px）。

### 截图回归 harness（改布局必须跑）

```bash
# 依赖：xvfb、libgtk-3-0、libasound2（沙箱/容器重建后常被重置，需重装）
Xvfb :99 -screen 0 1200x900x24 &
DISPLAY=:99 node scripts/mobile-screenshot.js /tmp/shots phone   # phone | desktop | both；--fresh 清空书库
```

- 原理：spawn 真实 Electron（`--remote-debugging-port` + CDP），`Emulation.setDeviceMetricsOverride` 强制 390×844，自动生成演示 EPUB 并合成 DragEvent 导入，遍历书库（首页/卡片/封面/列表视图、笔记、回收站、设置、搜索、导入菜单、上下文菜单）与阅读器四面板，逐状态输出 PNG。
- 验收标准：phone 轮检查无溢出/裁切/压缩；**desktop 轮结果必须与改动前一致**（回归底线）。
- 坑：被 SIGKILL 的运行会留下 Chromium `SingletonLock`，下次启动静默失败（脚本已自动清理）；CI 容器里 `/tmp/.X11-unix`、`xvfb`、GUI 库可能丢失，先确认 `which Xvfb` 与 `ldd node_modules/electron/dist/electron | grep "not found"`。

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
node scripts/mobile-screenshot.js /tmp/shots phone  # 窄屏截图回归 harness（需 Xvfb；phone|desktop|both，--fresh 清库）
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
4. 涉及窄屏布局（responsive.css、书库列表、阅读面板）时，按"移动端（窄屏）布局适配工作流"跑 phone + desktop 两轮截图 harness，desktop 必须与改动前一致。
5. 用户要求发布时，按"GitHub CI/CD 协调模式 → 发布 SOP"执行（版本三处同步 → push fork main 等 CI 绿 → tag → 校验 release → 补发布说明）。
6. 展示改动说明，由用户决定是否提交。
