ace.require("ace/ext/language_tools");
var editor = ace.edit("editor");
editor.session.setMode("ace/mode/r");
editor.setOptions({
  fontSize: "11pt", maxLines: Infinity, minLines: 20, enableAutoIndent: true, enableBasicAutocompletion: true,
  enableLiveAutocompletion: true,
  enableSnippets: true });
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

function extractHashpipe(rCode) {
  const arr = {};

  // Split input into lines and process each one
  const lines = rCode.split(/\r?\n/);

  lines.forEach(line => {
    const match = line.match(/^#\|\s*([\w-]+)\s*:\s*["'](.+?)["']\s*$/);
    if (match) {
      const key = match[1];
      const value = match[2];
      arr[key] = value;
    }
  });

  return arr;
}


const pagename = getCurrentFolderName()
const response = await fetch(`../../challenges-code/${pagename}.R`);
let code = await response.text();
code = code.replace(/\r\n/g, '\n');


async function init() {
  try {
    const required_packages = extractLibraries(code);
    const packages_div = document.querySelector('.required-packages');
    packages_div.innerHTML = '';
    packages_div.appendChild(arrayToUnorderedList(required_packages));

    await webR.installPackages(required_packages);

    const options = extractHashpipe(code);
    console.log(options);

    document.querySelector('#dataset-name').innerHTML = options["dataset-name"];
    document.querySelector('#target-title').innerHTML = options["title"];
    document.querySelector('#target-description').innerHTML = marked.parse(options["description"]);

    if ("colours" in options) {
      document.querySelector('#target-colours').innerHTML = "Colours: " + marked.parseInline(options["colours"]);
      document.querySelector('#target-colours').style.visibility = 'visible';
    }

    console.log("Finished init.");
  } catch (err) {
    console.error("Error in init:", err);
  } finally {
    // Unhide the page after everything is done
    document.querySelector('#spinner').style.visibility = 'hidden';
    document.documentElement.style.visibility = 'visible';
  }
}

init();




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
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(44,47,51,1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvas.getContext("2d").drawImage(img, 0, 0);


  const canvas_target = document.getElementById("canvas-target");
  const ctx_target = canvas_target.getContext('2d');
  ctx_target.fillStyle = 'rgba(44,47,51,1)';
  ctx_target.fillRect(0, 0, canvas.width, canvas.height);
  canvas_target.style.display = 'block';
  canvas_target.getContext("2d").drawImage(img, 0, 0);
}

shelter.purge();

function drawDefaultImage(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(44,47,51,1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  //ctx.fillStyle = 'white';
  ctx.font = '40px sans-serif';
  ctx.fillText('No plot', 450, 200);
}

let graphicsReceived = false;
let plotSequenceStarted = false;

// Handle webR output messages in an async loop
(async () => {
  for (; ;) {
    const output = await webR.read();
    switch (output.type) {
      case 'canvas':
        let canvas = document.getElementById('canvas');
        graphicsReceived = true;

        if (output.data.event === 'canvasNewPage') {
          canvas.style.display = 'block';
          // Clear canvas only at the start of a new plot sequence
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'rgba(44,47,51,1)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          plotSequenceStarted = true;
        }
        if (output.data.event === 'canvasImage') {
          // Only clear if this is the first image in a new sequence
          if (!plotSequenceStarted) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(44,47,51,1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            plotSequenceStarted = true;
          }
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
  plotSequenceStarted = false; // Reset plot sequence tracking
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