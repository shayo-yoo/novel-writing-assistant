import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface HighlightRule {
  text: string;
  color: string;
}

interface AssistantConfig {
  enabledFileExtensions: string[];
  highlightItems: HighlightRule[];
}

interface DashboardState {
  title: string;
  language: string;
  runtime: string;
  activeTyping: string;
  speedPerMinute: string;
  speedPerHour: string;
  wordCount: string;
  supportedStatus: string;
  extensions: string;
  rules: HighlightRule[];
  placeholder: string;
  buttons: {
    refresh: string;
    openConfig: string;
    addSelection: string;
    clearRules: string;
    save: string;
  };
  labels: {
    runtime: string;
    typing: string;
    speed: string;
    words: string;
    fileTypes: string;
    highlightRules: string;
    extensionHint: string;
    ruleHint: string;
    statusEnabled: string;
    statusDisabled: string;
    languageLabel: string;
  };
}

const EXTENSION_NAME = 'novel-writing-assistant';
const CONFIG_FILE_NAME = `${EXTENSION_NAME}.config.json`;
const DEFAULT_CONFIG: AssistantConfig = {
  enabledFileExtensions: ['md', 'txt', 'markdown', 'json', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'html', 'css', 'xml'],
  highlightItems: []
};

const TRANSLATIONS: Record<string, Record<string, string>> = {
  'zh-CN': {
    dashboardTitle: '小说写作助手',
    runtime: '运行时长',
    typing: '有效输入',
    speed: '输入速度',
    words: '字数',
    fileTypes: '生效文件格式',
    highlightRules: '高亮规则',
    extensionHint: '输入多个文件格式，用英文逗号分隔',
    ruleHint: '每行一个规则，格式：文本|颜色',
    statusEnabled: '当前文件已启用',
    statusDisabled: '当前文件不在规则范围内',
    languageLabel: '界面语言',
    placeholder: '例如：她|#ffeb3b',
    refresh: '刷新',
    openConfig: '打开配置文件',
    addSelection: '添加当前选中',
    clearRules: '清空规则',
    save: '保存设置',
    saveSuccess: '设置已保存。',
    saveError: '保存失败，请检查配置内容。',
    selectedAdded: '已将当前选中文本加入高亮列表。',
    rulesCleared: '已清空所有高亮规则。'
  },
  en: {
    dashboardTitle: 'Novel Writing Assistant',
    runtime: 'Runtime',
    typing: 'Active typing',
    speed: 'Typing speed',
    words: 'Words',
    fileTypes: 'Enabled file types',
    highlightRules: 'Highlight rules',
    extensionHint: 'Enter multiple file formats separated by commas',
    ruleHint: 'One rule per line, format: text|color',
    statusEnabled: 'Current file is enabled',
    statusDisabled: 'Current file is outside the allowed scope',
    languageLabel: 'Interface language',
    placeholder: 'Example: she|#ffeb3b',
    refresh: 'Refresh',
    openConfig: 'Open config file',
    addSelection: 'Add current selection',
    clearRules: 'Clear rules',
    save: 'Save settings',
    saveSuccess: 'Settings saved.',
    saveError: 'Could not save settings. Please check the content.',
    selectedAdded: 'The current selection has been added to the highlight list.',
    rulesCleared: 'All highlight rules have been cleared.'
  }
};

let config: AssistantConfig = DEFAULT_CONFIG;
let extensionContext: vscode.ExtensionContext | undefined;
let runtimeStatusBar: vscode.StatusBarItem;
let typingStatusBar: vscode.StatusBarItem;
let speedStatusBar: vscode.StatusBarItem;
let wordCountStatusBar: vscode.StatusBarItem;

let windowOpenTime = Date.now();
let typingAccumulatedMs = 0;
let typingSegmentStart = Date.now();
let typingActive = true;
let lastInputTime = Date.now();
let typedCharactersCount = 0;
let timer: NodeJS.Timeout | undefined;
const decorationTypes: vscode.TextEditorDecorationType[] = [];
let viewProvider: NovelWritingAssistantViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  runtimeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  typingStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  speedStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  wordCountStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);

  context.subscriptions.push(runtimeStatusBar, typingStatusBar, speedStatusBar, wordCountStatusBar);

  viewProvider = new NovelWritingAssistantViewProvider();

  void initializeExtension(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('novelWritingAssistant.openConfig', openConfigFile),
    vscode.commands.registerCommand('novelWritingAssistant.highlightSelection', handleHighlightSelection),
    vscode.commands.registerCommand('novelWritingAssistant.clearHighlights', clearHighlightRules),
    vscode.window.registerWebviewViewProvider('novelWritingAssistantView', viewProvider),
    vscode.window.onDidChangeActiveTextEditor(() => updateAll()),
    vscode.workspace.onDidChangeTextDocument(event => {
      recordDocumentChange(event);
      updateAll();
    }),
    vscode.workspace.onDidOpenTextDocument(() => updateAll()),
    vscode.workspace.onDidCloseTextDocument(() => updateAll())
  );
}

export function deactivate() {
  if (timer) {
    clearInterval(timer);
  }
  disposeDecorations();
}

async function initializeExtension(context: vscode.ExtensionContext) {
  try {
    config = await loadConfig(context.extensionPath);
    startTimer();
    updateAll();
    viewProvider?.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Novel Writing Assistant initialization failed: ${error}`);
  }
}

function getConfigPath(): string {
  const basePath = extensionContext?.extensionPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.';
  return path.join(basePath, CONFIG_FILE_NAME);
}

function getLocale(): string {
  const lang = vscode.env.language || 'en';
  return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

function t(key: string): string {
  const locale = getLocale();
  return TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

async function loadConfig(extensionPath: string): Promise<AssistantConfig> {
  const configPath = path.join(extensionPath, CONFIG_FILE_NAME);
  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AssistantConfig>;
    return {
      enabledFileExtensions: Array.isArray(parsed.enabledFileExtensions) && parsed.enabledFileExtensions.length > 0
        ? parsed.enabledFileExtensions.map(item => item.toLowerCase())
        : DEFAULT_CONFIG.enabledFileExtensions,
      highlightItems: Array.isArray(parsed.highlightItems) ? parsed.highlightItems : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.promises.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

async function saveConfig(extensionPath?: string) {
  const configPath = extensionPath ? path.join(extensionPath, CONFIG_FILE_NAME) : getConfigPath();
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function startTimer() {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    const now = Date.now();
    if (typingActive && now - lastInputTime > 5000) {
      typingAccumulatedMs += now - typingSegmentStart;
      typingActive = false;
    } else if (!typingActive && now - lastInputTime <= 5000) {
      typingSegmentStart = now;
      typingActive = true;
    }
    updateAll();
  }, 1000);
}

function recordDocumentChange(event: vscode.TextDocumentChangeEvent) {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor || !isSupportedDocument(activeEditor.document)) {
    return;
  }

  const netChange = event.contentChanges.reduce((sum, change) => sum + change.text.length - change.rangeLength, 0);

  if (netChange > 0) {
    typedCharactersCount += netChange;
  } else if (netChange < 0) {
    typedCharactersCount = Math.max(0, typedCharactersCount + netChange);
  }

  lastInputTime = Date.now();
  if (!typingActive) {
    typingSegmentStart = Date.now();
    typingActive = true;
  }
}

function updateAll() {
  const editor = vscode.window.activeTextEditor;
  const supported = !!editor && isSupportedDocument(editor.document);

  if (!supported) {
    hideAllStatusBars();
    disposeDecorations();
    return;
  }

  const now = Date.now();
  const runtimeMs = now - windowOpenTime;
  const typingMs = getCurrentTypingMs(now);
  const charsPerMinute = typingMs > 0 ? typedCharactersCount / (typingMs / 60000) : 0;
  const charsPerHour = charsPerMinute * 60;
  const wordCount = editor.document.getText().length;

  runtimeStatusBar.text = `$(clock) ${formatDuration(runtimeMs)}`;
  runtimeStatusBar.show();

  typingStatusBar.text = `$(keyboard) ${formatDuration(typingMs)}`;
  typingStatusBar.show();

  speedStatusBar.text = `$(symbol-event) ${charsPerMinute.toFixed(1)}/min · ${charsPerHour.toFixed(1)}/h`;
  speedStatusBar.show();

  wordCountStatusBar.text = `${t('words')} ${wordCount}`;
  wordCountStatusBar.show();

  applyDecorations(editor);
  viewProvider?.refresh();
}

function hideAllStatusBars() {
  runtimeStatusBar.hide();
  typingStatusBar.hide();
  speedStatusBar.hide();
  wordCountStatusBar.hide();
  viewProvider?.refresh();
}

function getCurrentTypingMs(now: number) {
  if (typingActive) {
    return typingAccumulatedMs + (now - typingSegmentStart);
  }
  return typingAccumulatedMs;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function isSupportedDocument(document: vscode.TextDocument): boolean {
  const fileName = path.basename(document.fileName).toLowerCase();
  const extension = path.extname(fileName).replace('.', '').toLowerCase();
  const allowed = config.enabledFileExtensions.map(item => item.toLowerCase());
  return allowed.includes(extension) || allowed.includes(document.languageId.toLowerCase());
}

function applyDecorations(editor: vscode.TextEditor) {
  disposeDecorations();
  if (!config.highlightItems.length) {
    return;
  }

  const supportedEditors = vscode.window.visibleTextEditors.filter(item => item.document.uri.scheme === 'file' && isSupportedDocument(item.document));
  for (const visibleEditor of supportedEditors) {
    for (const item of config.highlightItems) {
      const ranges = findAllRanges(visibleEditor.document, item.text);
      if (!ranges.length) {
        continue;
      }
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: item.color,
        borderRadius: '3px',
        overviewRulerColor: item.color,
        overviewRulerLane: vscode.OverviewRulerLane.Full
      });
      visibleEditor.setDecorations(decorationType, ranges);
      decorationTypes.push(decorationType);
    }
  }
}

function findAllRanges(document: vscode.TextDocument, text: string): vscode.Range[] {
  if (!text) {
    return [];
  }

  const content = document.getText();
  const ranges: vscode.Range[] = [];
  let index = content.indexOf(text);
  while (index >= 0) {
    const start = document.positionAt(index);
    const end = document.positionAt(index + text.length);
    ranges.push(new vscode.Range(start, end));
    index = content.indexOf(text, index + text.length);
  }
  return ranges;
}

function disposeDecorations() {
  for (const type of decorationTypes) {
    type.dispose();
  }
  decorationTypes.length = 0;
}

function getDashboardState(): DashboardState {
  const editor = vscode.window.activeTextEditor;
  const supported = !!editor && isSupportedDocument(editor.document);
  const now = Date.now();
  const runtimeMs = now - windowOpenTime;
  const typingMs = getCurrentTypingMs(now);
  const charsPerMinute = typingMs > 0 ? typedCharactersCount / (typingMs / 60000) : 0;
  const charsPerHour = charsPerMinute * 60;
  const wordCount = editor?.document.getText().length ?? 0;
  return {
    title: t('dashboardTitle'),
    language: getLocale() === 'zh-CN' ? '中文' : 'English',
    runtime: formatDuration(runtimeMs),
    activeTyping: formatDuration(typingMs),
    speedPerMinute: `${charsPerMinute.toFixed(1)}/min`,
    speedPerHour: `${charsPerHour.toFixed(1)}/h`,
    wordCount: `${wordCount}`,
    supportedStatus: supported ? t('statusEnabled') : t('statusDisabled'),
    extensions: config.enabledFileExtensions.join(', '),
    rules: config.highlightItems,
    placeholder: t('placeholder'),
    buttons: {
      refresh: t('refresh'),
      openConfig: t('openConfig'),
      addSelection: t('addSelection'),
      clearRules: t('clearRules'),
      save: t('save')
    },
    labels: {
      runtime: t('runtime'),
      typing: t('typing'),
      speed: t('speed'),
      words: t('words'),
      fileTypes: t('fileTypes'),
      highlightRules: t('highlightRules'),
      extensionHint: t('extensionHint'),
      ruleHint: t('ruleHint'),
      statusEnabled: t('statusEnabled'),
      statusDisabled: t('statusDisabled'),
      languageLabel: t('languageLabel')
    }
  };
}

async function openConfigFile() {
  const configPath = getConfigPath();
  const uri = vscode.Uri.file(configPath);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch {
    await saveConfig();
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  }
}

async function handleHighlightSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(t('saveError'));
    return;
  }

  if (!isSupportedDocument(editor.document)) {
    vscode.window.showWarningMessage(t('statusDisabled'));
    return;
  }

  if (editor.selection.isEmpty) {
    vscode.window.showWarningMessage(t('statusDisabled'));
    return;
  }

  const selectedText = editor.document.getText(editor.selection).trim();
  if (!selectedText) {
    return;
  }

  const color = await vscode.window.showInputBox({
    prompt: '输入高亮颜色（如 #ffeb3b）',
    value: '#ffeb3b'
  });

  if (!color) {
    return;
  }

  const normalizedColor = color.startsWith('#') ? color : `#${color}`;
  config.highlightItems.push({ text: selectedText, color: normalizedColor });
  await saveConfig();
  updateAll();
  vscode.window.showInformationMessage(`${t('selectedAdded')}`);
}

async function clearHighlightRules() {
  config.highlightItems = [];
  await saveConfig();
  updateAll();
  vscode.window.showInformationMessage(t('rulesCleared'));
}

class NovelWritingAssistantViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void | Thenable<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case 'refresh':
          this.refresh();
          break;
        case 'save-settings': {
          const text = String(message.extensions ?? '');
          const extensions = text.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
          config.enabledFileExtensions = extensions.length ? extensions : DEFAULT_CONFIG.enabledFileExtensions;
          const rawRules = Array.isArray(message.highlightRules) ? message.highlightRules : [];
          config.highlightItems = rawRules
            .map((rule: { text?: string; color?: string }) => ({ text: String(rule.text ?? '').trim(), color: String(rule.color ?? '#ffeb3b') }))
            .filter((rule: { text: string; color: string }) => rule.text);
          await saveConfig();
          updateAll();
          vscode.window.showInformationMessage(t('saveSuccess'));
          break;
        }
        case 'add-selection': {
          await handleHighlightSelection();
          this.refresh();
          break;
        }
        case 'open-config': {
          await openConfigFile();
          break;
        }
        case 'clear-rules': {
          await clearHighlightRules();
          this.refresh();
          break;
        }
      }
    });

    this.refresh();
  }

  refresh() {
    if (!this.view) {
      return;
    }
    const state = getDashboardState();
    this.view.webview.postMessage({ type: 'update', state });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Novel Writing Assistant</title>
    <style>
      :root { color-scheme: light dark; --bg: var(--vscode-editorWidget-background); --card: var(--vscode-editorWidget-border); --text: var(--vscode-foreground); --muted: var(--vscode-descriptionForeground); --accent: var(--vscode-button-background); --accent-text: var(--vscode-button-foreground); }
      body { font-family: var(--vscode-font-family); margin: 0; padding: 12px; background: transparent; color: var(--text); }
      .card { background: color-mix(in srgb, var(--bg) 88%, transparent); border: 1px solid var(--card); border-radius: 12px; padding: 12px; margin-bottom: 10px; box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
      .title { font-size: 1.05rem; font-weight: 600; margin-bottom: 8px; }
      .grid { display: grid; gap: 8px; }
      .metric { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 10%, transparent); }
      .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); font-size: 0.85rem; }
      label { display: block; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted); }
      input, textarea, button { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--card); padding: 7px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); margin-bottom: 8px; }
      textarea { min-height: 90px; resize: vertical; }
      button { cursor: pointer; background: var(--accent); color: var(--accent-text); border: none; font-weight: 600; }
      .row { display: flex; gap: 8px; }
      .row button { flex: 1; }
      .hint { font-size: 0.8rem; color: var(--muted); margin-top: -4px; margin-bottom: 8px; }
      .status { font-size: 0.9rem; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title" id="title">Loading…</div>
      <div class="status" id="status">Waiting for data…</div>
    </div>
    <div class="card">
      <div class="grid">
        <div class="metric"><span id="runtime-label">Runtime</span><strong id="runtime-value">--</strong></div>
        <div class="metric"><span id="typing-label">Typing</span><strong id="typing-value">--</strong></div>
        <div class="metric"><span id="speed-label">Speed</span><strong id="speed-value">--</strong></div>
        <div class="metric"><span id="words-label">Words</span><strong id="words-value">--</strong></div>
      </div>
    </div>
    <div class="card">
      <div class="row">
        <button id="refresh-btn">Refresh</button>
        <button id="config-btn">Open config</button>
      </div>
      <div class="row">
        <button id="selection-btn">Add current selection</button>
        <button id="clear-btn">Clear rules</button>
      </div>
    </div>
    <div class="card">
      <label for="extensions" id="extensions-label">Enabled file types</label>
      <input id="extensions" type="text" />
      <div class="hint" id="extensions-hint">Enter multiple file types separated by commas</div>
      <label for="rules" id="rules-label">Highlight rules</label>
      <textarea id="rules"></textarea>
      <div class="hint" id="rules-hint">One rule per line, format: text|color</div>
      <button id="save-btn">Save settings</button>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const state = { extensions: '', rules: '' };
      function render(data) {
        document.getElementById('title').textContent = data.title;
        document.getElementById('status').textContent = data.supportedStatus;
        document.getElementById('runtime-label').textContent = data.labels.runtime;
        document.getElementById('typing-label').textContent = data.labels.typing;
        document.getElementById('speed-label').textContent = data.labels.speed;
        document.getElementById('words-label').textContent = data.labels.words;
        document.getElementById('runtime-value').textContent = data.runtime;
        document.getElementById('typing-value').textContent = data.activeTyping;
        document.getElementById('speed-value').textContent = data.speedPerMinute + ' · ' + data.speedPerHour;
        document.getElementById('words-value').textContent = data.wordCount;
        document.getElementById('extensions-label').textContent = data.labels.fileTypes;
        document.getElementById('extensions-hint').textContent = data.labels.extensionHint;
        document.getElementById('rules-label').textContent = data.labels.highlightRules;
        document.getElementById('rules-hint').textContent = data.labels.ruleHint;
        document.getElementById('refresh-btn').textContent = data.buttons.refresh;
        document.getElementById('config-btn').textContent = data.buttons.openConfig;
        document.getElementById('selection-btn').textContent = data.buttons.addSelection;
        document.getElementById('clear-btn').textContent = data.buttons.clearRules;
        document.getElementById('save-btn').textContent = data.buttons.save;
        document.getElementById('extensions').value = data.extensions;
        state.extensions = data.extensions;
        document.getElementById('rules').value = data.rules.map(function(rule) {
          return rule.text + '|' + rule.color;
        }).join('\n');
        state.rules = document.getElementById('rules').value;
      }
      window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'update') {
          render(message.state);
        }
      });
      document.getElementById('refresh-btn').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
      document.getElementById('config-btn').addEventListener('click', () => vscode.postMessage({ type: 'open-config' }));
      document.getElementById('selection-btn').addEventListener('click', () => vscode.postMessage({ type: 'add-selection' }));
      document.getElementById('clear-btn').addEventListener('click', () => vscode.postMessage({ type: 'clear-rules' }));
      document.getElementById('save-btn').addEventListener('click', () => {
        const extensions = document.getElementById('extensions').value;
        const rulesText = document.getElementById('rules').value;
        const highlightRules = rulesText.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
          const [text, color] = line.split('|');
          return { text: text ? text.trim() : '', color: color ? color.trim() : '#ffeb3b' };
        }).filter(rule => rule.text);
        vscode.postMessage({ type: 'save-settings', extensions, highlightRules });
      });
      vscode.postMessage({ type: 'refresh' });
    </script>
  </body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
