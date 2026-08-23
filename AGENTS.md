# AGENTS.md

本文件为 AI 编码助手在本仓库工作时的简要指引。更详细的背景请同时参考 `CLAUDE.md`。

## 项目简介

Koodo Reader 是一个跨平台电子书阅读器，基于 Electron + React (CRA) + Redux 构建。

## 四层架构

| 层 | 位置 | 职责 |
|---|------|------|
| Electron 主进程 | `main.js` | IPC handlers、SQLite (better-sqlite3)、云同步、原生集成 |
| React 渲染进程 | `src/` | UI、Redux 状态管理、书籍渲染 |
| 阅读引擎 | `src/assets/lib/kookit-extra.min.mjs` | 闭源 ESM — 书籍解析、SQL 语句、同步工具 |
| Go HTTP 服务 | `httpserver/` | 可选的 KOReader / OPDS 集成 |

## 关键约束

- **不要读取或修改** `src/assets/lib/` 下的这些混淆/压缩文件：
  - `kookit-extra.min.mjs`
  - `kookit.min.js`
  - `kookit-extra-browser.min.js`
  - 如需查阅源码，请参考本地源码仓库（如 `D:\Project\kookit`、`D:\Project\kookit-extra`）。
- **不要主动提交代码**：除非用户明确要求，否则不执行 `git commit`、`git push` 等操作。
- 用户可见文本必须使用 `react-i18next` 的 `t("key")`，不得硬编码。
- TypeScript 避免 `any`，在 `interface.tsx` 中定义类型。
- Redux 状态类型使用 `stateType`（定义在 `src/store/index.tsx`）。
- 不要从渲染进程直接操作 SQLite；所有数据库操作必须通过 `database-command` IPC。
- 新增 i18n key 需在 `src/assets/locales/en.json` 中添加。
- 修改 `src/utils/reader/` 下工具函数会影响 iframe 中书籍渲染，需手动回归测试。
- 添加窗口打开通道时遵循 `new-tab` → `WebContentsView` / `open-book` → `BrowserWindow` 模式。
- 所有 IPC 参数需校验后再执行文件系统/数据库/Shell 操作。
- 不要将令牌、密码或完整书籍路径记录到 info 级别日志。

## 关键 IPC 通道

- `open-book` / `new-tab` / `exit-tab` — 窗口生命周期
- `database-command` — 数据库操作（唯一数据库入口）
- `cloud-upload` / `cloud-download` — 云同步
- `before-reader-close` → `reader-close-ready` — 阅读器两阶段关闭

## Redux 切片

`book`、`reader`、`manager`、`viewArea`、`backupPage`、`sidebar`、`progressPanel`

每个切片在 `src/store/actions/` 和 `src/store/reducers/` 中各有一个文件。

## 页面路由

- `/manager/*` — 主界面（书库、笔记、回收站等）
- `/epub`、`/pdf`、`/mobi`、`/txt`、`/md` 等格式路径 — 阅读器
- `/login`、`/stats`、`/redirect`

## 支持的电子书格式

EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, HTML/XML/XHTML/MHTML/HTM

## 常用命令

```bash
# 安装依赖（初次）
yarn

# 桌面开发模式（Electron + React 热重载）
yarn dev

# Web 开发模式（仅浏览器）
yarn start

# 构建生产版本
yarn build

# 运行测试
yarn test

# 打包分发
yarn release

# 重新编译原生模块
yarn rebuild
```

## 项目结构（概要）

```
.
├── main.js                 # Electron 主进程
├── httpserver/             # Go HTTP 服务 (KOReader/OPDS)
├── public/                 # 静态资源 + WASM 库 (7z, unrar, pdfjs)
├── src/
│   ├── assets/             # 阅读引擎、多语言、样式、图片
│   ├── components/         # 可复用 UI 组件
│   ├── constants/          # 常量定义
│   ├── containers/         # 容器组件 (Redux stateful)
│   │   ├── lists/          # 列表 (bookList, cardList, noteList, navList, contentList)
│   │   ├── panels/         # 面板 (navigationPanel, operationPanel, progressPanel, settingPanel)
│   │   ├── settings/       # 设置页面各选项卡
│   │   ├── sidebar/        # 侧边栏
│   │   └── viewer/         # 书籍阅读视图
│   ├── models/             # 数据模型 (Book, Bookmark, Note, HtmlBook, Plugin)
│   ├── pages/              # 页面级组件 (manager, reader, login, redirect, stats)
│   ├── router/             # React Router 路由配置
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # 工具函数 (file, reader, request, storage)
├── scripts/                # 构建脚本
└── assets/                 # 构建资源 (图标、安装配置)
```

## 开发流程建议

1. 先阅读相关模块的 `interface.tsx`、`actions`、`reducers` 和现有测试/示例。
2. 修改前确认是否涉及 IPC、数据库、阅读引擎或 i18n，遵循上述约束。
3. 修改后运行 `yarn test` 或相关局部验证，并手动回归受影响的阅读器功能。
4. 展示改动说明，由用户决定是否提交。
