let editor;
let shelter;
let webR;
let sessionEnv;
let preRunCode = '';
let challengeSourceCode = '';
let challengePlotVariable = '';
let targetPlotFeatures = null;
let preservedSessionNames = [];
let currentChallengeId = '';
let scriptTabs = [];
let activeScriptId = null;
let scriptSequence = 1;
let scriptStorageSaveTimer = null;
let isLoadingScriptIntoEditor = false;
let terminalInput;
let terminalOutput;
let terminalScroll;
let terminalAvailable = false;
let terminalBusy = false;
let terminalHistory = [];
let terminalHistoryIndex = 0;

const PLOT_BACKGROUND = 'rgba(255,255,255,1)';
const WEBR_GRAPHICS_SIZE = { width: 350, height: 200 };
const SCRIPT_WORKSPACE_STORAGE_PREFIX = 'ggplot-battles-script-workspace-v1:';
const SCRIPT_WORKSPACE_SAVE_DELAY_MS = 350;
const MAX_RESTORED_SCRIPT_TABS = 25;

let editorInitialized = false;

document.addEventListener('editor-ready', initializeEditor);
queueMicrotask(initializeEditor);

async function initializeEditor() {
  if (editorInitialized) return;

  const editorElement = document.getElementById('editor');
  if (!editorElement) return;

  editorInitialized = true;

  const runButton = document.getElementById('runButton');
  const challengeId = getChallengeId();
  currentChallengeId = challengeId;

  editor = setupEditor();
  setupScriptTabs();
  setupReferenceTabs();
  setupTerminal();
  window.initLeaderboard?.({
    challengeId,
    getCode: () => {
      saveActiveScript();
      return editor.getValue();
    }
  });

  try {
    await initializeWebR();
    const challengeSource = await loadChallengeSource(challengeId);
    await initializeChallenge(challengeSource);
    setTerminalAvailable(true);
    setRunButtonReady(runButton);
  } catch (err) {
    console.error('Error initializing challenge:', err);
    writeOutput(`Error initializing challenge: ${err.message}`);
    setTerminalAvailable(false, 'Unable to load webR');
    if (runButton) {
      runButton.textContent = 'Unable to load';
      runButton.disabled = true;
    }
  } finally {
    const spinner = document.querySelector('#spinner');
    if (spinner) {
      spinner.style.visibility = 'hidden';
    }
    document.documentElement.style.visibility = 'visible';
  }
}

function setupEditor() {
  const aceEditor = ace.edit('editor');
  ace.require('ace/ext/language_tools');

  aceEditor.session.setMode('ace/mode/r');
  aceEditor.setOptions({
    fontSize: '11pt',
    enableAutoIndent: true,
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    enableSnippets: true
  });
  aceEditor.setTheme('ace/theme/monokai');
  aceEditor.session.setUseWrapMode(true);
  aceEditor.session.setTabSize(2);
  aceEditor.session.on('change', () => {
    markScoreStale('edit');
    if (!isLoadingScriptIntoEditor) {
      scheduleScriptWorkspaceSave();
    }
  });
  addEditorRunShortcut(aceEditor, 'runSelectionCtrlEnter', 'Ctrl-Enter');
  addEditorRunShortcut(aceEditor, 'runSelectionCommandEnter', 'Command-Enter');
  window.addEventListener('resize', () => aceEditor.resize());

  return aceEditor;
}

function addEditorRunShortcut(aceEditor, name, bindKey) {
  aceEditor.commands.addCommand({
    name,
    bindKey: {
      win: bindKey,
      mac: bindKey
    },
    exec: runEditorSelectionOrCurrentLine
  });
}

async function runEditorSelectionOrCurrentLine() {
  if (!editor || terminalBusy || !terminalAvailable) return;

  const code = getSelectedOrCurrentExpression();
  if (!code.trim()) return;

  saveActiveScript();
  await runSessionCode(code, {
    busyText: 'Running selection...',
    refocus: () => editor.focus()
  });
}

function getSelectedOrCurrentExpression() {
  const selectedText = editor.getSelectedText();
  if (selectedText.trim()) {
    return selectedText.trimEnd();
  }

  const cursor = editor.getCursorPosition();
  const lines = getEditorLines();
  return getRChunkAtRow(lines, cursor.row).join('\n').trimEnd();
}

function getEditorLines() {
  return Array.from(
    { length: editor.session.getLength() },
    (_, row) => editor.session.getLine(row)
  );
}

function getRChunkAtRow(lines, row) {
  if (lines.length === 0) return [''];

  let start = row;
  let end = row;

  while (start > 0 && areRLineRowsConnected(lines, start - 1, start)) {
    start -= 1;
  }

  while (end < lines.length - 1 && areRLineRowsConnected(lines, end, end + 1)) {
    end += 1;
  }

  return lines.slice(start, end + 1);
}

function areRLineRowsConnected(lines, previousRow, nextRow) {
  return areRLinesConnected(lines[previousRow], lines[nextRow])
    || commentLineBridgesRContinuation(lines, previousRow, nextRow);
}

function areRLinesConnected(previousLine, nextLine) {
  if (isBlankLine(previousLine) || isBlankLine(nextLine)) return false;

  return lineContinuesRExpression(previousLine) || lineBeginsRContinuation(nextLine);
}

function commentLineBridgesRContinuation(lines, commentRow, nextRow) {
  if (!isCommentOnlyLine(lines[commentRow]) || isBlankLine(lines[nextRow])) return false;

  const previousCodeRow = findPreviousCodeLine(lines, commentRow - 1);
  return previousCodeRow !== -1 && lineContinuesRExpression(lines[previousCodeRow]);
}

function findPreviousCodeLine(lines, row) {
  for (let index = row; index >= 0; index -= 1) {
    if (isBlankLine(lines[index])) return -1;
    if (!isCommentOnlyLine(lines[index])) return index;
  }

  return -1;
}

function lineContinuesRExpression(line) {
  const code = stripRCommentsAndStrings(line).trimEnd();
  if (!code) return false;

  return hasUnclosedDelimiter(code) || rContinuationEndPattern().test(code);
}

function lineBeginsRContinuation(line) {
  const code = stripRCommentsAndStrings(line).trimStart();
  if (!code) return false;

  return /^(\|>|%>%|\+|,|\)|\]|\}|else\b|&&?|\|\|?|\*|\/|\^|==|!=|<=|>=|<|>|%[^%]+%)/.test(code);
}

function rContinuationEndPattern() {
  return /(\|>|%>%|\+|,|<-|<<-|->|->>|=|~|&&?|\|\|?|==|!=|<=|>=|<|>|\*|\/|\^|\$|@|:|%[^%]+%)\s*$/;
}

function hasUnclosedDelimiter(code) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];

  for (const char of code) {
    if (pairs[char]) {
      stack.push(pairs[char]);
    } else if (char === ')' || char === ']' || char === '}') {
      if (stack[stack.length - 1] === char) {
        stack.pop();
      }
    }
  }

  return stack.length > 0;
}

function stripRCommentsAndStrings(line) {
  let output = '';
  let quote = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (quote !== '`' && char === '\\') {
        output += ' ';
        index += 1;
        output += ' ';
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      output += ' ';
      continue;
    }

    if (char === '#') break;

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += ' ';
      continue;
    }

    output += char;
  }

  return output;
}

function isBlankLine(line) {
  return line.trim() === '';
}

function isCommentOnlyLine(line) {
  return line.trim().startsWith('#');
}

function setupScriptTabs() {
  const tabsContainer = document.getElementById('script-tabs');
  const addButton = document.getElementById('add-script-tab');
  const contextMenu = createScriptContextMenu();
  if (!tabsContainer) return;

  tabsContainer.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;

    const tabButton = event.target.closest('[data-script-id]');
    if (!tabButton || !tabsContainer.contains(tabButton)) return;

    if (event.target.closest('[data-script-close]')) {
      closeScriptTab(tabButton.dataset.scriptId);
      return;
    }

    switchScriptTab(tabButton.dataset.scriptId);
  });

  tabsContainer.addEventListener('dblclick', event => {
    if (!(event.target instanceof Element)) return;

    const tabButton = event.target.closest('[data-script-id]');
    if (!tabButton || !tabsContainer.contains(tabButton)) return;
    if (event.target.closest('[data-script-close]')) return;

    renameScriptTab(tabButton.dataset.scriptId);
  });

  tabsContainer.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element)) return;

    const tabButton = event.target.closest('[data-script-id]');
    if (!tabButton || !tabsContainer.contains(tabButton)) return;

    event.preventDefault();
    switchScriptTab(tabButton.dataset.scriptId);
    openScriptContextMenu(tabButton.dataset.scriptId, event.clientX, event.clientY);
  });

  contextMenu?.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;

    const actionButton = event.target.closest('[data-script-action]');
    if (!actionButton || !contextMenu.contains(actionButton)) return;

    const scriptId = contextMenu.dataset.scriptId;
    closeScriptContextMenu();

    if (actionButton.dataset.scriptAction === 'rename') {
      renameScriptTab(scriptId);
    } else if (actionButton.dataset.scriptAction === 'download') {
      downloadScriptTab(scriptId);
    }

    editor?.focus();
  });

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (contextMenu?.contains(event.target)) return;

    closeScriptContextMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeScriptContextMenu();
    }
  });
  window.addEventListener('resize', closeScriptContextMenu);
  window.addEventListener('beforeunload', saveScriptWorkspaceNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveScriptWorkspaceNow();
    }
  });

  addButton?.addEventListener('click', addScriptTab);
}

function initializeScriptTabs(starterCode) {
  const savedWorkspace = loadSavedScriptWorkspace();
  if (savedWorkspace) {
    scriptSequence = savedWorkspace.scriptSequence;
    scriptTabs = savedWorkspace.scripts;
    activeScriptId = savedWorkspace.activeScriptId;
  } else {
    scriptSequence = 1;
    scriptTabs = [{
      id: 'script-1',
      name: 'script.R',
      code: starterCode
    }];
    activeScriptId = scriptTabs[0].id;
  }

  renderScriptTabs();
  loadActiveScriptIntoEditor();
}

function addScriptTab() {
  saveActiveScript();
  scriptSequence += 1;

  const script = {
    id: `script-${scriptSequence}`,
    name: `script-${scriptSequence}.R`,
    code: ''
  };
  scriptTabs.push(script);
  switchScriptTab(script.id);
  saveScriptWorkspaceNow();
}

function switchScriptTab(scriptId) {
  if (scriptId === activeScriptId) return;
  if (!scriptTabs.some(script => script.id === scriptId)) return;

  saveActiveScript();
  activeScriptId = scriptId;
  renderScriptTabs();
  loadActiveScriptIntoEditor();
  saveScriptWorkspaceNow();
}

function closeScriptTab(scriptId) {
  if (scriptTabs.length <= 1) return;

  const tabIndex = scriptTabs.findIndex(script => script.id === scriptId);
  if (tabIndex === -1) return;

  const closingActiveTab = scriptId === activeScriptId;
  if (closingActiveTab) {
    saveActiveScript();
  }

  scriptTabs.splice(tabIndex, 1);

  if (closingActiveTab) {
    const nextIndex = Math.max(0, tabIndex - 1);
    activeScriptId = scriptTabs[nextIndex].id;
    loadActiveScriptIntoEditor();
  }

  renderScriptTabs();
  saveScriptWorkspaceNow();
}

function renameScriptTab(scriptId) {
  const script = scriptTabs.find(tab => tab.id === scriptId);
  if (!script) return;

  const nextName = window.prompt('Rename script', script.name);
  if (nextName === null) return;

  const normalizedName = normalizeScriptName(nextName);
  if (!normalizedName) return;

  script.name = normalizedName;
  renderScriptTabs();
  saveScriptWorkspaceNow();
}

function createScriptContextMenu() {
  let contextMenu = document.getElementById('script-context-menu');
  if (contextMenu) return contextMenu;

  contextMenu = document.createElement('div');
  contextMenu.className = 'script-context-menu';
  contextMenu.id = 'script-context-menu';
  contextMenu.hidden = true;
  contextMenu.setAttribute('role', 'menu');

  const renameButton = createScriptContextMenuButton('rename', 'Rename');
  const downloadButton = createScriptContextMenuButton('download', 'Download');
  contextMenu.append(renameButton, downloadButton);
  document.body.append(contextMenu);

  return contextMenu;
}

function createScriptContextMenuButton(action, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.scriptAction = action;
  button.setAttribute('role', 'menuitem');
  button.textContent = label;
  return button;
}

function openScriptContextMenu(scriptId, x, y) {
  const contextMenu = createScriptContextMenu();
  if (!contextMenu) return;

  contextMenu.dataset.scriptId = scriptId;
  contextMenu.style.visibility = 'hidden';
  contextMenu.hidden = false;

  const menuRect = contextMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - menuRect.width - 8);
  const top = Math.min(y, window.innerHeight - menuRect.height - 8);

  contextMenu.style.left = `${Math.max(8, left)}px`;
  contextMenu.style.top = `${Math.max(8, top)}px`;
  contextMenu.style.visibility = 'visible';
}

function closeScriptContextMenu() {
  const contextMenu = document.getElementById('script-context-menu');
  if (!contextMenu || contextMenu.hidden) return;

  contextMenu.hidden = true;
  contextMenu.style.visibility = '';
  delete contextMenu.dataset.scriptId;
}

function normalizeScriptName(name) {
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (!normalizedName) return '';

  return normalizedName.toLowerCase().endsWith('.r')
    ? normalizedName
    : `${normalizedName}.R`;
}

function downloadScriptTab(scriptId) {
  if (scriptId === activeScriptId) {
    saveActiveScript();
  }

  const script = scriptTabs.find(tab => tab.id === scriptId);
  if (!script) return;

  const blob = new Blob([script.code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getDownloadFilename(script.name);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getDownloadFilename(scriptName) {
  const normalizedName = normalizeScriptName(scriptName) || 'script.R';
  const safeName = normalizedName
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);

  return safeName || 'script.R';
}

function saveActiveScript() {
  const script = getActiveScript();
  if (script && editor) {
    script.code = editor.getValue();
  }
}

function loadActiveScriptIntoEditor() {
  const script = getActiveScript();
  if (!script || !editor) return;

  isLoadingScriptIntoEditor = true;
  try {
    editor.setValue(script.code, -1);
  } finally {
    isLoadingScriptIntoEditor = false;
  }
  editor.resize();
  editor.focus();
}

function getActiveScript() {
  return scriptTabs.find(script => script.id === activeScriptId);
}

function renderScriptTabs() {
  const tabsContainer = document.getElementById('script-tabs');
  if (!tabsContainer) return;

  const tabButtons = scriptTabs.map(script => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `script-tab${script.id === activeScriptId ? ' is-active' : ''}`;
    button.dataset.scriptId = script.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(script.id === activeScriptId));
    button.title = script.name;

    const label = document.createElement('span');
    label.className = 'script-tab-label';
    label.textContent = script.name;
    button.append(label);

    if (scriptTabs.length > 1) {
      const close = document.createElement('span');
      close.className = 'script-tab-close';
      close.dataset.scriptClose = '';
      close.textContent = 'x';
      close.title = `Close ${script.name}`;
      button.append(close);
    }

    return button;
  });

  tabsContainer.replaceChildren(...tabButtons);
}

function getScriptWorkspaceStorageKey() {
  return currentChallengeId
    ? `${SCRIPT_WORKSPACE_STORAGE_PREFIX}${currentChallengeId}`
    : '';
}

function scheduleScriptWorkspaceSave() {
  if (!getScriptWorkspaceStorageKey()) return;

  if (scriptStorageSaveTimer) {
    window.clearTimeout(scriptStorageSaveTimer);
  }

  scriptStorageSaveTimer = window.setTimeout(() => {
    scriptStorageSaveTimer = null;
    saveScriptWorkspaceNow();
  }, SCRIPT_WORKSPACE_SAVE_DELAY_MS);
}

function saveScriptWorkspaceNow() {
  const storageKey = getScriptWorkspaceStorageKey();
  if (!storageKey || !scriptTabs.length) return;

  if (scriptStorageSaveTimer) {
    window.clearTimeout(scriptStorageSaveTimer);
    scriptStorageSaveTimer = null;
  }

  saveActiveScript();

  const workspace = {
    version: 1,
    activeScriptId,
    scriptSequence,
    scripts: scriptTabs.map(script => ({
      id: script.id,
      name: script.name,
      code: script.code
    }))
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(workspace));
  } catch (err) {
    console.warn('Unable to save script workspace:', err);
  }
}

function loadSavedScriptWorkspace() {
  const storageKey = getScriptWorkspaceStorageKey();
  if (!storageKey) return null;

  let savedWorkspace;
  try {
    const storedWorkspace = localStorage.getItem(storageKey);
    if (!storedWorkspace) return null;
    savedWorkspace = JSON.parse(storedWorkspace);
  } catch (err) {
    console.warn('Unable to load saved script workspace:', err);
    return null;
  }

  const savedScripts = Array.isArray(savedWorkspace?.scripts)
    ? savedWorkspace.scripts.slice(0, MAX_RESTORED_SCRIPT_TABS)
    : [];
  if (!savedScripts.length) return null;

  const activeIndex = Math.max(
    0,
    savedScripts.findIndex(script => script?.id === savedWorkspace.activeScriptId)
  );
  const scripts = savedScripts.map((script, index) => ({
    id: `script-${index + 1}`,
    name: normalizeScriptName(typeof script?.name === 'string' ? script.name : '') || `script-${index + 1}.R`,
    code: typeof script?.code === 'string' ? script.code : ''
  }));

  return {
    scripts,
    activeScriptId: scripts[Math.min(activeIndex, scripts.length - 1)].id,
    scriptSequence: scripts.length
  };
}

function setupReferenceTabs() {
  const tabs = document.querySelectorAll('[data-reference-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => showReferencePanel(tab.dataset.referenceTab));
  });
}

function showReferencePanel(panelId) {
  const tabs = document.querySelectorAll('[data-reference-tab]');
  const panels = document.querySelectorAll('.reference-panel');

  tabs.forEach(tab => {
    const isActive = tab.dataset.referenceTab === panelId;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  panels.forEach(panel => {
    const isActive = panel.id === panelId;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  if (panelId === 'target-plot-panel') {
    window.syncPlotSizes?.();
  }
}

function setupTerminal() {
  terminalInput = document.getElementById('terminal-input');
  terminalOutput = document.getElementById('out');
  terminalScroll = document.getElementById('terminal-scroll');

  const terminalForm = document.getElementById('terminal-form');
  const terminalBody = document.querySelector('.terminal-body');
  if (!terminalInput || !terminalOutput || !terminalForm) return;

  setTerminalAvailable(false, 'Loading webR...');

  terminalForm.addEventListener('submit', event => {
    event.preventDefault();
    runTerminalCommand();
  });

  terminalInput.addEventListener('keydown', handleTerminalKeydown);
  terminalBody?.addEventListener('click', () => terminalInput.focus());
}

function setTerminalAvailable(available, placeholder = '') {
  terminalAvailable = available;
  updateTerminalInputState(placeholder);
}

function setTerminalBusy(busy, placeholder = '') {
  terminalBusy = busy;
  updateTerminalInputState(placeholder);
}

function updateTerminalInputState(placeholder = '') {
  if (!terminalInput) return;

  const disabled = !terminalAvailable || terminalBusy;
  terminalInput.disabled = disabled;
  terminalInput.placeholder = disabled ? placeholder : '';
}

function handleTerminalKeydown(event) {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    recallTerminalHistory(-1);
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    recallTerminalHistory(1);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    clearTerminalOutput();
  }
}

function recallTerminalHistory(direction) {
  if (!terminalInput || terminalHistory.length === 0) return;

  terminalHistoryIndex = Math.max(
    0,
    Math.min(terminalHistory.length, terminalHistoryIndex + direction)
  );
  terminalInput.value = terminalHistory[terminalHistoryIndex] || '';

  requestAnimationFrame(() => {
    terminalInput.selectionStart = terminalInput.value.length;
    terminalInput.selectionEnd = terminalInput.value.length;
  });
}

async function runTerminalCommand() {
  if (!terminalInput || !terminalAvailable || terminalBusy || !shelter) return;

  const command = terminalInput.value.trimEnd();
  if (!command.trim()) return;

  addTerminalHistory(command);
  terminalInput.value = '';
  await runSessionCode(command, {
    busyText: 'Running command...',
    refocus: () => terminalInput.focus()
  });
}

async function runSessionCode(code, options = {}) {
  if (!terminalAvailable || terminalBusy || !shelter) return;

  const command = code.trimEnd();
  if (!command.trim()) return;

  appendTerminalCommand(command);
  markScoreStale(options.scoreReason || 'interactive');
  setTerminalBusy(true, options.busyText || 'Running code...');

  const runButton = document.getElementById('runButton');
  if (runButton) {
    runButton.disabled = true;
  }

  let capture;
  try {
    capture = await captureSessionR(command, {
      withAutoprint: true,
      captureStreams: true,
      captureGraphics: WEBR_GRAPHICS_SIZE,
      captureConditions: false
    });
    const output = getCaptureOutputText(capture);

    if (output) {
      appendTerminalText(output);
    }

    if (capture.images?.length > 0) {
      const image = capture.images[capture.images.length - 1];
      drawImageToCanvas(document.getElementById('canvas'), image);
    }
  } catch (err) {
    console.error('Error running R code:', err);
    appendTerminalText(`Error: ${err.message}`);
  } finally {
    await destroyCaptureResult(capture);
    await refreshVariables();
    setTerminalBusy(false);
    setRunButtonReady(runButton);
    options.refocus?.();
  }
}

function addTerminalHistory(command) {
  if (terminalHistory[terminalHistory.length - 1] !== command) {
    terminalHistory.push(command);
  }
  terminalHistoryIndex = terminalHistory.length;
}

function getCaptureOutputText(capture) {
  return (capture.output || [])
    .filter(evt => evt.type === 'stdout' || evt.type === 'stderr')
    .map(evt => evt.data)
    .join('\n')
    .trimEnd();
}

function appendTerminalText(message) {
  terminalOutput ||= document.getElementById('out');
  if (!terminalOutput || !message) return;

  const currentOutput = terminalOutput.textContent;
  terminalOutput.textContent = currentOutput
    ? `${currentOutput}\n${message}`
    : message;
  scrollTerminalToBottom();
}

function appendTerminalCommand(command) {
  appendTerminalText(formatTerminalCommand(command));
}

function formatTerminalCommand(command) {
  return command
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => `${index === 0 ? '>' : '+'} ${line}`)
    .join('\n');
}

function clearTerminalOutput() {
  terminalOutput ||= document.getElementById('out');
  if (terminalOutput) {
    terminalOutput.textContent = '';
  }
}

function scrollTerminalToBottom() {
  terminalScroll ||= document.getElementById('terminal-scroll');
  if (terminalScroll) {
    terminalScroll.scrollTop = terminalScroll.scrollHeight;
  }
}

function getSessionEvalOptions(options = {}) {
  if (!sessionEnv) return options;
  return { env: sessionEnv, ...options };
}

async function captureSessionR(code, options = {}) {
  return shelter.captureR(code, getSessionEvalOptions(options));
}

async function destroyCaptureResult(capture) {
  if (!capture?.result) return;

  try {
    await shelter.destroy(capture.result);
  } catch (err) {
    console.warn('Unable to release captured R result:', err);
  }
}

async function initializeWebR() {
  const { WebR } = await import('https://webr.r-wasm.org/latest/webr.mjs');
  webR = new WebR();
  await webR.init();
  await webR.evalRVoid('options(device=function(...){webr::canvas(width=350, height=200)})');
  shelter = await new webR.Shelter();
  sessionEnv = await shelter.evalR('new.env(parent = .GlobalEnv)');
  await webR.evalRVoid('webr::shim_install()');
}

async function loadChallengeSource(challengeId) {
  const response = await fetch(`../../challenges-code/${challengeId}.R`);
  if (!response.ok) {
    throw new Error(`Could not load challenge source for "${challengeId}"`);
  }
  const source = await response.text();
  return source.replace(/\r\n/g, '\n');
}

async function initializeChallenge(challengeSource) {
  const requiredPackages = extractRequiredPackages(challengeSource);
  renderRequiredPackages(requiredPackages);

  if (requiredPackages.length > 0) {
    await webR.installPackages(requiredPackages);
  }

  const options = extractChallengeOptions(challengeSource);
  challengeSourceCode = challengeSource;
  challengePlotVariable = options['plot-variable'] || '';
  preRunCode = options['prerun-code'] || '';
  preservedSessionNames = getDatasetObjectNames(options['dataset-name'] || '');

  renderChallengeDetails(options);
  setStarterCode(options);
  await renderTargetPlot(challengeSource);
  targetPlotFeatures = await getCurrentPlotFeatures(challengePlotVariable);
  await cleanupSessionWorkspace();
  await refreshVariables();
}

function renderRequiredPackages(requiredPackages) {
  const packagesContainer = document.querySelector('.required-packages');
  if (!packagesContainer) return;

  const list = window.createCodeList
    ? window.createCodeList(requiredPackages)
    : document.createElement('ul');

  packagesContainer.replaceChildren(list);
}

function renderChallengeDetails(options) {
  setText('#dataset-name', options['dataset-name'] || '');
  setText('#target-title', options.title || '');

  const description = document.querySelector('#target-description');
  if (description) {
    description.innerHTML = marked.parse(options.description || '');
  }

  const colours = document.querySelector('#target-colours');
  if (!colours) return;

  if (options.colours) {
    colours.innerHTML = `Colours: ${marked.parseInline(options.colours)}`;
    colours.style.visibility = 'visible';
  } else {
    colours.replaceChildren();
    colours.style.visibility = 'hidden';
  }
}

function setStarterCode(options) {
  const starterCode = options.stub
    ? options.stub.replace(/\\n/g, '\n')
    : `${options['dataset-name']} |>\n  ggplot()`;

  initializeScriptTabs(starterCode);
}

async function renderTargetPlot(challengeSource) {
  let capture;
  try {
    capture = await captureSessionR(challengeSource, {
      captureGraphics: WEBR_GRAPHICS_SIZE,
      captureConditions: false
    });

    if (capture.images.length === 0) return;

    drawImageToCanvas(document.getElementById('canvas-base'), capture.images[0]);
    drawImageToCanvas(document.getElementById('canvas-target'), capture.images[0]);
  } finally {
    await destroyCaptureResult(capture);
  }
}

async function cleanupSessionWorkspace() {
  const keepList = preservedSessionNames.map(quoteRString).join(', ');
  const keepVector = keepList ? `c(${keepList})` : 'character()';
  let capture;

  try {
    capture = await captureSessionR(`
.gg_battle_keep <- ${keepVector}
.gg_battle_remove <- setdiff(ls(all.names = FALSE), .gg_battle_keep)
if (length(.gg_battle_remove)) {
  rm(list = .gg_battle_remove, envir = environment())
}
rm(list = ls(all.names = TRUE, pattern = "^\\\\.gg_battle_"), envir = environment())
`, {
      captureStreams: false,
      captureGraphics: false,
      captureConditions: false
    });
  } finally {
    await destroyCaptureResult(capture);
  }
}

function getDatasetObjectNames(datasetName) {
  return datasetName
    .split(',')
    .map(name => name.trim())
    .filter(name => /^[A-Za-z.][A-Za-z0-9._]*$/.test(name));
}

function quoteRString(value) {
  return JSON.stringify(value);
}

async function refreshVariables() {
  const variablesContainer = document.getElementById('variables-list');
  if (!variablesContainer || !shelter) return;

  renderVariableMessage('Reading variables...');

  let capture;
  try {
    capture = await captureSessionR(getVariableSummaryCode(), {
      captureStreams: true,
      captureConditions: false
    });
    const output = (capture.output || [])
      .filter(evt => evt.type === 'stdout')
      .map(evt => evt.data)
      .join('\n');

    renderVariables(parseVariableOutput(output));
  } catch (err) {
    console.error('Error reading R variables:', err);
    renderVariableMessage('Unable to read variables.');
  } finally {
    await destroyCaptureResult(capture);
  }
}

function getVariableSummaryCode() {
  return `
.gg_battle_names <- ls(all.names = FALSE)

for (.gg_battle_name in .gg_battle_names) {
  .gg_battle_value <- get(.gg_battle_name, envir = environment())
  .gg_battle_class <- paste(class(.gg_battle_value), collapse = "/")
  .gg_battle_size <- tryCatch({
    .gg_battle_dim <- dim(.gg_battle_value)
    if (!is.null(.gg_battle_dim)) {
      paste(.gg_battle_dim, collapse = " x ")
    } else {
      paste0("length ", length(.gg_battle_value))
    }
  }, error = function(.gg_battle_err) "unknown")

  cat(.gg_battle_name, .gg_battle_class, .gg_battle_size, sep = "\\t")
  cat("\\n")
}

rm(list = ls(all.names = TRUE, pattern = "^\\\\.gg_battle_"), envir = environment())
`;
}

function parseVariableOutput(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, type, size] = line.split('\t');
      return { name, type: type || '', size: size || '' };
    })
    .filter(variable => variable.name);
}

function renderVariables(variables) {
  const variablesContainer = document.getElementById('variables-list');
  if (!variablesContainer) return;

  if (variables.length === 0) {
    renderVariableMessage('No variables in the R session yet.');
    return;
  }

  const table = document.createElement('table');
  table.className = 'variables-table';

  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Name', 'Type', 'Size'].forEach(label => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  });
  header.append(headerRow);

  const body = document.createElement('tbody');
  variables.forEach(variable => {
    const row = document.createElement('tr');
    [variable.name, variable.type, variable.size].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });

  table.append(header, body);
  variablesContainer.replaceChildren(table);
}

function renderVariableMessage(message) {
  const variablesContainer = document.getElementById('variables-list');
  if (!variablesContainer) return;

  const messageElement = document.createElement('p');
  messageElement.className = 'variables-empty';
  messageElement.textContent = message;
  variablesContainer.replaceChildren(messageElement);
}

function setRunButtonReady(runButton) {
  setTerminalBusy(false);

  if (!runButton) return;

  runButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style="vertical-align:middle; margin-right: 0.4rem;">
      <polygon points="5,3 17,10 5,17"></polygon>
    </svg> Run & Compare
  `;
  runButton.disabled = false;
  runButton.onclick = runAndCompare;
}

function setRunButtonRunning(runButton) {
  setTerminalBusy(true, 'Running script...');

  if (!runButton) return;

  runButton.textContent = 'Running...';
  runButton.disabled = true;
}

function extractRequiredPackages(rCode) {
  return rCode
    .split('\n')
    .filter(line => line.trim().startsWith('library('))
    .map(line => {
      const match = line.match(/library\(([^)]+)\)/);
      return match ? match[1].replace(/['"]/g, '').trim() : null;
    })
    .filter(Boolean);
}

function extractChallengeOptions(rCode) {
  const options = {};

  rCode.split(/\r?\n/).forEach(line => {
    const match = line.match(/^#\|\s*([\w-]+)\s*:\s*["'](.+?)["']\s*$/);
    if (!match) return;

    options[match[1]] = match[2];
  });

  return options;
}

function drawDefaultImage(canvas) {
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PLOT_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#495057';
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('No plot', canvas.width / 2, canvas.height / 2);
}

async function renderUserPlot(userCode) {
  let renderedPlot = false;
  let capture;
  const code = getExecutableCode(userCode);

  try {
    capture = await captureSessionR(code, {
      withAutoprint: true,
      captureStreams: true,
      captureGraphics: WEBR_GRAPHICS_SIZE,
      captureConditions: false
    });

    writeOutput(getCaptureOutputText(capture));

    if (capture.images.length > 0) {
      drawImageToCanvas(document.getElementById('canvas'), capture.images[0]);
      renderedPlot = true;
    }
  } finally {
    await destroyCaptureResult(capture);

    if (!renderedPlot) {
      drawDefaultImage(document.getElementById('canvas'));
    }
  }

  return renderedPlot;
}

function getUserScriptCode() {
  saveActiveScript();
  return editor.getValue();
}

function getExecutableCode(userCode = getUserScriptCode()) {
  const code = userCode;
  return preRunCode ? `${preRunCode}\n${code}` : code;
}

async function runAndCompare() {
  const runButton = document.getElementById('runButton');
  const scoredCode = getUserScriptCode();
  setRunButtonRunning(runButton);

  try {
    await cleanupSessionWorkspace();
    await renderUserPlot(scoredCode);
    const codeScore = await calculateCodeSimilarity(scoredCode);
    renderCodeSimilarity(codeScore);
    window.compareRenderedPlot?.({
      code: scoredCode,
      codeScore,
      source: 'full-script'
    });
    await refreshVariables();
  } catch (err) {
    console.error('Error running R code:', err);
    writeOutput(`Error running R code: ${err.message}`);
  } finally {
    setRunButtonReady(runButton);
  }
}

async function calculateCodeSimilarity(userCode) {
  if (!challengeSourceCode) return null;

  const userPlotFeatures = await getCurrentPlotFeatures();
  if (targetPlotFeatures?.length && userPlotFeatures?.length) {
    return scoreFeatureOverlap(userPlotFeatures, targetPlotFeatures);
  }

  let capture;
  try {
    capture = await captureSessionR(getCodeSimilarityR(
      userCode,
      challengeSourceCode,
      challengePlotVariable
    ), {
      captureStreams: true,
      captureGraphics: false,
      captureConditions: false
    });

    const output = getCaptureOutputText(capture);
    const match = output.match(/GG_BATTLE_CODE_SCORE:([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) : null;
  } catch (err) {
    console.warn('Unable to calculate code similarity:', err);
    return null;
  } finally {
    await destroyCaptureResult(capture);
  }
}

async function getCurrentPlotFeatures(plotVariable = '') {
  let capture;
  try {
    capture = await captureSessionR(getPlotFeaturesR(plotVariable), {
      captureStreams: true,
      captureGraphics: false,
      captureConditions: false
    });

    return getCaptureOutputText(capture)
      .split(/\r?\n/)
      .filter(line => line.startsWith('GG_BATTLE_PLOT_FEATURE:'))
      .map(line => line.slice('GG_BATTLE_PLOT_FEATURE:'.length));
  } catch (err) {
    console.warn('Unable to inspect the ggplot build tree:', err);
    return null;
  } finally {
    await destroyCaptureResult(capture);
  }
}

function scoreFeatureOverlap(userFeatures, targetFeatures) {
  const userCounts = countFeatures(userFeatures);
  const targetCounts = countFeatures(targetFeatures);
  let overlap = 0;

  userCounts.forEach((count, feature) => {
    overlap += Math.min(count, targetCounts.get(feature) || 0);
  });

  return Number((200 * overlap / (userFeatures.length + targetFeatures.length)).toFixed(2));
}

function countFeatures(features) {
  const counts = new Map();
  features.forEach(feature => counts.set(feature, (counts.get(feature) || 0) + 1));
  return counts;
}

function getPlotFeaturesR(plotVariable) {
  return `
local({
  requested_plot <- ${quoteRString(plotVariable)}
  plot <- if (nzchar(requested_plot) && exists(requested_plot, inherits = TRUE)) {
    get(requested_plot, inherits = TRUE)
  } else {
    ggplot2::last_plot()
  }

  if (!inherits(plot, "ggplot")) return(invisible(NULL))

  builder <- get0("build_ggplot", envir = asNamespace("ggplot2"), mode = "function")
  if (is.null(builder)) builder <- ggplot2::ggplot_build
  built <- tryCatch(builder(plot), error = function(error) NULL)
  if (is.null(built)) return(invisible(NULL))

  features <- character()
  add <- function(value) {
    value <- gsub("[\\r\\n]+", " ", as.character(value))
    features <<- c(features, value)
  }
  normalise_name <- function(value) sub("colour", "color", value, fixed = TRUE)
  class_name <- function(value) {
    classes <- class(value)
    classes <- classes[!classes %in% c("ggproto", "gg")]
    if (length(classes)) classes[[1L]] else typeof(value)
  }
  value_text <- function(value) {
    paste(deparse(value, width.cutoff = 500L), collapse = "")
  }
  add_values <- function(prefix, value, depth = 0L) {
    if (depth > 4L || is.environment(value) || is.function(value) || is.language(value)) {
      return(invisible(NULL))
    }
    if (is.null(value)) {
      add(paste0(prefix, ":NULL"))
    } else if (is.atomic(value) || inherits(value, "unit")) {
      if (length(value) <= 20L) {
        add(paste0(prefix, ":", class_name(value), ":", value_text(value)))
      } else {
        add(paste0(prefix, ":", class_name(value), ":length=", length(value)))
      }
    } else if (is.list(value)) {
      value_names <- names(value)
      if (is.null(value_names)) value_names <- rep("", length(value))
      for (index in seq_along(value)) {
        name <- normalise_name(value_names[[index]])
        if (!nzchar(name)) name <- as.character(index)
        add_values(paste0(prefix, "$", name), value[[index]], depth + 1L)
      }
    } else {
      add(paste0(prefix, ":class=", class_name(value)))
    }
    invisible(NULL)
  }

  for (index in seq_along(built$plot$layers)) {
    layer <- built$plot$layers[[index]]
    prefix <- paste0("layer:", index)
    add(paste0(prefix, ":geom:", class_name(layer$geom)))
    add(paste0(prefix, ":stat:", class_name(layer$stat)))
    add(paste0(prefix, ":position:", class_name(layer$position)))

    mapping <- layer$computed_mapping
    if (is.null(mapping)) mapping <- layer$mapping
    for (aesthetic in sort(unique(normalise_name(names(mapping))))) {
      add(paste0(prefix, ":mapping:", aesthetic))
    }

    geom_params <- layer$computed_geom_params
    if (is.null(geom_params)) geom_params <- layer$geom_params
    stat_params <- layer$computed_stat_params
    if (is.null(stat_params)) stat_params <- layer$stat_params
    add_values(paste0(prefix, ":geom-param"), geom_params)
    add_values(paste0(prefix, ":stat-param"), stat_params)

    layer_data <- built$data[[index]]
    data_names <- names(layer_data)
    for (column_index in seq_along(data_names)) {
      column <- normalise_name(data_names[[column_index]])
      add(paste0(prefix, ":output:", column))
      values <- layer_data[[column_index]]
      if (length(values) && (is.atomic(values) || is.factor(values)) &&
          length(unique(values)) == 1L) {
        add_values(paste0(prefix, ":constant:", column), values[[1L]])
      }
    }
  }

  scales <- built$plot$scales$scales
  for (scale in scales) {
    aesthetics <- sort(unique(normalise_name(scale$aesthetics)))
    prefix <- paste0("scale:", paste(aesthetics, collapse = ","))
    add(paste0(prefix, ":class:", class_name(scale)))
    add_values(paste0(prefix, ":limits"), tryCatch(scale$get_limits(), error = function(error) NULL))
    breaks <- tryCatch(scale$get_breaks(), error = function(error) NULL)
    add_values(paste0(prefix, ":breaks"), breaks)
    add_values(
      paste0(prefix, ":labels"),
      tryCatch(scale$get_labels(breaks), error = function(error) NULL)
    )
    add_values(
      paste0(prefix, ":mapped"),
      tryCatch(scale$map(scale$get_limits()), error = function(error) NULL)
    )
  }

  add(paste0("coordinates:", class_name(built$plot$coordinates)))
  add(paste0("facet:", class_name(built$plot$facet)))
  add_values("facet-param", built$plot$facet$params)

  for (label in intersect(c("title", "subtitle", "caption", "tag"), names(built$plot$labels))) {
    add_values(paste0("label:", label), built$plot$labels[[label]])
  }

  grob <- tryCatch(grid::grid.force(ggplot2::ggplotGrob(plot)), error = function(error) NULL)
  if (!is.null(grob)) {
    listing <- grid::grid.ls(grob, recursive = TRUE, print = FALSE)
    grob_names <- gsub("([.-])[0-9]+(?=([.-]|$))", "", listing$name, perl = TRUE)
    meaningful <- grepl(
      "geom_|stat_|panel\\\\.|axis|guide|legend|strip|title|subtitle|caption",
      grob_names
    )
    for (index in which(meaningful)) {
      add(paste0(
        "grob:", listing$gDepth[[index]], ":", listing$type[[index]], ":",
        grob_names[[index]]
      ))
    }
  }

  for (feature in features) cat("GG_BATTLE_PLOT_FEATURE:", feature, "\\n", sep = "")
})
`;
}

function renderCodeSimilarity(score) {
  const element = document.getElementById('code-similarity-score');
  if (!element) return;

  element.textContent = Number.isFinite(score)
    ? `${score.toFixed(2)}%`
    : 'N/A';
}

function getCodeSimilarityR(userCode, solutionCode, plotVariable) {
  return `
local({
  user_code <- ${quoteRString(userCode)}
  solution_code <- ${quoteRString(solutionCode)}
  solution_plot_variable <- ${quoteRString(plotVariable)}

  parse_code <- function(code) {
    tryCatch(parse(text = code, keep.source = FALSE), error = function(error) NULL)
  }

  assignment_parts <- function(expression) {
    if (!is.call(expression)) return(NULL)
    operator <- as.character(expression[[1L]])

    if (operator %in% c("<-", "=")) {
      name <- expression[[2L]]
      value <- expression[[3L]]
    } else if (identical(operator, "->")) {
      name <- expression[[3L]]
      value <- expression[[2L]]
    } else {
      return(NULL)
    }

    if (!is.symbol(name)) return(NULL)
    list(name = as.character(name), value = value)
  }

  make_assignments <- function(expressions) {
    assignments <- list()
    for (expression in expressions) {
      parts <- assignment_parts(expression)
      if (!is.null(parts)) assignments[[parts$name]] <- parts$value
    }
    assignments
  }

  contains_ggplot <- function(expression, assignments, seen = character()) {
    if (is.symbol(expression)) {
      name <- as.character(expression)
      if (name %in% seen || is.null(assignments[[name]])) return(FALSE)
      return(contains_ggplot(assignments[[name]], assignments, c(seen, name)))
    }
    if (!is.call(expression)) return(FALSE)

    function_name <- if (is.symbol(expression[[1L]])) as.character(expression[[1L]]) else ""
    if (function_name %in% c("ggplot", "qplot")) return(TRUE)

    any(vapply(as.list(expression)[-1L], contains_ggplot, logical(1),
      assignments = assignments, seen = seen))
  }

  find_plot_root <- function(expressions, assignments, requested_name = "") {
    if (nzchar(requested_name) && !is.null(assignments[[requested_name]])) {
      return(as.name(requested_name))
    }

    for (index in rev(seq_along(expressions))) {
      expression <- expressions[[index]]
      if (is.call(expression) && identical(as.character(expression[[1L]]), "print") &&
          length(expression) >= 2L) {
        return(expression[[2L]])
      }

      parts <- assignment_parts(expression)
      if (!is.null(parts) && contains_ggplot(parts$value, assignments)) {
        return(as.name(parts$name))
      }

      if (contains_ggplot(expression, assignments)) return(expression)
    }

    if (length(expressions)) expressions[[length(expressions)]] else NULL
  }

  normalise_name <- function(value) {
    value <- sub("colour", "color", value, fixed = TRUE)
    value
  }

  ast_features <- function(expression, assignments) {
    features <- character()

    add_feature <- function(feature) {
      features <<- c(features, feature)
    }

    get_call_arguments <- function(node) {
      arguments <- as.list(node)[-1L]
      argument_names <- names(arguments)
      if (is.null(argument_names)) argument_names <- rep("", length(arguments))
      names(arguments) <- vapply(argument_names, normalise_name, character(1))
      arguments
    }

    visit_flattened <- function(node, context, seen) {
      if (is.call(node) && is.symbol(node[[1L]]) &&
          identical(as.character(node[[1L]]), "c")) {
        for (value in as.list(node)[-1L]) visit(value, context, seen)
      } else {
        visit(node, context, seen)
      }
    }

    visit_limits <- function(axis, values, seen) {
      context <- paste0("scale:", axis, "$limits")
      add_feature(paste0("property:scale:", axis, ":limits"))
      for (value in values) visit_flattened(value, context, seen)
    }

    visit_label <- function(label, value, seen) {
      context <- paste0("label:", label)
      add_feature(paste0("property:", context))
      visit(value, context, seen)
    }

    visit_continuous_scale <- function(axis, arguments, seen) {
      formal_names <- c(
        "name", "breaks", "minor_breaks", "n.breaks", "labels", "limits",
        "expand", "oob", "na.value", "transform", "trans", "guide",
        "position", "sec.axis"
      )

      for (index in seq_along(arguments)) {
        argument_name <- names(arguments)[[index]]
        if (!nzchar(argument_name) && index <= length(formal_names)) {
          argument_name <- formal_names[[index]]
        }

        if (identical(argument_name, "limits")) {
          visit_limits(axis, list(arguments[[index]]), seen)
        } else if (identical(argument_name, "name")) {
          visit_label(axis, arguments[[index]], seen)
        } else {
          property <- if (nzchar(argument_name)) argument_name else paste0("arg", index)
          context <- paste0("scale:", axis, "$", property)
          add_feature(paste0("property:scale:", axis, ":", property))
          visit(arguments[[index]], context, seen)
        }
      }
    }

    visit_labels <- function(arguments, seen) {
      for (index in seq_along(arguments)) {
        label <- names(arguments)[[index]]
        if (!nzchar(label)) label <- paste0("arg", index)
        visit_label(label, arguments[[index]], seen)
      }
    }

    visit <- function(node, context = "root", seen = character()) {
      if (is.null(node)) return(invisible(NULL))

      if (is.symbol(node)) {
        name <- as.character(node)
        if (!name %in% seen && !is.null(assignments[[name]])) {
          visit(assignments[[name]], context, c(seen, name))
        } else {
          # Keep the symbol's structural role, but deliberately ignore its name.
          # This makes equivalent code invariant to renamed datasets, columns,
          # intermediate objects, and other user-defined variables.
          add_feature(paste0("symbol:", context))
        }
        return(invisible(NULL))
      }

      if (is.atomic(node)) {
        value <- paste(deparse(node, width.cutoff = 500L), collapse = "")
        add_feature(paste0("value:", context, ":", value))
        return(invisible(NULL))
      }

      if (!is.call(node)) return(invisible(NULL))

      function_name <- if (is.symbol(node[[1L]])) {
        normalise_name(as.character(node[[1L]]))
      } else {
        normalise_name(paste(deparse(node[[1L]], width.cutoff = 500L), collapse = ""))
      }

      arguments <- get_call_arguments(node)

      if (function_name %in% c("|>", "%>%") && length(arguments) >= 2L &&
          is.call(arguments[[2L]])) {
        right_call <- as.list(arguments[[2L]])
        piped_call <- as.call(c(right_call[1L], list(arguments[[1L]]), right_call[-1L]))
        visit(piped_call, context, seen)
        return(invisible(NULL))
      }

      if (function_name %in% c("xlim", "ylim")) {
        visit_limits(substr(function_name, 1L, 1L), arguments, seen)
        return(invisible(NULL))
      }

      if (identical(function_name, "lims")) {
        for (axis in intersect(c("x", "y"), names(arguments))) {
          visit_limits(axis, list(arguments[[axis]]), seen)
        }
        return(invisible(NULL))
      }

      if (function_name %in% c("scale_x_continuous", "scale_y_continuous")) {
        visit_continuous_scale(substr(function_name, 7L, 7L), arguments, seen)
        return(invisible(NULL))
      }

      if (identical(function_name, "labs")) {
        visit_labels(arguments, seen)
        return(invisible(NULL))
      }

      if (function_name %in% c("xlab", "ylab") && length(arguments)) {
        visit_label(substr(function_name, 1L, 1L), arguments[[1L]], seen)
        return(invisible(NULL))
      }

      if (identical(function_name, "ggtitle")) {
        title_labels <- c("title", "subtitle")
        for (index in seq_along(arguments)) {
          label <- names(arguments)[[index]]
          if (!nzchar(label) && index <= length(title_labels)) label <- title_labels[[index]]
          if (!nzchar(label)) label <- paste0("arg", index)
          visit_label(label, arguments[[index]], seen)
        }
        return(invisible(NULL))
      }

      original_function_name <- function_name
      if (identical(function_name, "aes_string")) function_name <- "aes"

      transparent_calls <- c("(", "{", "<-", "=", "->", "+")

      if (!function_name %in% transparent_calls) {
        add_feature(paste0("call:", function_name))
      }

      for (index in seq_along(arguments)) {
        argument_name <- names(arguments)[[index]]
        child_context <- if (function_name %in% transparent_calls) context else function_name
        if (nzchar(argument_name)) {
          if (!function_name %in% transparent_calls) {
            add_feature(paste0("arg:", function_name, ":", argument_name))
          }
          child_context <- paste0(function_name, "$", argument_name)
        }

        if (identical(original_function_name, "aes_string") &&
            is.character(arguments[[index]])) {
          for (value in arguments[[index]]) add_feature(paste0("symbol:", child_context))
        } else {
          visit(arguments[[index]], child_context, seen)
        }
      }

      invisible(NULL)
    }

    visit(expression)
    features
  }

  score_features <- function(user_features, solution_features) {
    if (!length(user_features) && !length(solution_features)) return(100)
    if (!length(user_features) || !length(solution_features)) return(0)

    user_counts <- table(user_features)
    solution_counts <- table(solution_features)
    shared_names <- intersect(names(user_counts), names(solution_counts))
    overlap <- sum(pmin(user_counts[shared_names], solution_counts[shared_names]))
    200 * overlap / (length(user_features) + length(solution_features))
  }

  user_expressions <- parse_code(user_code)
  solution_expressions <- parse_code(solution_code)

  if (is.null(user_expressions) || is.null(solution_expressions)) {
    score <- NA_real_
  } else {
    user_assignments <- make_assignments(user_expressions)
    solution_assignments <- make_assignments(solution_expressions)
    user_root <- find_plot_root(user_expressions, user_assignments)
    solution_root <- find_plot_root(
      solution_expressions,
      solution_assignments,
      solution_plot_variable
    )
    score <- score_features(
      ast_features(user_root, user_assignments),
      ast_features(solution_root, solution_assignments)
    )
  }

  if (is.finite(score)) {
    cat(sprintf("GG_BATTLE_CODE_SCORE:%.2f", score))
  }
})
`;
}

function markScoreStale(reason) {
  document.dispatchEvent(new CustomEvent('battle-score-stale', {
    detail: { reason }
  }));
}

function drawImageToCanvas(canvas, image) {
  if (!canvas) return;

  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PLOT_BACKGROUND;
  ctx.imageSmoothingEnabled = false;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function writeOutput(message) {
  appendTerminalText(message);
}

function getChallengeId() {
  if (window.getCurrentChallengeId) {
    return window.getCurrentChallengeId();
  }

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 1 && parts[parts.length - 1].startsWith('index')) {
    return parts[parts.length - 2];
  }
  return parts[parts.length - 1] || '';
}
