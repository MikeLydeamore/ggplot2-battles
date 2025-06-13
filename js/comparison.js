const container = document.getElementById('sliderContainer');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const slider = document.getElementById('slider');
const baseImage = document.getElementById('canvas-base');
const runButton = document.getElementById('runButton');
const result = document.getElementById('result');

ctx.fillStyle = 'rgba(44,47,51,1)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = 'white';
ctx.font = '40px sans-serif';
ctx.fillText('No plot', 450, 200);

function updateClip(x) {
  const clampedX = Math.max(0, Math.min(canvas.width, x));
  canvas.style.clipPath = `inset(0px 0px 0px ${clampedX}px)`;
  slider.style.left = `${clampedX}px`;
}

let isDragging = false;
slider.addEventListener('mousedown', () => isDragging = true);
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = container.getBoundingClientRect();
  updateClip(e.clientX - rect.left);
});

// Initial clip
updateClip(300);

function isCanvasEmpty(canvas) {
  const ctx = canvas.getContext('2d');
  const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < pixelData.length; i += 4) {
    if (
      pixelData[i] !== 44 ||      // Red
      pixelData[i + 1] !== 47 ||  // Green
      pixelData[i + 2] !== 51 ||  // Blue
      pixelData[i + 3] !== 255    // Alpha
    ) {
      return false; // Found a non-default pixel
    }
  }
  return true;
}

// Compare button
function handleRunButtonClick() {
  // Create offscreen canvases
  const offCanvas1 = document.createElement('canvas');
  const offCanvas2 = document.createElement('canvas');
  const width = canvas.width;
  const height = canvas.height;

  offCanvas1.width = offCanvas2.width = width;
  offCanvas1.height = offCanvas2.height = height;

  const ctx1 = offCanvas1.getContext('2d');
  const ctx2 = offCanvas2.getContext('2d');

  try {
    ctx1.drawImage(baseImage, 0, 0, width, height);
    ctx2.drawImage(canvas, 0, 0, width, height);
  } catch (err) {
    console.error("drawImage failed:", err);
    result.textContent = "Error drawing images for comparison.";
    return;
  }

  // Compare using Resemble.js
  resemble(offCanvas1.toDataURL())
    .compareTo(offCanvas2.toDataURL())
    .onComplete(function(data) {
      if (data.error) {
        result.textContent = "Resemble.js error: " + data.error;
        return;
      }
      const mismatch = parseFloat(data.misMatchPercentage);
      const similarity = (100 - mismatch).toFixed(2);
      animateSimilarityScore(similarity);
    });
}

function animateSimilarityScore(targetValue) {
  const el = document.getElementById("similarity-score");
  const duration = 800; // in ms
  const frameRate = 30; // frames per second
  const totalFrames = Math.round((duration / 1000) * frameRate);
  let currentFrame = 0;

  const initialValue = 0;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const interval = setInterval(() => {
    currentFrame++;
    const progress = easeOut(currentFrame / totalFrames);
    const value = (initialValue + (targetValue - initialValue) * progress).toFixed(1);

    el.textContent = `${value}%`;

    if (currentFrame >= totalFrames) {
      clearInterval(interval);
    }
  }, 1000 / frameRate);
}