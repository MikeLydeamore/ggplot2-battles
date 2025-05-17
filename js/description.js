class BattleDescription extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
    <h4 class="text-center">Welcome to GGPlot Battles!</h2>
        <p>Replicate the target plot using R Code. The closer your picture, the higher your score.</p>

        <p>For this challenge, your dataset is <code>palmerpenguins::penguins</code>.</p>
        
        <p>The following packages have been preinstalled:
        <div class="required-packages"></div>
        </p>

        <p>Other packages can be preinstalled using <code>install.packages</code> inside the editor below</p>
    `
  }
}

customElements.define('battle-description', BattleDescription);


class EditorViewer extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
    <div class="two-column-layout">
      <div class="left inner-box">
        <div class="code-window">
          <div class="mx-auto text-center">
            <h2 class="subheader-pill">Editor<h2>
          </div>
          <button class="btn btn-success btn-sm" disabled type="button" id="runButton">Loading webR...</button>
          <div id="editor">ggplot()</div>
          <pre><code id="out"></code></pre>
        </div>
      </div>

      <div class="right mx-auto text-center inner-box">
        <div class="mx-auto text-center">
          <h2 class="subheader-pill">Plot Output</h2>
        </div>
        <div class="compare-container mx-auto text-center" id="sliderContainer">
          <canvas id="canvas-base" width="700" height="400" style="display: none; margin: auto; width: 700px;"></canvas>
          <canvas id="canvas" width="700" height="400" , style="margin: auto; width: 700px;"></canvas>
          <div class="slider" id="slider" style="left: 300px;"></div>
        </div>

        <div class="compare-result">
          <span class="text-muted" style="color: #adb5bd; font-size: 1.75rem;">Similarity:</span>
          <span id="similarity-score" style="color: #0dcaf0; font-weight: 600; font-size: 1.75rem;">N/A</span>
        </div>
      </div>

    </div>
    `
  }
}

customElements.define('editor-viewer', EditorViewer);