// Initialize references when DOM is ready
let container, canvas, ctx, slider, baseImage, runButton, result;

// Function to initialize DOM references
function initializeDOMReferences() {
  container = document.getElementById('sliderContainer');
  canvas = document.getElementById('canvas');
  ctx = canvas?.getContext('2d');
  slider = document.getElementById('slider');
  baseImage = document.getElementById('canvas-base');
  runButton = document.getElementById('runButton');
  result = document.getElementById('result');
}

// Try to initialize immediately, but also set up for later if elements don't exist yet
initializeDOMReferences();

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

// Initialize diff functionality
setTimeout(() => {
  // Re-initialize DOM references in case they're now available
  initializeDOMReferences();

  // Add diff canvas to the slider container
  const sliderContainer = document.getElementById('sliderContainer');
  if (sliderContainer) {
    sliderContainer.style.position = 'relative';
    sliderContainer.appendChild(diffCanvas);
  }

  // Set up checkbox event handler
  const checkbox = document.getElementById('show-diff');
  if (checkbox) {
    checkbox.disabled = true;
    checkbox.addEventListener('change', function () {
      // Re-initialize in case canvas references are stale
      if (!canvas) initializeDOMReferences();

      if (this.checked && diffImageData && canvas) {
        // Show diff canvas
        canvas.style.display = 'none';
        diffCanvas.style.display = 'block';
      } else if (canvas) {
        // Show original canvas
        canvas.style.display = 'block';
        diffCanvas.style.display = 'none';
      }
    });
  }
}, 100);

// Setup canvas and slider functionality when elements are available
function setupCanvasAndSlider() {
  if (!canvas || !ctx || !container || !slider) {
    initializeDOMReferences();
  }

  if (canvas && ctx) {
    ctx.fillStyle = 'rgba(44,47,51,1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '40px sans-serif';
    //ctx.fillText('No plot', 450, 200);
  }

  if (container && slider) {
    let isDragging = false;
    slider.addEventListener('mousedown', () => isDragging = true);
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('mousemove', (e) => {
      if (!isDragging || !container || !canvas) return;
      const rect = container.getBoundingClientRect();
      updateClip(e.clientX - rect.left);
    });

    // Initial clip
    updateClip(300);
  }
}

// Call setup after a delay to ensure DOM is ready
setTimeout(setupCanvasAndSlider, 200);

function updateClip(x) {
  if (!canvas || !slider) return;
  const clampedX = Math.max(0, Math.min(canvas.width, x));
  canvas.style.clipPath = `inset(0px 0px 0px ${clampedX}px)`;
  slider.style.left = `${clampedX}px`;
}

// Compare button
function handleRunButtonClick() {
  // Re-initialize DOM references in case they weren't available before
  if (!canvas || !baseImage) {
    initializeDOMReferences();
  }

  // Check if we have the required elements
  if (!canvas || !baseImage) {
    console.error("Canvas elements not found");
    return;
  }

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

  // Add raw pixel comparison for debugging
  //compareRawPixels(offCanvas1, offCanvas2);

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
        return;
      }

      const mismatch = parseFloat(data.misMatchPercentage);
      const similarity = (100 - mismatch).toFixed(2);
      animateSimilarityScore(similarity);

      // Log detailed comparison data for debugging
      // console.log('Comparison Results:', {
      //   misMatchPercentage: data.misMatchPercentage,
      //   analysisTime: data.analysisTime,
      //   diffBounds: data.diffBounds,
      //   dimensionDifference: data.dimensionDifference,
      //   rawMisMatchPercentage: data.rawMisMatchPercentage
      // });

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
            // Find the checkbox container (the div with subheader-pill class)
            const checkboxContainer = checkbox.closest('.subheader-pill');
            if (checkboxContainer) {
              checkboxContainer.style.opacity = '1';
            }
          }

          // Add pixel analysis for debugging
          if (mismatch > 0 && mismatch < 5) { // Only for small differences
            analyzeDifferences(diffCtx);
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

// Function to analyze pixel differences for debugging
function analyzeDifferences(diffCtx) {
  const imageData = diffCtx.getImageData(0, 0, diffCanvas.width, diffCanvas.height);
  const data = imageData.data;
  let diffPixels = 0;
  let sampleDiffs = [];

  // Sample some different pixels to see what the differences look like
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Check if this pixel shows a difference (yellow highlight from resemble.js)
    if (r > 200 && g > 200 && b < 50) { // Yellow-ish pixels indicate differences
      diffPixels++;

      // Collect sample coordinates and pixel info
      if (sampleDiffs.length < 10) {
        const pixelIndex = i / 4;
        const x = pixelIndex % diffCanvas.width;
        const y = Math.floor(pixelIndex / diffCanvas.width);
        sampleDiffs.push({ x, y, r, g, b, a });
      }
    }
  }

  console.log('Pixel Analysis:', {
    totalDiffPixels: diffPixels,
    sampleDifferences: sampleDiffs,
    canvasSize: `${diffCanvas.width}x${diffCanvas.height}`,
    percentageFromPixelCount: ((diffPixels / (diffCanvas.width * diffCanvas.height)) * 100).toFixed(4)
  });
}

// Function to compare raw pixel data between two canvases
function compareRawPixels(canvas1, canvas2) {
  const ctx1 = canvas1.getContext('2d');
  const ctx2 = canvas2.getContext('2d');

  const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
  const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

  const data1 = imageData1.data;
  const data2 = imageData2.data;

  let differences = [];
  let totalDiffs = 0;

  // Sample every 100th pixel to avoid overwhelming output
  for (let i = 0; i < data1.length; i += 400) { // 400 = 4 bytes per pixel * 100 pixels
    const r1 = data1[i], g1 = data1[i + 1], b1 = data1[i + 2], a1 = data1[i + 3];
    const r2 = data2[i], g2 = data2[i + 1], b2 = data2[i + 2], a2 = data2[i + 3];

    if (r1 !== r2 || g1 !== g2 || b1 !== b2 || a1 !== a2) {
      totalDiffs++;
      if (differences.length < 5) { // Only keep first 5 samples
        const pixelIndex = i / 4;
        const x = pixelIndex % canvas1.width;
        const y = Math.floor(pixelIndex / canvas1.width);
        differences.push({
          x, y,
          image1: { r: r1, g: g1, b: b1, a: a1 },
          image2: { r: r2, g: g2, b: b2, a: a2 },
          colorDiff: {
            r: Math.abs(r1 - r2),
            g: Math.abs(g1 - g2),
            b: Math.abs(b1 - b2),
            a: Math.abs(a1 - a2)
          }
        });
      }
    }
  }

  console.log('Raw Pixel Comparison (sampled):', {
    sampledDifferences: totalDiffs,
    sampleSize: Math.floor(data1.length / 400),
    exampleDifferences: differences
  });
}