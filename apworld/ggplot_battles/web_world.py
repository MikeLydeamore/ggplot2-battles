from BaseClasses import Tutorial
from worlds.AutoWorld import WebWorld


class GGPlotWebWorld(WebWorld):
    game = "ggplot Battles"
    theme = "ocean"
    rich_text_options_doc = True
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "A guide to setting up ggplot Battles for MultiWorld.",
        "English",
        "setup_en.md",
        "setup/en",
        ["Michael Lydeamore"],
    )]
