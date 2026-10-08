from BaseClasses import Item, ItemClassification

ITEM_BASE_ID = 4_970_000
BASE_TECHNIQUES = ("Points", "Distributions", "Categorical", "Lines", "Intervals")
MODIFIERS = ("Faceting", "Scale Transformations", "Coordinate Systems", "Annotations", "Composition")
UTILITY_ITEMS = ("Diff Lens", "Data Inspector", "Starter Scaffold", "Hint Book")
COLOUR_SWATCHES = tuple(f"Colour Swatch {index}" for index in range(1, 10))
ITEM_NAMES = (*BASE_TECHNIQUES, *MODIFIERS, "Exhibition Invitation", *UTILITY_ITEMS, *COLOUR_SWATCHES)
ITEM_NAME_TO_ID = {name: ITEM_BASE_ID + index for index, name in enumerate(ITEM_NAMES)}


class GGPlotItem(Item):
    game = "ggplot Battles"


def classification_for(name: str) -> ItemClassification:
    if name in BASE_TECHNIQUES or name in MODIFIERS or name == "Exhibition Invitation":
        return ItemClassification.progression
    if name in UTILITY_ITEMS:
        return ItemClassification.useful
    return ItemClassification.filler
