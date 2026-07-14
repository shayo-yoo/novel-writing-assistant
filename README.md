# 小说写作助手

本扩展为 VS Code 中的小说及长篇文本创作提供轻量级写作辅助功能。

## 功能特性
- 显示平均打字速度（每分钟字数及每小时字数）。
- 统计总运行时长和有效打字时长，在无新输入 5 秒后自动暂停计时。
- 支持多种统计方式：字词数、汉字、汉字(不含标点)、CJK字符、非空白字符、字符数、非ASCII码位、码位数。
- 支持从编辑器上下文菜单中为选中文本添加自定义颜色的高亮标记。
- 可通过 VS Code 设置 UI 直接配置扩展选项，并兼容独立配置文件。
- 界面文字支持简体中文和英文。

## 配置说明
可以通过 VS Code 设置搜索 `novelWritingAssistant` 进行配置，常用设置包括：
- `novelWritingAssistant.enabledFileExtensions`：启用的文件格式。
- `novelWritingAssistant.highlightItems`：高亮规则列表，每个对象包含 `text` 和 `color`。
- `novelWritingAssistant.countMode`：可设置为 `words`、`hanzi`、`hanziWithoutPunctuation`、`cjkCharacters`、`nonWhitespaceCharacters`、`characters`、`nonAsciiCodePoints` 或 `codePoints`。

扩展仍保留 `novel-writing-assistant.config.json` 文件兼容性，可继续通过该文件修改设置。

## 使用方法
- 在命令面板中搜索“小说写作助手”即可快速找到扩展命令。
- 使用“打开写作助手设置”命令直接打开 VS Code 设置页面。

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
- Supports multiple count modes: word count, Hanzi, Hanzi without punctuation, CJK characters, non-whitespace characters, characters, non-ASCII code points, and code points.
- Supports highlighting selected text from the editor context menu with custom colors.
- Can be configured through VS Code settings UI, with fallback compatibility for a standalone config file.
- Supports simplified Chinese and English interface text.

## Configuration
Search `novelWritingAssistant` in VS Code settings to change options such as:
- `novelWritingAssistant.enabledFileExtensions`
- `novelWritingAssistant.highlightItems`
- `novelWritingAssistant.countMode`：可设置为 `words`、`hanzi`、`hanziWithoutPunctuation`、`cjkCharacters`、`nonWhitespaceCharacters`、`characters`、`nonAsciiCodePoints` 或 `codePoints`

The extension also supports reading settings from `novel-writing-assistant.config.json` for backward compatibility.

## Usage
- Open the command palette and search for "Novel Writing Assistant" to access commands.
- Use the "Open extension settings" command to jump directly to the VS Code settings page.

## Development
Run:
- `npm install`
- `npm run compile`
