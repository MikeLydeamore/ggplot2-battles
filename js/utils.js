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

function getManifestValue(value) {
  return Array.isArray(value) ? value[0] : value;
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
