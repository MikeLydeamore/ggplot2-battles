async function loadFragment(element, path) {
  const response = await fetch(path);
  element.innerHTML = await response.text();
}

class BattleDescription extends HTMLElement {
  async connectedCallback() {
    this.remove();
  }
}

customElements.define('battle-description', BattleDescription);


class EditorViewer extends HTMLElement {
  async connectedCallback() {
    await loadFragment(this, '../../js/editor-viewer.html');

    this.dispatchEvent(new CustomEvent('editor-ready', { bubbles: true }));
  }
}

customElements.define('editor-viewer', EditorViewer);
