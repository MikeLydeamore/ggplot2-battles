# ggplot Battles APWorld

The `ggplot_battles` directory is an Archipelago world package. During development, place it in an Archipelago source checkout's `worlds/` directory. For distribution, use the official Archipelago launcher component **Build APWorlds**, which adds the required APContainer metadata to `archipelago.json`.

The browser client and world currently share schema version 1 and generator version 2. Release them together whenever either version changes.

## Build and test locally

From the repository root, build the custom world with:

```bash
python apworld/build_apworld.py
```

This creates `apworld/dist/ggplot_battles.apworld`. Install it through the Archipelago launcher or copy it to the installation's `custom_worlds` directory, then restart Archipelago. Copy `apworld/examples/ggplot_battles.yaml` into the Archipelago `Players` directory and run **Generate**. The generated `.archipelago` file can be opened with **Host**; connect the browser client using the server address and the slot name `Plotter`.
