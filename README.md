# 小说写作助手

本扩展为 VS Code 中的小说及长篇文本创作提供轻量级写作辅助功能。

## 功能特性
- 显示平均打字速度（每分钟字数及每小时字数）。
- 统计总运行时长和有效打字时长，在无新输入 5 秒后自动暂停计时。
- 显示当前文档的字符总数。
- 支持从编辑器上下文菜单中为选中文本添加自定义颜色的高亮标记。
- 从独立的配置文件 `novel-writing-assistant.config.json` 读取设置，不依赖 VS Code 内置配置。
- 在资源管理器区域提供可视化仪表板面板，用于状态显示和参数调整。
- 界面文字支持简体中文和英文。

## 配置说明
编辑 [novel-writing-assistant.config.json](novel-writing-assistant.config.json) 文件可修改：
- 启用的文件扩展名
- 高亮规则及对应颜色

## 开发指南
运行以下命令：
- `npm install`
- `npm run compile`



---



# Novel Writing Assistant

This extension provides a lightweight writing aid for VS Code novels and long-form text work.

## Features
- Shows average typing speed per minute and per hour.
- Tracks total runtime and active typing duration, pausing after 5 seconds without new input.
- Displays the current document character count.
- Supports highlighting selected text from the editor context menu with custom colors.
- Reads configuration from a standalone file named novel-writing-assistant.config.json instead of VS Code settings.
- Includes a more visual dashboard panel in the explorer area for status display and settings.
- Supports simplified Chinese and English interface text.

## Configuration
Edit the file [novel-writing-assistant.config.json](novel-writing-assistant.config.json) to change:
- enabled file extensions
- highlight rules and colors

## Development
Run:
- npm install
- npm run compile
