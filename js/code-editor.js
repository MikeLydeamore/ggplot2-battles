import { initLeaderboard } from './leaderboard.js';

let editor;
let shelter;
let webR;
let preRunCode = '';

const PLOT_BACKGROUND = 'rgba(255,255,255,1)';
const WEBR_GRAPHICS_SIZE = { width: 350, height: 200 };

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

  editor = setupEditor();
  initLeaderboard({
    challengeId,
    getCode: () => editor.getValue()
  });

  try {
    await initializeWebR();
    const challengeSource = await loadChallengeSource(challengeId);
    await initializeChallenge(challengeSource);
    setRunButtonReady(runButton);
  } catch (err) {
    console.error('Error initializing challenge:', err);
    writeOutput(`Error initializing challenge: ${err.message}`);
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
    maxLines: Infinity,
    minLines: 20,
    enableAutoIndent: true,
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    enableSnippets: true
  });
  aceEditor.setTheme('ace/theme/monokai');
  aceEditor.session.setUseWrapMode(true);
  aceEditor.session.setTabSize(2);

  return aceEditor;
}

async function initializeWebR() {
  const { WebR } = await import('https://webr.r-wasm.org/latest/webr.mjs');
  webR = new WebR();
  await webR.init();
  await webR.evalRVoid('options(device=function(...){webr::canvas(width=350, height=200)})');
  shelter = await new webR.Shelter();
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

  renderChallengeDetails(options);
  setStarterCode(options);
  await renderTargetPlot(challengeSource);
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

  editor.setValue(starterCode, -1);
}

async function renderTargetPlot(challengeSource) {
  let capture;
  try {
    capture = await shelter.captureR(challengeSource, {
      captureGraphics: WEBR_GRAPHICS_SIZE
    });

    if (capture.images.length === 0) return;

    drawImageToCanvas(document.getElementById('canvas-base'), capture.images[0]);
    drawImageToCanvas(document.getElementById('canvas-target'), capture.images[0]);
  } finally {
    shelter.purge();
  }
}

function setRunButtonReady(runButton) {
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

async function renderUserPlot() {
  let renderedPlot = false;
  let capture;
  const code = getExecutableCode();

  try {
    capture = await shelter.captureR(code, {
      withAutoprint: true,
      captureStreams: true,
      captureGraphics: WEBR_GRAPHICS_SIZE,
      captureConditions: false
    });

    const output = capture.output
      .filter(evt => evt.type === 'stdout' || evt.type === 'stderr')
      .map(evt => evt.data);

    writeOutput(output.join('\n'));

    if (capture.images.length > 0) {
      drawImageToCanvas(document.getElementById('canvas'), capture.images[0]);
      renderedPlot = true;
    }
  } finally {
    shelter.purge();

    if (!renderedPlot) {
      drawDefaultImage(document.getElementById('canvas'));
    }
  }

  return renderedPlot;
}

function getExecutableCode() {
  const code = editor.getValue();
  return preRunCode ? `${preRunCode}\n${code}` : code;
}

async function runAndCompare() {
  const runButton = document.getElementById('runButton');
  setRunButtonRunning(runButton);

  try {
    await renderUserPlot();
    window.compareRenderedPlot?.();
  } catch (err) {
    console.error('Error running R code:', err);
    writeOutput(`Error running R code: ${err.message}`);
  } finally {
    setRunButtonReady(runButton);
  }
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
  const output = document.getElementById('out');
  if (output) {
    output.innerText = message;
  }
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
