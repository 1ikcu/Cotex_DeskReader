# Cotex

Cotex 是一款 Windows 小说阅读器，采用受 Codex 启发的工作聊天界面。打开一本书，就像打开一段聊天。

- 导入 TXT 和无 DRM 的 EPUB，也可把文件拖入窗口。
- 用目录、章号或标题关键词跳转，添加书签，自动保存章节和段落位置。
- 搜索公版名著和部分中文书源的公开章节。书库和阅读进度保存在本地。

## 下载与使用

前往 [最新版本下载页](https://github.com/BrokenHT/Cotex_DeskReader/releases/latest)。安装版为 `Cotex-1.0.0-Setup.exe`，免安装版为 `Cotex-1.0.0-Portable.exe`。

启动后点击「新聊天」导入一本书。阅读时可在底部输入框输入章号或标题关键词，按 Enter 跳转。

## 从源码运行

需要 Windows x64 和 Node.js 22.12 或以上版本。

```powershell
npm ci
npm run build
npm start
```

运行 `npm test` 执行单元测试。构建、快捷键和书源说明见 [README.txt](README.txt)。

Cotex 是独立项目。源码采用 [MIT 许可](LICENSE)，内置文本的来源与许可见 [assets/SOURCES.txt](assets/SOURCES.txt)。
