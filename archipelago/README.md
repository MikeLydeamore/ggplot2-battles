# ggplot Battles Archipelago Client

This is the separately deployed browser client for the `ggplot Battles` APWorld. It shares the battle engine and versioned procedural challenge specification with the main site while producing an independent static output.

## Development

```bash
npm test
npm run build
python -m http.server 8000 --directory dist
```

The client needs a generated Archipelago room containing a `ggplot Battles` slot. Connection details are saved locally, while the room password is retained only for the browser session. Received items and checked locations are synchronized from the Archipelago server.

The dashboard is a persistent application shell and owns the room's WebSocket connection. Trial links update browser history and open the isolated webR workspace inside that shell; the workspace reports checks through a same-origin bridge instead of opening another Archipelago connection. Moving between the dashboard and trials therefore does not produce server disconnect/reconnect events. Reloading or closing the top-level tab still reconnects normally.

During a trial, the **Checks** button opens a flyout showing the current code-accuracy result, explicit pixel/code requirements for every check, pending and server-confirmed checks, and a session activity log. It intentionally does not reveal the required layers or modifiers. Required colours are displayed as a copy-ready R vector.

## Checks and unlocks

Each trial awards one Structure check and score checks from 80% through 100%. The `score_check_interval` YAML option accepts `every_1_percent`, `every_2_percent`, `every_5_percent`, or `every_10_percent`; the default 5% interval produces 48 checks across eight trials.

Checks contain shuffled Archipelago items, so a particular check does not always unlock the same thing. The ggplot Battles item pool contains:

- Five base techniques (`Points`, `Distributions`, `Categorical`, `Lines`, and `Intervals`) and five modifiers (`Faceting`, `Scale Transformations`, `Coordinate Systems`, `Annotations`, and `Composition`). These open trials whose generated specification requires them. One opening technique is granted at the start.
- `Exhibition Invitation`, which helps unlock the final exhibition. The final also requires Composition, four base techniques, and three other modifiers.
- `Diff Lens`, `Data Inspector`, and `Starter Scaffold`, which expose their corresponding editor aids.
- Two progressive `Hint Book` items. The first reveals the plot technique; the second also reveals its principal layers and modifiers.
- `Colour Swatch` filler items, which change the editor accent colour and provide receipt messages.

In a multiworld, a check may of course contain an item for another player's game instead. Score checks at 97% and above are excluded from required progression by default.

## Vercel project

Create a second Vercel project connected to this repository with:

- Root Directory: `archipelago`
- Build Command: `npm run build`
- Output Directory: `dist`
- Domain: `ap.ggplotbattles.dev`
- Include source files outside the Root Directory: enabled

The final setting is required because the build imports the shared packages and existing editor assets from the repository root. The main `ggplotbattles.dev` Vercel project remains unchanged.
