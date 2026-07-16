let sliderContainer;
let userCanvas;
let targetCanvas;
let sliderHandle;
let diffToggle;
let similarityScore;
let zoomOutButton;
let zoomInButton;
let zoomResetButton;
let zoomValue;
let scoreAnimation;
let syncedPlotWidth = null;
let plotZoom = 1;
let plotPanContainers = [];
let activePlotPanContainer = null;
let plotPanPointerId = null;
let plotPanStart = null;
let isSyncingPlotScroll = false;
let pendingComparisonDetail = {};

const BEST_SCORE_STORAGE_KEY = 'ggplot-battles-best-scores-v1';
const PLOT_MAX_FIT_WIDTH = 840;
const PLOT_ZOOM_MIN = 0.75;
const PLOT_ZOOM_MAX = 2;
const PLOT_ZOOM_STEP = 0.1;

const diffCanvas = document.createElement('canvas');
diffCanvas.id = 'diff-canvas';
diffCanvas.width = 700;
diffCanvas.height = 400;
diffCanvas.style.cssText = `
  display: none;
  position: absolute;
  top: 0;
  left: 0;
`;

let comparisonInitialized = false;

document.addEventListener('editor-ready', setupComparisonView);
queueMicrotask(setupComparisonView);

function setupComparisonView() {
  if (comparisonInitialized) return;

  sliderContainer = document.getElementById('sliderContainer');
  userCanvas = document.getElementById('canvas');
  targetCanvas = document.getElementById('canvas-base');
  sliderHandle = document.getElementById('slider');
  diffToggle = document.getElementById('show-diff');
  similarityScore = document.getElementById('similarity-score');
  zoomOutButton = document.getElementById('plot-zoom-out');
  zoomInButton = document.getElementById('plot-zoom-in');
  zoomResetButton = document.getElementById('plot-zoom-reset');
  zoomValue = document.getElementById('plot-zoom-value');

  if (!sliderContainer || !userCanvas || !targetCanvas || !sliderHandle) {
    return;
  }

  comparisonInitialized = true;

  fillInitialCanvas(userCanvas);
  setupDiffCanvas();
  setupSlider();
  setupDiffToggle();
  setupZoomControls();
  setupPlotPanning();
  syncPlotSizes();
  setupResizeObserver();
}

function fillInitialCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(44,47,51,1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setupDiffCanvas() {
  if (!diffCanvas.parentElement) {
    sliderContainer.appendChild(diffCanvas);
  }
}

function setupSlider() {
  let isDragging = false;

  sliderHandle.addEventListener('pointerdown', event => {
    isDragging = true;
    sliderHandle.setPointerCapture(event.pointerId);
  });

  sliderHandle.addEventListener('pointermove', event => {
    if (!isDragging) return;

    const rect = sliderContainer.getBoundingClientRect();
    updateClip(event.clientX - rect.left);
  });

  sliderHandle.addEventListener('pointerup', event => {
    isDragging = false;
    sliderHandle.releasePointerCapture(event.pointerId);
  });

  updateClip(sliderContainer.getBoundingClientRect().width / 2);
}

function setupDiffToggle() {
  if (!diffToggle) return;

  diffToggle.disabled = true;
  diffToggle.addEventListener('change', updateDiffVisibility);
}

function setupZoomControls() {
  zoomOutButton?.addEventListener('click', () => setPlotZoom(plotZoom - PLOT_ZOOM_STEP));
  zoomInButton?.addEventListener('click', () => setPlotZoom(plotZoom + PLOT_ZOOM_STEP));
  zoomResetButton?.addEventListener('click', () => setPlotZoom(1));
  updateZoomControls();
}

function setPlotZoom(nextZoom) {
  const clampedZoom = clampZoom(nextZoom);
  if (clampedZoom === plotZoom) return;

  plotZoom = clampedZoom;
  syncPlotSizes();
  updateZoomControls();
}

function clampZoom(value) {
  return Math.min(PLOT_ZOOM_MAX, Math.max(PLOT_ZOOM_MIN, Number(value.toFixed(2))));
}

function updateZoomControls() {
  if (zoomValue) {
    zoomValue.textContent = `${Math.round(plotZoom * 100)}%`;
  }
  if (zoomOutButton) {
    zoomOutButton.disabled = plotZoom <= PLOT_ZOOM_MIN;
  }
  if (zoomInButton) {
    zoomInButton.disabled = plotZoom >= PLOT_ZOOM_MAX;
  }
}

function setupPlotPanning() {
  plotPanContainers = Array.from(document.querySelectorAll('.ide-plot-body, .ide-output-body'));

  plotPanContainers.forEach(container => {
    container.classList.add('is-pannable');
    container.addEventListener('pointerdown', handlePlotPanPointerDown);
    container.addEventListener('scroll', () => syncPlotScroll(container), { passive: true });
  });
}

function handlePlotPanPointerDown(event) {
  if (shouldIgnorePlotPan(event)) return;

  const container = event.currentTarget;
  if (!canPanPlotContainer(container)) return;

  activePlotPanContainer = container;
  plotPanPointerId = event.pointerId;
  plotPanStart = {
    x: event.clientX,
    y: event.clientY,
    left: container.scrollLeft,
    top: container.scrollTop
  };

  container.classList.add('is-panning');
  container.setPointerCapture(event.pointerId);
  container.addEventListener('pointermove', handlePlotPanPointerMove);
  container.addEventListener('pointerup', handlePlotPanPointerEnd);
  container.addEventListener('pointercancel', handlePlotPanPointerEnd);
  event.preventDefault();
}

function handlePlotPanPointerMove(event) {
  if (
    !activePlotPanContainer
    || !plotPanStart
    || event.pointerId !== plotPanPointerId
  ) {
    return;
  }

  activePlotPanContainer.scrollLeft = plotPanStart.left - (event.clientX - plotPanStart.x);
  activePlotPanContainer.scrollTop = plotPanStart.top - (event.clientY - plotPanStart.y);
  syncPlotScroll(activePlotPanContainer);
  event.preventDefault();
}

function handlePlotPanPointerEnd(event) {
  if (!activePlotPanContainer || event.pointerId !== plotPanPointerId) return;

  activePlotPanContainer.classList.remove('is-panning');
  activePlotPanContainer.releasePointerCapture(event.pointerId);
  activePlotPanContainer.removeEventListener('pointermove', handlePlotPanPointerMove);
  activePlotPanContainer.removeEventListener('pointerup', handlePlotPanPointerEnd);
  activePlotPanContainer.removeEventListener('pointercancel', handlePlotPanPointerEnd);
  activePlotPanContainer = null;
  plotPanPointerId = null;
  plotPanStart = null;
}

function shouldIgnorePlotPan(event) {
  if (event.button !== 0) return true;
  if (!(event.target instanceof Element)) return false;

  return Boolean(event.target.closest('.slider, button, input, label'));
}

function canPanPlotContainer(container) {
  return container.scrollWidth > container.clientWidth
    || container.scrollHeight > container.clientHeight;
}

function syncPlotScroll(sourceContainer) {
  if (isSyncingPlotScroll) return;

  isSyncingPlotScroll = true;
  plotPanContainers.forEach(container => {
    if (container === sourceContainer) return;
    container.scrollLeft = sourceContainer.scrollLeft;
    container.scrollTop = sourceContainer.scrollTop;
  });
  isSyncingPlotScroll = false;
}

function updateClip(x) {
  if (!userCanvas || !sliderHandle) return;

  const containerWidth = sliderContainer.getBoundingClientRect().width;
  const clampedX = Math.max(0, Math.min(containerWidth, x));
  userCanvas.style.clipPath = `inset(0px 0px 0px ${clampedX}px)`;
  sliderHandle.style.left = `${clampedX}px`;
}

function setupResizeObserver() {
  if (!('ResizeObserver' in window)) return;

  const observer = new ResizeObserver(() => {
    syncPlotSizes();
  });
  observer.observe(sliderContainer);

  const targetBody = document.querySelector('.ide-plot-body');
  const outputBody = document.querySelector('.ide-output-body');
  if (targetBody) {
    observer.observe(targetBody);
  }
  if (outputBody) {
    observer.observe(outputBody);
  }
}

function syncPlotSizes() {
  const targetBody = document.querySelector('.ide-plot-body');
  const outputBody = document.querySelector('.ide-output-body');
  if (!targetBody || !outputBody) return;

  const targetSize = getContentSize(targetBody);
  const outputSize = getContentSize(outputBody);
  const fitWidth = Math.floor(Math.min(
    PLOT_MAX_FIT_WIDTH,
    targetSize.width,
    outputSize.width,
    targetSize.height * 1.75,
    outputSize.height * 1.75
  ));
  const width = Math.floor(fitWidth * plotZoom);
  if (!Number.isFinite(width) || width <= 0) return;

  if (width !== syncedPlotWidth) {
    document.documentElement.style.setProperty('--plot-width', `${width}px`);
    syncedPlotWidth = width;
  }
  updateClip(width / 2);
  updateZoomControls();
}

function getContentSize(element) {
  const style = window.getComputedStyle(element);
  const width = element.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight);
  const height = element.clientHeight
    - parseFloat(style.paddingTop)
    - parseFloat(style.paddingBottom);

  return {
    width: Math.max(0, width),
    height: Math.max(0, height)
  };
}

function compareRenderedPlot(detail = {}) {
  if (!userCanvas || !targetCanvas) {
    console.error('Cannot compare plots because canvases are missing.');
    return;
  }

  pendingComparisonDetail = detail && typeof detail === 'object' ? detail : {};
  resetDiffView();

  const target = copyCanvas(targetCanvas);
  const rendered = copyCanvas(userCanvas);

  try {
    resemble(target.toDataURL())
      .compareTo(rendered.toDataURL())
      .outputSettings({
        errorColor: {
          red: 255,
          green: 255,
          blue: 0
        },
        errorType: 'movement',
        transparency: 0.3,
        largeImageThreshold: 2000,
        useCrossOrigin: false
      })
      .onComplete(handleComparisonResult);
  } catch (err) {
    console.error('Plot comparison failed:', err);
  }
}

function copyCanvas(sourceCanvas) {
  const offscreen = document.createElement('canvas');
  offscreen.width = sourceCanvas.width;
  offscreen.height = sourceCanvas.height;

  const ctx = offscreen.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);

  return offscreen;
}

function handleComparisonResult(data) {
  if (data.error) {
    console.error('Resemble.js error:', data.error);
    return;
  }

  const mismatch = parseFloat(data.misMatchPercentage);
  const score = Number((100 - mismatch).toFixed(2));
  const bestScore = saveLocalBestScore(score);
  animateSimilarityScore(score);
  dispatchScore(score, bestScore, pendingComparisonDetail);

  if (data.getImageDataUrl) {
    drawDiffImage(data.getImageDataUrl());
  }
}

function drawDiffImage(dataUrl) {
  const diffImage = new Image();
  diffImage.onload = () => {
    const diffCtx = diffCanvas.getContext('2d');
    diffCtx.clearRect(0, 0, diffCanvas.width, diffCanvas.height);
    diffCtx.drawImage(diffImage, 0, 0, diffCanvas.width, diffCanvas.height);

    if (diffToggle) {
      diffToggle.disabled = false;
    }
  };
  diffImage.src = dataUrl;
}

function resetDiffView() {
  if (diffToggle) {
    diffToggle.checked = false;
    diffToggle.disabled = true;
  }

  userCanvas.style.display = 'block';
  diffCanvas.style.display = 'none';
}

function updateDiffVisibility() {
  const showDiff = diffToggle.checked;
  userCanvas.style.display = showDiff ? 'none' : 'block';
  diffCanvas.style.display = showDiff ? 'block' : 'none';
}

function animateSimilarityScore(targetValue) {
  if (!similarityScore) return;

  clearInterval(scoreAnimation);

  const duration = 800;
  const frameRate = 30;
  const totalFrames = Math.round((duration / 1000) * frameRate);
  let currentFrame = 0;

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  scoreAnimation = setInterval(() => {
    currentFrame++;
    const progress = easeOut(currentFrame / totalFrames);
    const value = (targetValue * progress).toFixed(1);

    similarityScore.textContent = `${value}%`;

    if (currentFrame >= totalFrames) {
      similarityScore.textContent = `${targetValue.toFixed(2)}%`;
      clearInterval(scoreAnimation);
    }
  }, 1000 / frameRate);
}

function saveLocalBestScore(score) {
  const challengeId = getCurrentChallengeId();
  if (!challengeId || !Number.isFinite(score)) return null;

  const bestScores = readBestScores();
  const previousBest = Number(bestScores[challengeId]);
  if (Number.isFinite(previousBest) && previousBest >= score) {
    return previousBest;
  }

  bestScores[challengeId] = score;
  writeBestScores(bestScores);
  return score;
}

function readBestScores() {
  try {
    const storedScores = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    return storedScores ? JSON.parse(storedScores) : {};
  } catch (err) {
    console.warn('Unable to read local best scores:', err);
    return {};
  }
}

function writeBestScores(bestScores) {
  try {
    localStorage.setItem(BEST_SCORE_STORAGE_KEY, JSON.stringify(bestScores));
  } catch (err) {
    console.warn('Unable to save local best score:', err);
  }
}

function getCurrentChallengeId() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 1 && parts[parts.length - 1].startsWith('index')) {
    return parts[parts.length - 2];
  }
  return parts[parts.length - 1] || '';
}

function dispatchScore(score, bestScore, detail = {}) {
  document.dispatchEvent(new CustomEvent('battle-score-updated', {
    detail: { ...detail, score, pixelScore: score, bestScore }
  }));
}

window.compareRenderedPlot = compareRenderedPlot;
window.syncPlotSizes = syncPlotSizes;
