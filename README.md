# Cotex for Ubuntu

Cotex 是一款本地优先的桌面小说阅读器，使用类似 Codex 的工作对话界面。它支持导入 TXT 和无 DRM 的 EPUB、按章节跳转、书签、阅读进度保存，以及多个公开书源检索。

> 本项目是 Cotex 的 Ubuntu 适配版本，应用本身与 OpenAI 无隶属关系。

## 仓库地址

| 版本 | 仓库 |
| --- | --- |
| 原 Windows 版本 | [BrokenHT/Cotex_DeskReader](https://github.com/BrokenHT/Cotex_DeskReader) |
| Ubuntu 版本 | [1ikcu/Cotex_DeskReader](https://github.com/1ikcu/Cotex_DeskReader) |

Windows 用户请前往原仓库；Ubuntu 用户建议使用本仓库发布的 Linux 安装包。

## 下载与安装

前往 [Ubuntu 版本 Releases](https://github.com/1ikcu/Cotex_DeskReader/releases/latest) 下载适合的文件。目前提供 x86_64/amd64 架构版本。

### deb 安装包（推荐）

下载 `Cotex-1.0.0-amd64.deb` 后，在文件所在目录运行：

```bash
sudo apt install ./Cotex-1.0.0-amd64.deb
```

安装完成后，可以从 Ubuntu 应用菜单启动 Cotex，也可以在终端运行：

```bash
cotex
```

卸载应用：

```bash
sudo apt remove cotex
```

卸载不会自动删除书库和阅读进度。

### AppImage 免安装版

下载 `Cotex-1.0.0-x86_64.AppImage` 后运行：

```bash
chmod +x Cotex-1.0.0-x86_64.AppImage
./Cotex-1.0.0-x86_64.AppImage
```

如果系统提示缺少 FUSE，可安装对应依赖：

```bash
# Ubuntu 22.04
sudo apt install libfuse2

# Ubuntu 24.04 及更新版本
sudo apt install libfuse2t64
```

也可以不安装 FUSE，直接使用 AppImage 的解包运行模式：

```bash
./Cotex-1.0.0-x86_64.AppImage --appimage-extract-and-run
```

## 使用说明

- 点击「新对话」导入 TXT 或无 DRM 的文字 EPUB，也可以直接把文件拖入窗口。
- 在底部输入框输入章节序号、章回名称或标题关键词，按 Enter 跳转。
- 「已安排」用于继续上次阅读位置，「插件」打开书签，「Pull Request」检查目录更新。
- 左下角阅读进度图标用于查看阅读进度，帮助图标用于打开书库。
- 应用会自动保存当前章节、段落位置、书签和界面设置。
- 在线书源只会接收搜索词；本地导入的小说不会上传。

常用快捷键：

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+O` | 导入小说 |
| `Ctrl+K` | 打开书库 |
| `Ctrl+F` | 聚焦章节搜索 |
| `Ctrl+D` | 保存当前位置书签 |
| `Alt+←` / `Alt+→` | 上一章 / 下一章 |
| `Space` | 切换工作摘要 |

## 本地数据

Ubuntu 默认将书库、设置、书签和阅读进度保存在：

```text
~/.config/DeskReader/
```

如果设置了 `XDG_CONFIG_HOME`，则数据位于：

```text
$XDG_CONFIG_HOME/DeskReader/
```

原始导入文件不会被修改。建议在设置中定期使用「备份书库」导出备份；从 Windows 版本迁移时，也可以先在 Windows 版本导出备份，再在 Ubuntu 版本中恢复。

## 从源码运行

建议使用 Ubuntu 22.04 或更新版本、x86_64 架构，以及 Node.js 22.12 或更新版本。

```bash
git clone https://github.com/1ikcu/Cotex_DeskReader.git
cd Cotex_DeskReader
npm ci
npm run build
npm start
```

开发模式：

```bash
npm run dev
```

另开一个终端运行：

```bash
DESKREADER_DEV_URL=http://127.0.0.1:5173 npm start
```

## 测试与打包

运行单元测试和生产构建：

```bash
npm test
npm run build
```

生成 AppImage 和 deb 安装包：

```bash
npm run dist:linux
```

构建结果位于 `release/` 目录。

## 支持格式与限制

- 支持 TXT、无 DRM 的文字 EPUB。
- 单个导入文件最大 60 MB，EPUB 解压后的资源总量最大 150 MB。
- 支持 UTF-8、GB18030 和 UTF-16 文本编码。
- VIP、需要登录或原站已删除的在线章节不会绕过原站限制。
- 在线搜索和公开章节读取会受到对应书源可用性的影响。

## 许可

本项目源码采用 [MIT License](LICENSE)。第三方依赖和内置公版文本遵循各自许可，文本来源说明见 [assets/SOURCES.txt](assets/SOURCES.txt)。
