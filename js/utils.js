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
const DIFFICULTIES = ['easy', 'intermediate', 'hard'];
const DIFFICULTY_LABELS = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  hard: 'Hard'
};
const activeBattleFilters = {
  difficulty: new Set(),
  plotType: new Set()
};

function getManifestValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getManifestValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string' && item.length > 0);
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function normaliseTagValue(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getBattleDifficulty(battle) {
  const difficulty = normaliseTagValue(getManifestValue(battle.difficulty));
  return DIFFICULTIES.includes(difficulty) ? difficulty : 'intermediate';
}

function getBattlePlotTypes(battle) {
  return uniqueValues(
    getManifestValues(battle.plotTypes || battle.plot_types || battle['plot-types'])
      .map(normaliseTagValue)
  );
}

function getDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] || formatTagLabel(difficulty);
}

function formatTagLabel(value) {
  return String(value)
    .split(' ')
    .map(word => word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word)
    .join(' ');
}

function getBattleTags(battle) {
  return [
    {
      kind: 'difficulty',
      value: getBattleDifficulty(battle),
      label: getDifficultyLabel(getBattleDifficulty(battle))
    },
    ...getBattlePlotTypes(battle).map(plotType => ({
      kind: 'plot-type',
      value: plotType,
      label: formatTagLabel(plotType)
    }))
  ];
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

  const tagList = document.createElement('div');
  tagList.className = 'battle-card-tags';
  getBattleTags(battle).forEach(({ kind, label }) => {
    const tag = document.createElement('span');
    tag.className = `battle-tag is-${kind}`;
    tag.textContent = label;
    tagList.appendChild(tag);
  });

  const action = document.createElement('span');
  action.className = 'battle-card-action';
  action.textContent = 'Start battle';

  imageFrame.appendChild(image);
  cardCopy.append(title, tagList, bestScoreLabel);
  cardBody.append(cardCopy, action);
  link.append(imageFrame, cardBody);
  item.appendChild(link);

  return item;
}

function getAvailableDifficulties(battles) {
  return DIFFICULTIES.filter(difficulty => (
    battles.some(battle => getBattleDifficulty(battle) === difficulty)
  ));
}

function getAvailablePlotTypes(battles) {
  const plotTypes = new Set();
  battles.forEach(battle => {
    getBattlePlotTypes(battle).forEach(plotType => plotTypes.add(plotType));
  });

  return Array.from(plotTypes)
    .sort((a, b) => formatTagLabel(a).localeCompare(formatTagLabel(b)));
}

function createFilterButton(group, value, label, onFiltersChanged) {
  const button = document.createElement('button');
  button.className = 'battle-filter-chip';
  button.type = 'button';
  button.dataset.filterGroup = group;
  button.dataset.filterValue = value;
  button.setAttribute('aria-pressed', 'false');
  button.textContent = label;
  button.addEventListener('click', () => {
    toggleBattleFilter(group, value);
    syncFilterControls();
    onFiltersChanged();
  });
  return button;
}

function renderFilterControls(battles, onFiltersChanged) {
  const difficultyContainer = document.getElementById('difficulty-filters');
  const plotTypeContainer = document.getElementById('plot-type-filters');
  if (!difficultyContainer || !plotTypeContainer) return;

  const difficultyButtons = getAvailableDifficulties(battles).map(difficulty => (
    createFilterButton('difficulty', difficulty, getDifficultyLabel(difficulty), onFiltersChanged)
  ));
  const plotTypeButtons = getAvailablePlotTypes(battles).map(plotType => (
    createFilterButton('plotType', plotType, formatTagLabel(plotType), onFiltersChanged)
  ));

  difficultyContainer.replaceChildren(...difficultyButtons);
  plotTypeContainer.replaceChildren(...plotTypeButtons);

  const clearButton = document.querySelector('.battle-filter-clear');
  if (clearButton) {
    clearButton.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      clearBattleFilters();
      syncFilterControls();
      onFiltersChanged();
    };
  }

  syncFilterControls();
}

function toggleBattleFilter(group, value) {
  const filters = activeBattleFilters[group];
  if (!filters) return;

  if (filters.has(value)) {
    filters.delete(value);
  } else {
    filters.add(value);
  }
}

function clearBattleFilters() {
  Object.values(activeBattleFilters).forEach(filters => filters.clear());
}

function hasActiveBattleFilters() {
  return Object.values(activeBattleFilters).some(filters => filters.size > 0);
}

function getActiveBattleFilterCount() {
  return Object.values(activeBattleFilters)
    .reduce((total, filters) => total + filters.size, 0);
}

function syncFilterControls() {
  document.querySelectorAll('.battle-filter-chip').forEach(button => {
    const filters = activeBattleFilters[button.dataset.filterGroup];
    const isActive = Boolean(filters?.has(button.dataset.filterValue));
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  const clearButton = document.querySelector('.battle-filter-clear');
  if (clearButton) {
    clearButton.hidden = !hasActiveBattleFilters();
  }

  const filterPanel = document.querySelector('.battle-filter-panel');
  if (filterPanel) {
    filterPanel.classList.toggle('has-active-filters', hasActiveBattleFilters());
  }

  syncFilterSummary();
}

function syncFilterSummary() {
  const summaryStatus = document.getElementById('filter-summary-count');
  if (!summaryStatus) return;

  const activeFilterCount = getActiveBattleFilterCount();
  summaryStatus.textContent = activeFilterCount
    ? `${activeFilterCount} active`
    : 'All battles';
}

function getFilteredBattles(battles) {
  return battles.filter(battle => {
    const difficultyFilters = activeBattleFilters.difficulty;
    if (difficultyFilters.size && !difficultyFilters.has(getBattleDifficulty(battle))) {
      return false;
    }

    const plotTypeFilters = activeBattleFilters.plotType;
    if (plotTypeFilters.size) {
      const plotTypes = getBattlePlotTypes(battle);
      if (!plotTypes.some(plotType => plotTypeFilters.has(plotType))) {
        return false;
      }
    }

    return true;
  });
}

function renderBattleCards(battles) {
  const filteredBattles = getFilteredBattles(battles);

  if (filteredBattles.length) {
    battleListContainer.replaceChildren(...filteredBattles.map(createBattleCard));
  } else {
    const status = document.createElement('p');
    status.className = 'battle-list-status';
    status.textContent = 'No battles match those filters.';
    battleListContainer.replaceChildren(status);
  }

  updateBattleCount(battles.length, filteredBattles.length);
}

function updateBattleCount(totalBattles, visibleBattles = totalBattles) {
  const battleCount = document.getElementById('battle-count');
  if (!battleCount) return;

  battleCount.textContent = hasActiveBattleFilters()
    ? `${visibleBattles} of ${totalBattles} battles shown`
    : `${totalBattles} battles ready`;
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
      renderFilterControls(battles, () => renderBattleCards(battles));
      renderBattleCards(battles);
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
