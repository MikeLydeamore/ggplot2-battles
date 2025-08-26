const container = document.getElementById('sliderContainer');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const slider = document.getElementById('slider');
const baseImage = document.getElementById('canvas-base');
const runButton = document.getElementById('runButton');
const result = document.getElementById('result');

// Create diff canvas (hidden by default)
const diffCanvas = document.createElement('canvas');
diffCanvas.id = 'diff-canvas';
diffCanvas.width = 700;
diffCanvas.height = 400;
diffCanvas.style.cssText = `
  border: 1px solid #6c757d;
  margin: auto;
  width: 700px;
  display: none;
  position: absolute;
  top: 0;
  left: 0;
`;

// Store diff image data
let diffImageData = null;

// Add diff toggle controls next to the Plot Output header
setTimeout(() => {
  const plotOutputHeader = document.querySelector('.subheader-pill');
  if (plotOutputHeader && plotOutputHeader.textContent.includes('Plot Output')) {

    const diffControls = document.createElement('div');
    // Apply h4-like styling to match the header
    diffControls.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 1rem 0;
      background: #23272b;
      border-bottom: 4px solid #181a1b;
      min-width: 20%;
      padding: 0.74rem 0;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'show-diff';
    checkbox.disabled = true; // Initially disabled until comparison is run
    checkbox.style.cssText = `
      margin: 0;
      transform: scale(1.0);
      accent-color: #212529;
    `;

    const checkboxLabel = document.createElement('label');
    checkboxLabel.htmlFor = 'show-diff';
    checkboxLabel.textContent = 'Diff View';

    diffControls.appendChild(checkbox);
    diffControls.appendChild(checkboxLabel);

    // Insert next to the header
    plotOutputHeader.parentNode.style.display = 'flex';
    plotOutputHeader.parentNode.style.alignItems = 'center';
    plotOutputHeader.parentNode.style.justifyContent = 'center';
    plotOutputHeader.parentNode.appendChild(diffControls);

    // Insert diff canvas into the slider container
    const sliderContainer = document.getElementById('sliderContainer');
    if (sliderContainer) {
      sliderContainer.style.position = 'relative';
      sliderContainer.appendChild(diffCanvas);
    }

    // Handle checkbox toggle
    checkbox.addEventListener('change', function () {
      if (this.checked && diffImageData) {
        // Show diff canvas
        canvas.style.display = 'none';
        diffCanvas.style.display = 'block';
      } else {
        // Show original canvas
        canvas.style.display = 'block';
        diffCanvas.style.display = 'none';
      }
    });
  }
}, 100);

ctx.fillStyle = 'rgba(44,47,51,1)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = 'white';
ctx.font = '40px sans-serif';
//ctx.fillText('No plot', 450, 200);

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

  // Compare using Resemble.js with diff output
  resemble(offCanvas1.toDataURL())
    .compareTo(offCanvas2.toDataURL())
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
    .onComplete(function (data) {
      if (data.error) {
        result.textContent = "Resemble.js error: " + data.error;
        diffInfo.textContent = "Error generating diff";
        return;
      }

      const mismatch = parseFloat(data.misMatchPercentage);
      const similarity = (100 - mismatch).toFixed(2);
      animateSimilarityScore(similarity);

      // Display the diff image
      if (data.getImageDataUrl) {
        const diffImg = new Image();
        diffImg.onload = function () {
          const diffCtx = diffCanvas.getContext('2d');
          diffCtx.clearRect(0, 0, diffCanvas.width, diffCanvas.height);
          diffCtx.drawImage(diffImg, 0, 0, diffCanvas.width, diffCanvas.height);

          // Store diff image data for toggling
          diffImageData = diffImg;

          // Enable the checkbox now that we have diff data
          const checkbox = document.getElementById('show-diff');
          if (checkbox) {
            checkbox.disabled = false;
            checkbox.parentElement.style.opacity = '1';
          }
        };
        diffImg.src = data.getImageDataUrl();
      } else {
        console.log("Diff image not available");
      }
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