let sliderContainer;
let userCanvas;
let targetCanvas;
let sliderHandle;
let diffToggle;
let similarityScore;
let scoreAnimation;
let syncedPlotWidth = null;

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

  if (!sliderContainer || !userCanvas || !targetCanvas || !sliderHandle) {
    return;
  }

  comparisonInitialized = true;

  fillInitialCanvas(userCanvas);
  setupDiffCanvas();
  syncPlotSizes();
  setupSlider();
  setupDiffToggle();
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
  const width = Math.floor(Math.min(
    700,
    targetSize.width,
    outputSize.width,
    targetSize.height * 1.75,
    outputSize.height * 1.75
  ));
  if (!Number.isFinite(width) || width <= 0) return;

  if (width !== syncedPlotWidth) {
    document.documentElement.style.setProperty('--plot-width', `${width}px`);
    syncedPlotWidth = width;
  }
  updateClip(width / 2);
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

function compareRenderedPlot() {
  if (!userCanvas || !targetCanvas) {
    console.error('Cannot compare plots because canvases are missing.');
    return;
  }

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
  animateSimilarityScore(score);
  dispatchScore(score);

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

function dispatchScore(score) {
  document.dispatchEvent(new CustomEvent('battle-score-updated', {
    detail: { score }
  }));
}

window.compareRenderedPlot = compareRenderedPlot;
window.syncPlotSizes = syncPlotSizes;
