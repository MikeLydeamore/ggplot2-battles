var editor = ace.edit("editor");
editor.session.setMode("ace/mode/r");
editor.setOptions({ fontSize: "11pt", maxLines: Infinity, minLines: 20, enableAutoIndent: true });
editor.setTheme("ace/theme/monokai");
editor.session.setUseWrapMode(true);
editor.session.setTabSize(2);

import { WebR } from 'https://webr.r-wasm.org/latest/webr.mjs';
const webR = new WebR();
await webR.init();
await webR.evalRVoid('options(device=function(...){webr::canvas(width=350, height=200)})');
const shelter = await new webR.Shelter();
let canvas = undefined;

await webR.evalRVoid('webr::shim_install()');

function extractLibraries(rCode) {
  return rCode
    .split('\n')
    .filter(line => line.trim().startsWith('library('))
    .map(line => {
      const match = line.match(/library\(([^)]+)\)/);
      return match ? match[1].replace(/['"]/g, '').trim() : null;
    })
    .filter(Boolean);
}

const pagename = getCurrentFolderName()
const response = await fetch(`../challenges/${pagename}.R`);
let code = await response.text();
code = code.replace(/\r\n/g, '\n');

const required_packages = extractLibraries(code);
const packages_div = document.querySelector('.required-packages');
packages_div.innerHTML = '';
packages_div.appendChild(arrayToUnorderedList(required_packages));
await webR.installPackages(required_packages);

const capture = await shelter.captureR(code, {
  captureGraphics: {
    width: 350,
    height: 200
  }
});

// Draw the first (and only) captured image to the page
if (capture.images.length > 0) {
  const img = capture.images[0];
  const canvas = document.getElementById("canvas-base");
  canvas.style.display = 'block';
  canvas.getContext("2d").drawImage(img, 0, 0);

  const canvas_target = document.getElementById("canvas-target");
  canvas_target.style.display = 'block';
  canvas_target.getContext("2d").drawImage(img, 0, 0);
}

shelter.purge();

function drawDefaultImage(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(44,47,51,1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '40px sans-serif';
  ctx.fillText('No plot', 450, 200);
}

let graphicsReceived = false;
// Handle webR output messages in an async loop
(async () => {
  for (; ;) {
    const output = await webR.read();
    switch (output.type) {
      case 'canvas':
        let canvas = document.getElementById('canvas');
        graphicsReceived = true;
        // ctx = canvas.getContext('2d');
        // ctx.fillStyle = 'rgba(44,47,51,1)';
        // ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (output.data.event === 'canvasNewPage') {
          canvas.style.display = 'block';
          //canvas.getContext('2d').clearRect(0, 0, 700, 400);
        }
        if (output.data.event === 'canvasImage') {
          canvas.getContext('2d').drawImage(output.data.image, 0, 0);
        }
        
        break;
      default:
        break;
    }
    
  }
})();

async function runR() {
  graphicsReceived = false;
  let code = editor.getValue();
  const result = await shelter.captureR(code, {
    withAutoprint: true,
    captureStreams: true,
    captureGraphics: false,
    captureConditions: false
  });
  try {
    const out = result.output.filter(
      evt => evt.type == 'stdout' || evt.type == 'stderr'
    ).map((evt) => evt.data);
    document.getElementById('out').innerText = out.join('\n');
  } finally {
    shelter.purge();

    if (!graphicsReceived) {
      drawDefaultImage(document.getElementById('canvas'));
      graphicsReceived = false;
    }
  }
}

async function run_and_compare() {
  await runR();
  handleRunButtonClick();
}

document.getElementById('runButton').addEventListener('click', run_and_compare);
document.getElementById('runButton').innerHTML = `
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style="vertical-align:middle;">
    <polygon points="5,3 17,10 5,17"/>
  </svg> Run & Compare
`;
document.getElementById('runButton').disabled = false;