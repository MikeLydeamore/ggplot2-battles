function arrayToUnorderedList(items) {
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

const container = document.querySelector('.list-battles');
if (container) {
  fetch('challenges-images/manifest.json')
    .then(resp => resp.json())
    .then(battles => {
      const container = document.querySelector('.list-battles');
      container.innerHTML = battles.map(battle => {
        return `
        <div class="battle-item">
          <h5 class="battle-title">${battle.title}</h5>
          <a href="challenges/${battle.name}/" class="battle-link" title="${battle.title}">
            <img src="challenges-images/${battle.image}" alt="${battle.title}" class="battle-thumbnail">
          </a>
        </div>
      `;
      }).join('');
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const listBattles = document.querySelector('.list-battles');

  if (listBattles) {
    listBattles.addEventListener('wheel', (e) => {
      // Prevent default vertical scroll
      e.preventDefault();

      // Scroll horizontally instead
      listBattles.scrollLeft += e.deltaY;
    });
  }
});