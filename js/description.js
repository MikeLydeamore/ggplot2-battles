class BattleDescription extends HTMLElement {
  async connectedCallback() {
    const resp = await fetch('../js/battle-description.html');
    this.innerHTML = await resp.text();
  }
}

customElements.define('battle-description', BattleDescription);


class EditorViewer extends HTMLElement {
  async connectedCallback() {
    const resp = await fetch('../js/editor-viewer.html');
    this.innerHTML = await resp.text();
  }
}

customElements.define('editor-viewer', EditorViewer);