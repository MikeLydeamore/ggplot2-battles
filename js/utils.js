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

function createBattleCard(battle) {
  const item = document.createElement('div');
  item.className = 'battle-item';

  const title = document.createElement('h5');
  title.className = 'battle-title';
  title.textContent = battle.title;

  const link = document.createElement('a');
  link.className = 'battle-link';
  link.href = `challenges/${encodeURIComponent(battle.name)}/`;
  link.title = battle.title;

  const image = document.createElement('img');
  image.className = 'battle-thumbnail';
  image.src = `challenges-images/${encodeURIComponent(battle.image)}`;
  image.alt = battle.title;

  link.appendChild(image);
  item.append(title, link);

  return item;
}

const battleListContainer = document.querySelector('.list-battles');
if (battleListContainer) {
  fetch('challenges-images/manifest.json')
    .then(resp => resp.json())
    .then(battles => {
      const battleCards = battles.map(createBattleCard);
      battleListContainer.replaceChildren(...battleCards);
    })
    .catch(err => {
      console.error('Unable to load challenge manifest:', err);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const listBattles = document.querySelector('.list-battles');

  if (listBattles) {
    listBattles.addEventListener('wheel', (e) => {
      e.preventDefault();
      listBattles.scrollLeft += e.deltaY;
    }, { passive: false });
  }
});
