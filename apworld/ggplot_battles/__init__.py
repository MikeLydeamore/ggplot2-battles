from __future__ import annotations

from BaseClasses import ItemClassification, LocationProgressType, Region
from worlds.AutoWorld import World
from worlds.generic.Rules import set_rule

from .generator import BASE_TECHNIQUES, MODIFIERS, generate_slot, score_thresholds
from .items import (
    COLOUR_SWATCHES,
    ITEM_NAME_TO_ID,
    GGPlotItem,
    classification_for,
)
from .locations import (
    LOCATION_NAME_TO_ID,
    GGPlotLocation,
    score_location_name,
    structure_location_name,
)
from .options import GGPlotOptions
from .web_world import GGPlotWebWorld


class GGPlotBattlesWorld(World):
    """Recreate procedurally generated ggplot2 targets in a browser-based R workspace."""

    game = "ggplot Battles"
    web = GGPlotWebWorld()
    options_dataclass = GGPlotOptions
    options: GGPlotOptions
    item_name_to_id = ITEM_NAME_TO_ID
    location_name_to_id = LOCATION_NAME_TO_ID
    item_name_groups = {
        "Base Techniques": set(BASE_TECHNIQUES),
        "Modifiers": set(MODIFIERS),
    }

    slot_definition: dict

    def generate_early(self) -> None:
        self.slot_definition = generate_slot(self.random.getrandbits(32) or 1)
        self.score_thresholds = score_thresholds(self.options.score_check_interval.value)

    def create_regions(self) -> None:
        menu = Region("Menu", self.player, self.multiworld)
        self.multiworld.regions.append(menu)

        for trial in self.slot_definition["trials"]:
            trial_number = int(trial["trialId"])
            region = Region(f"Trial {trial_number}", self.player, self.multiworld)
            self.multiworld.regions.append(region)
            menu.connect(region, f"Open Trial {trial_number}")
            structure_name = structure_location_name(trial_number)
            region.locations.append(GGPlotLocation(
                self.player,
                structure_name,
                LOCATION_NAME_TO_ID[structure_name],
                region,
            ))
            for score in self.score_thresholds:
                score_name = score_location_name(trial_number, score)
                location = GGPlotLocation(
                    self.player, score_name, LOCATION_NAME_TO_ID[score_name], region
                )
                if score >= 97 and not self.options.mastery_progression:
                    location.progress_type = LocationProgressType.EXCLUDED
                region.locations.append(location)

        final_region = Region("Final Exhibition", self.player, self.multiworld)
        self.multiworld.regions.append(final_region)
        menu.connect(final_region, "Enter Final Exhibition")
        victory_location = GGPlotLocation(self.player, "Complete Final Exhibition", None, final_region)
        victory_location.place_locked_item(GGPlotItem(
            "Victory", ItemClassification.progression, None, self.player
        ))
        final_region.locations.append(victory_location)

    def create_item(self, name: str) -> GGPlotItem:
        return GGPlotItem(name, classification_for(name), ITEM_NAME_TO_ID[name], self.player)

    def get_filler_item_name(self) -> str:
        return self.random.choice(COLOUR_SWATCHES)

    def create_items(self) -> None:
        opening = self.slot_definition["opening_technique"]
        self.multiworld.push_precollected(self.create_item(opening))
        pool_names = [name for name in BASE_TECHNIQUES if name != opening]
        pool_names.extend(MODIFIERS)
        pool_names.append("Exhibition Invitation")
        pool_names.extend(("Diff Lens", "Data Inspector", "Starter Scaffold", "Hint Book", "Hint Book"))
        active_location_count = 8 * (1 + len(self.score_thresholds))
        filler_count = active_location_count - len(pool_names)
        pool_names.extend(COLOUR_SWATCHES[index % len(COLOUR_SWATCHES)] for index in range(filler_count))
        assert len(pool_names) == active_location_count
        self.multiworld.itempool.extend(self.create_item(name) for name in pool_names)

    def set_rules(self) -> None:
        for trial in self.slot_definition["trials"]:
            requirements = tuple(trial["requiredItems"])
            region = self.multiworld.get_region(f"Trial {trial['trialId']}", self.player)
            entrance = region.entrances[0]
            set_rule(entrance, lambda state, requirements=requirements: all(
                state.has(item, self.player) for item in requirements
            ))

        final_region = self.multiworld.get_region("Final Exhibition", self.player)
        final_entrance = final_region.entrances[0]
        set_rule(final_entrance, lambda state: (
            state.has("Exhibition Invitation", self.player)
            and state.has("Composition", self.player)
            and sum(state.has(item, self.player) for item in BASE_TECHNIQUES) >= 4
            and sum(state.has(item, self.player) for item in MODIFIERS[:-1]) >= 3
        ))
        self.multiworld.completion_condition[self.player] = lambda state: state.has("Victory", self.player)

    def fill_slot_data(self) -> dict:
        return {
            **self.slot_definition,
            "mastery_progression": bool(self.options.mastery_progression),
            "score_check_interval": self.options.score_check_interval.value,
            "score_thresholds": self.score_thresholds,
        }
