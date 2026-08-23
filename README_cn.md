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
- 平台支持：Windows、Linux、Web
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
```

## 仓库

- GitHub：https://github.com/NIyueeE/free-koodo-reader
- 默认分支：`main`
- 问题 / 反馈：https://github.com/NIyueeE/free-koodo-reader/issues

## 许可证

本项目基于 Koodo Reader，使用 AGPL-3.0 许可证。详见 [LICENSE](./LICENSE)。
