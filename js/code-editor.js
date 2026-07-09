let editor;
let shelter;
let webR;
let sessionEnv;
let preRunCode = '';
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
  preRunCode = options['prerun-code'] || '';
  preservedSessionNames = getDatasetObjectNames(options['dataset-name'] || '');

  renderChallengeDetails(options);
  setStarterCode(options);
  await renderTargetPlot(challengeSource);
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
    window.compareRenderedPlot?.({ code: scoredCode, source: 'full-script' });
    await refreshVariables();
  } catch (err) {
    console.error('Error running R code:', err);
    writeOutput(`Error running R code: ${err.message}`);
  } finally {
    setRunButtonReady(runButton);
  }
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
