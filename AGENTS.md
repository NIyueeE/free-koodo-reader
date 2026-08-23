# AGENTS.md

本文件为 AI 编码助手在本仓库工作时的简要指引。更详细的背景请同时参考 `CLAUDE.md` 和 `README.md`。

## 项目简介

Free Koodo Reader 是一个本地优先、无官方云服务的跨平台电子书阅读器，基于 Electron + React (CRA) + Redux 构建。

## 默认分支

- 默认分支：`main`
- 开发流程：在 `main` 上直接修改并推送，CI 会自动运行类型检查和构建。

## 关键约束

- **不要读取或修改** `src/assets/lib/` 下的混淆/压缩文件：
  - `kookit-extra.min.mjs`
  - `kookit.min.js`
  - `kookit-extra-browser.min.js`
- **不要主动提交代码**：除非用户明确要求，否则不执行 `git commit`、`git push` 等操作。
- **不包含任何官方云服务**：不要重新引入 Koodo 官方账号、登录、Pro、付费、AI 云服务、官方 API/域名。
- WebDAV 同步使用 `webdav` 开源包，**仅支持 HTTPS**，凭据本地加密存储。
- 用户可见文本必须使用 `react-i18next` 的 `t("key")`，不得硬编码。
- TypeScript 避免 `any`，在 `interface.tsx` 中定义类型。
- Redux 状态类型使用 `stateType`（定义在 `src/store/index.tsx`）。
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
yarn build    # 生产构建
yarn test     # 运行测试
yarn release  # 打包分发
yarn rebuild  # 重新编译原生模块
```

## 项目结构（概要）

```
.
├── main.js                 # Electron 主进程
├── httpserver/             # Go HTTP 服务 (KOReader/OPDS)
├── public/                 # 静态资源 + WASM 库
├── src/
│   ├── assets/             # 阅读引擎、多语言、样式、图片
│   ├── components/         # 可复用 UI 组件
│   ├── constants/          # 常量定义
│   ├── containers/         # 容器组件 (Redux stateful)
│   ├── models/             # 数据模型
│   ├── pages/              # 页面级组件
│   ├── router/             # React Router 路由配置
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # 工具函数
├── scripts/                # 构建脚本
└── assets/                 # 构建资源
```

## 开发流程建议

1. 先阅读相关模块的 `interface.tsx`、`actions`、`reducers` 和现有测试/示例。
2. 修改前确认是否涉及 IPC、数据库、阅读引擎或 i18n，遵循上述约束。
3. 修改后运行 `yarn test` 或相关局部验证，并手动回归受影响的阅读器功能。
4. 展示改动说明，由用户决定是否提交。
