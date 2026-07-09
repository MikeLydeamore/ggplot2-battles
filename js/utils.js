(function () {
function createCodeList(items) {
  const ul = document.createElement('ul');
  items.forEach(item => {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = item;
    li.appendChild(code);
    ul.appendChild(li);
  });
  return ul;
}

window.createCodeList = createCodeList;

const BEST_SCORE_STORAGE_KEY = 'ggplot-battles-best-scores-v1';
const PACKAGE_WARMER_SESSION_KEY = 'ggplot-battles-package-warmer-v1';
const WEBR_MODULE_URL = 'https://webr.r-wasm.org/latest/webr.mjs';

function getManifestValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getManifestValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string' && item.length > 0);
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function getLocalBestScores() {
  try {
    const storedScores = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    return storedScores ? JSON.parse(storedScores) : {};
  } catch (err) {
    console.warn('Unable to read local best scores:', err);
    return {};
  }
}

function getLocalBestScore(challengeName) {
  const score = Number(getLocalBestScores()[challengeName]);
  return Number.isFinite(score) ? score : null;
}

function createBattleCard(battle) {
  const name = getManifestValue(battle.name);
  const titleText = getManifestValue(battle.title);
  const imageName = getManifestValue(battle.image);
  const bestScore = getLocalBestScore(name);

  const item = document.createElement('article');
  item.className = 'battle-item';

  const link = document.createElement('a');
  link.className = 'battle-card-link';
  link.href = `challenges/${encodeURIComponent(name)}/`;
  link.title = `Start ${titleText}`;

  const imageFrame = document.createElement('div');
  imageFrame.className = 'battle-thumbnail-frame';

  const image = document.createElement('img');
  image.className = 'battle-thumbnail';
  image.src = `challenges-images/${encodeURIComponent(imageName)}`;
  image.alt = `${titleText} target plot`;
  image.loading = 'eager';
  image.decoding = 'async';

  const cardBody = document.createElement('div');
  cardBody.className = 'battle-card-body';

  const cardCopy = document.createElement('div');
  cardCopy.className = 'battle-card-copy';

  const title = document.createElement('h3');
  title.className = 'battle-title';
  title.textContent = titleText;

  const bestScoreLabel = document.createElement('span');
  bestScoreLabel.className = bestScore === null
    ? 'battle-best-score is-empty'
    : 'battle-best-score';
  bestScoreLabel.textContent = bestScore === null
    ? 'No best yet'
    : `Best ${bestScore.toFixed(2)}%`;

  const action = document.createElement('span');
  action.className = 'battle-card-action';
  action.textContent = 'Start battle';

  imageFrame.appendChild(image);
  cardCopy.append(title, bestScoreLabel);
  cardBody.append(cardCopy, action);
  link.append(imageFrame, cardBody);
  item.appendChild(link);

  return item;
}

const battleListContainer = document.querySelector('.list-battles');
if (battleListContainer) {
  fetch('challenges-images/manifest.json')
    .then(resp => {
      if (!resp.ok) {
        throw new Error(`Manifest request failed with ${resp.status}`);
      }

      return resp.json();
    })
    .then(battles => {
      const battleCards = battles.map(createBattleCard);
      battleListContainer.replaceChildren(...battleCards);

      const battleCount = document.getElementById('battle-count');
      if (battleCount) {
        battleCount.textContent = `${battles.length} battles ready`;
      }

      schedulePackageWarmup(battles);
    })
    .catch(err => {
      console.error('Unable to load challenge manifest:', err);

      const status = document.createElement('p');
      status.className = 'battle-list-status';
      status.textContent = 'Unable to load battles right now.';
      battleListContainer.replaceChildren(status);

      const battleCount = document.getElementById('battle-count');
      if (battleCount) {
        battleCount.textContent = 'Battles unavailable';
      }
    });
}

function schedulePackageWarmup(battles) {
  const packages = getWarmablePackages(battles);
  if (!packages.length || !shouldWarmPackages(packages)) return;

  const warm = () => {
    warmWebRPackageCache(packages);
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 5000 });
  } else {
    window.setTimeout(warm, 3000);
  }
}

function getWarmablePackages(battles) {
  const counts = new Map();

  battles.forEach(battle => {
    getManifestValues(battle.packages).forEach(packageName => {
      counts.set(packageName, (counts.get(packageName) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([packageName]) => packageName);
}

function shouldWarmPackages(packages) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && ['slow-2g', '2g'].includes(connection.effectiveType)) return false;

  const signature = packages.join('|');
  try {
    return sessionStorage.getItem(PACKAGE_WARMER_SESSION_KEY) !== signature;
  } catch (err) {
    console.info('Unable to remember package warmup state:', err);
  }

  return true;
}

async function warmWebRPackageCache(packages) {
  let warmWebR;
  try {
    console.info('Warming webR package cache:', packages.join(', '));
    const { WebR } = await import(WEBR_MODULE_URL);
    warmWebR = new WebR();
    await warmWebR.init();
    await warmWebR.installPackages(packages);
    rememberWarmedPackages(packages);
    console.info('webR package cache warmed.');
  } catch (err) {
    console.warn('Unable to warm webR package cache:', err);
  } finally {
    if (warmWebR && typeof warmWebR.close === 'function') {
      warmWebR.close();
    }
  }
}

function rememberWarmedPackages(packages) {
  try {
    sessionStorage.setItem(PACKAGE_WARMER_SESSION_KEY, packages.join('|'));
  } catch (err) {
    console.info('Unable to remember package warmup state:', err);
  }
}
})();
