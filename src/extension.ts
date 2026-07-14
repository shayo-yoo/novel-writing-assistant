import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface HighlightRule {
  text: string;
  color: string;
}

type CountMode =
  | 'words'
  | 'hanzi'
  | 'hanziWithoutPunctuation'
  | 'cjkCharacters'
  | 'nonWhitespaceCharacters'
  | 'characters'
  | 'nonAsciiCodePoints'
  | 'codePoints';

interface AssistantConfig {
  enabledFileExtensions: string[];
  highlightItems: HighlightRule[];
  countMode: CountMode;
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
  highlightItems: [],
  countMode: 'words'
};

const COUNT_MODES: CountMode[] = [
  'words',
  'hanzi',
  'hanziWithoutPunctuation',
  'cjkCharacters',
  'nonWhitespaceCharacters',
  'characters',
  'nonAsciiCodePoints',
  'codePoints'
];

const COUNT_MODE_LABEL_KEYS: Record<CountMode, string> = {
  words: 'countModeWords',
  hanzi: 'countModeHanzi',
  hanziWithoutPunctuation: 'countModeHanziWithoutPunctuation',
  cjkCharacters: 'countModeCJKCharacters',
  nonWhitespaceCharacters: 'countModeNonWhitespaceCharacters',
  characters: 'countModeCharacters',
  nonAsciiCodePoints: 'countModeNonAsciiCodePoints',
  codePoints: 'countModeCodePoints'
};

const TRANSLATIONS: Record<string, Record<string, string>> = {
  'zh-CN': {
    dashboardTitle: '小说写作助手',
    runtime: '运行时长',
    typing: '有效输入',
    speed: '输入速度',
    words: '字数',
    countModeWords: '字词数',
    countModeHanzi: '汉字',
    countModeHanziWithoutPunctuation: '汉字(不含标点)',
    countModeCJKCharacters: 'CJK字符',
    countModeNonWhitespaceCharacters: '非空白字符',
    countModeCharacters: '字符数',
    countModeNonAsciiCodePoints: '非ASCII码位',
    countModeCodePoints: '码位数',
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
    countModeWords: 'Word count',
    countModeHanzi: 'Hanzi',
    countModeHanziWithoutPunctuation: 'Hanzi (no punctuation)',
    countModeCJKCharacters: 'CJK characters',
    countModeNonWhitespaceCharacters: 'Non-whitespace characters',
    countModeCharacters: 'Characters',
    countModeNonAsciiCodePoints: 'Non-ASCII code points',
    countModeCodePoints: 'Code points',
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

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  runtimeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  typingStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  speedStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  wordCountStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);

  context.subscriptions.push(runtimeStatusBar, typingStatusBar, speedStatusBar, wordCountStatusBar);

  void initializeExtension(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('novelWritingAssistant.openConfig', openConfigFile),
    vscode.commands.registerCommand('novelWritingAssistant.openSettings', openSettings),
    vscode.commands.registerCommand('novelWritingAssistant.highlightSelection', handleHighlightSelection),
    vscode.commands.registerCommand('novelWritingAssistant.clearHighlights', clearHighlightRules),
    vscode.window.onDidChangeActiveTextEditor(() => updateAll()),
    vscode.workspace.onDidChangeTextDocument(event => {
      recordDocumentChange(event);
      updateAll();
    }),
    vscode.workspace.onDidOpenTextDocument(() => updateAll()),
    vscode.workspace.onDidCloseTextDocument(() => updateAll()),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('novelWritingAssistant')) {
        void refreshConfiguration();
      }
    })
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
  } catch (error) {
    vscode.window.showErrorMessage(`Novel Writing Assistant initialization failed: ${error}`);
  }
}

async function refreshConfiguration() {
  try {
    if (!extensionContext) {
      return;
    }
    config = await loadConfig(extensionContext.extensionPath);
    updateAll();
  } catch (error) {
    vscode.window.showErrorMessage(`Novel Writing Assistant configuration refresh failed: ${error}`);
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

function isValidCountMode(value: unknown): value is CountMode {
  return typeof value === 'string' && COUNT_MODES.includes(value as CountMode);
}

function getCountLabel(): string {
  const labelKey = COUNT_MODE_LABEL_KEYS[config.countMode];
  return t(labelKey);
}

function getTextCount(document: vscode.TextDocument): number {
  const text = document.getText();

  switch (config.countMode) {
    case 'words': {
      const matches = text.match(/([\p{L}\p{N}_]+)/gu);
      return matches ? matches.length : 0;
    }
    case 'hanzi': {
      const matches = text.match(/[\p{Script=Han}]/gu);
      return matches ? matches.length : 0;
    }
    case 'hanziWithoutPunctuation': {
      const matches = text.match(/[\p{Script=Han}]/gu);
      return matches ? matches.length : 0;
    }
    case 'cjkCharacters': {
      const matches = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu);
      return matches ? matches.length : 0;
    }
    case 'nonWhitespaceCharacters': {
      return text.replace(/\s+/g, '').length;
    }
    case 'characters': {
      return text.length;
    }
    case 'nonAsciiCodePoints': {
      return Array.from(text).filter(ch => ch.codePointAt(0)! > 127).length;
    }
    case 'codePoints': {
      return Array.from(text).length;
    }
    default:
      return text.length;
  }
}

async function loadConfig(extensionPath: string): Promise<AssistantConfig> {
  const settings = vscode.workspace.getConfiguration('novelWritingAssistant');
  const enabledFileExtensions = settings.get<string[]>('enabledFileExtensions');
  const highlightItems = settings.get<HighlightRule[]>('highlightItems');
  const countMode = settings.get<string>('countMode');
  const configPath = path.join(extensionPath, CONFIG_FILE_NAME);

  const fileConfig = await loadConfigFromFile(configPath);

  return {
    enabledFileExtensions: Array.isArray(enabledFileExtensions) && enabledFileExtensions.length > 0
      ? enabledFileExtensions.map(item => item.toLowerCase())
      : fileConfig.enabledFileExtensions,
    highlightItems: Array.isArray(highlightItems) ? highlightItems : fileConfig.highlightItems,
    countMode: isValidCountMode(countMode) ? countMode : fileConfig.countMode
  };
}

async function loadConfigFromFile(configPath: string): Promise<AssistantConfig> {
  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AssistantConfig>;
    return {
      enabledFileExtensions: Array.isArray(parsed.enabledFileExtensions) && parsed.enabledFileExtensions.length > 0
        ? parsed.enabledFileExtensions.map(item => item.toLowerCase())
        : DEFAULT_CONFIG.enabledFileExtensions,
      highlightItems: Array.isArray(parsed.highlightItems) ? parsed.highlightItems : [],
      countMode: isValidCountMode(parsed.countMode) ? parsed.countMode : DEFAULT_CONFIG.countMode
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
  const countValue = getTextCount(editor.document);

  runtimeStatusBar.text = `$(clock) ${formatDuration(runtimeMs)}`;
  runtimeStatusBar.show();

  typingStatusBar.text = `$(keyboard) ${formatDuration(typingMs)}`;
  typingStatusBar.show();

  speedStatusBar.text = `$(symbol-event) ${charsPerMinute.toFixed(1)}/min · ${charsPerHour.toFixed(1)}/h`;
  speedStatusBar.show();

  wordCountStatusBar.text = `${getCountLabel()} ${countValue}`;
  wordCountStatusBar.show();

  applyDecorations(editor);
}

function hideAllStatusBars() {
  runtimeStatusBar.hide();
  typingStatusBar.hide();
  speedStatusBar.hide();
  wordCountStatusBar.hide();
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

async function openSettings() {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:shayo.novel-writing-assistant');
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
