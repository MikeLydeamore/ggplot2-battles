# ggplot Battles Setup Guide

## Requirements

- A modern desktop browser with WebAssembly support.
- The `ggplot_battles.apworld` installed in Archipelago.
- The generated room address, slot name, and optional password.

## Playing

Open `https://ap.ggplotbattles.dev`, enter the room details, and connect. Received technique items unlock procedural trials. Each trial runs entirely in the browser through webR; no local R installation is required.

Keep the application tab open while playing. The dashboard owns one persistent Archipelago connection and retains it while you move into and out of trial workspaces.

Every trial has a Structure check plus configurable score checks from 80% through 100%. The default 5% interval creates checks at 80%, 85%, 90%, 95%, and 100%, for 48 trial checks overall. Scores of 97% and above cannot contain required progression unless `mastery_progression` is enabled. Target generation and score reporting use an honour system: browser source and generated target programs are intentionally inspectable.

Use the **Checks** button inside a trial to inspect the pixel and code accuracy required by each milestone, checks awaiting the server, confirmed checks, and the current session's check log. The flyout reports code accuracy without revealing the required construction. Required colours are shown as an R vector that can be pasted directly into a manual ggplot scale.
