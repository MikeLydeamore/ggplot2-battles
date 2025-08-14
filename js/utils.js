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

fetch('challenges-images/manifest.json')
  .then(resp => resp.json())
  .then(images => {
    const container = document.querySelector('.list-battles');
    container.innerHTML = images.map(img => {
      const name = img.replace('.png', '');
      return `
        <a href="challenges/${name}/index.html" class="battle-link" title="${name.replace(/_/g, ' ')}">
          <img src="challenges-images/${img}" alt="${name.replace(/_/g, ' ')} Battle" class="battle-thumbnail">
        </a>
      `;
    }).join('');
  });
