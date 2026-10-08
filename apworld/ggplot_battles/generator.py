"""Deterministic procedural challenge generation without Python's random module."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

SCHEMA_VERSION = 1
GENERATOR_VERSION = 2
BASE_TECHNIQUES = ("Points", "Distributions", "Categorical", "Lines", "Intervals")
MODIFIERS = ("Faceting", "Scale Transformations", "Coordinate Systems", "Annotations", "Composition")
PALETTES = (
    ("#0dcaf0", "#ff6b6b", "#ffd166"),
    ("#20c997", "#845ef7", "#ff922b"),
    ("#3a86ff", "#ff006e", "#ffbe0b"),
    ("#2a9d8f", "#e76f51", "#e9c46a"),
)
THEMES = ("theme_minimal", "theme_bw", "theme_classic")
LAYER_PARAMETER_DOMAINS: dict[str, dict[str, tuple[Any, ...]]] = {
    "point": {
        "size": (1.6, 2.1, 2.7, 3.2),
        "alpha": (0.65, 0.8, 1.0),
        "shape": (16, 17, 19),
    },
    "smooth": {
        "method": ("lm", "loess"),
        "se": (False, True),
        "linewidth": (0.6, 0.8, 1.0),
    },
    "histogram": {
        "bins": (12, 18, 24, 30),
        "alpha": (0.58, 0.74, 0.9),
        "boundary": (0.0, 0.25, 0.5),
    },
    "density": {
        "adjust": (0.7, 1.0, 1.3),
        "alpha": (0.25, 0.4, 0.55),
        "linewidth": (0.6, 0.8, 1.0),
    },
    "col": {
        "width": (0.58, 0.72, 0.86),
        "alpha": (0.7, 0.85, 1.0),
    },
    "line": {
        "linewidth": (0.6, 0.85, 1.1),
        "linetype": ("solid", "dashed", "dotdash"),
    },
    "ribbon": {"alpha": (0.12, 0.2, 0.3)},
    "errorbar": {
        "width": (0.1, 0.18, 0.28),
        "linewidth": (0.5, 0.7, 0.9),
    },
    "linerange": {"linewidth": (0.6, 0.85, 1.1)},
}
FACET_PARAMETER_DOMAINS = {
    "ncol": (1, 2, 3),
    "scales": ("fixed", "free_y"),
}
THEME_PARAMETER_DOMAINS = {"baseSize": (10, 11, 12, 13)}


class StableRandom:
    def __init__(self, seed: int):
        self.state = seed & 0xFFFFFFFF or 0x9E3779B9

    def next_u32(self) -> int:
        value = self.state
        value ^= (value << 13) & 0xFFFFFFFF
        value ^= value >> 17
        value ^= (value << 5) & 0xFFFFFFFF
        self.state = value & 0xFFFFFFFF
        return self.state

    def integer(self, minimum: int, maximum: int) -> int:
        return minimum + int((self.next_u32() / 0x100000000) * (maximum - minimum + 1))

    def pick(self, values):
        return values[self.integer(0, len(values) - 1)]

    def shuffle(self, values):
        result = list(values)
        for index in range(len(result) - 1, 0, -1):
            swap = self.integer(0, index)
            result[index], result[swap] = result[swap], result[index]
        return result


@dataclass(frozen=True)
class TechniqueTemplate:
    dataset_kind: str
    mapping: dict[str, str]
    geoms: tuple[str, ...]
    schema: str
    x_label: str
    y_label: str


TEMPLATES = {
    "Points": TechniqueTemplate(
        "correlated", {"x": "x", "y": "y", "colour": "group"},
        ("point",), "x: numeric, y: numeric, group: category", "Predictor", "Response"
    ),
    "Distributions": TechniqueTemplate(
        "distributions", {"x": "value", "fill": "group"},
        ("histogram",), "value: numeric, group: category", "Observed value", "Count"
    ),
    "Categorical": TechniqueTemplate(
        "categorical", {"x": "category", "y": "value", "fill": "group"},
        ("col",), "category: category, value: numeric, group: category", "Category", "Value"
    ),
    "Lines": TechniqueTemplate(
        "timeseries", {"x": "time", "y": "value", "colour": "group", "group": "group"},
        ("line",), "time: integer, value/lower/upper: numeric, group: category", "Time", "Measurement"
    ),
    "Intervals": TechniqueTemplate(
        "intervals", {"x": "label", "y": "estimate", "colour": "group"},
        ("point", "errorbar"),
        "label: category, estimate/lower/upper: numeric, group: category", "Estimate", "Effect"
    ),
}


def _sample_params(random: StableRandom, geom: str) -> dict[str, Any]:
    """Choose one curated value for every supported parameter of a geom."""
    return {
        name: random.pick(values)
        for name, values in LAYER_PARAMETER_DOMAINS.get(geom, {}).items()
    }


def score_thresholds(interval: int) -> list[int]:
    if interval not in (1, 2, 5, 10):
        raise ValueError(f"Unsupported score check interval: {interval}")
    thresholds = list(range(80, 101, interval))
    if thresholds[-1] != 100:
        thresholds.append(100)
    return thresholds


def _predicates(technique: str, modifiers: list[str], layers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    values = [
        {"match": "contains", "value": f":geom:Geom{layer['geom'].capitalize()}", "minimum": 1}
        for layer in layers
    ]
    if "Faceting" in modifiers:
        values.append({"match": "contains", "value": "facet:FacetWrap", "minimum": 1})
    if "Coordinate Systems" in modifiers:
        values.append({"match": "regex", "value": "coordinates:Coord(Flip|Polar)", "minimum": 1})
    if "Scale Transformations" in modifiers:
        values.append({"match": "regex", "value": ":transform:(reverse|log-10)", "minimum": 1})
    if "Annotations" in modifiers:
        values.append({"match": "contains", "value": ":geom:GeomText", "minimum": 1})
    return values


def build_trial(trial_id: int, technique: str, seed: int, modifiers: list[str]) -> dict[str, Any]:
    random = StableRandom(seed)
    template = TEMPLATES[technique]
    identifier = re.sub(r"[^A-Za-z0-9_]", "_", str(trial_id))
    geoms = list(template.geoms)
    if technique == "Points" and modifiers and random.integer(0, 1):
        geoms.append("smooth")
    if technique == "Distributions" and modifiers and random.integer(0, 1):
        geoms = ["density"]
    if technique == "Lines" and modifiers:
        geoms.insert(0, "ribbon")
        if random.integer(0, 1):
            geoms.append("point")
    if technique == "Intervals" and random.integer(0, 1):
        geoms[1] = "linerange"

    layers = [
        {"geom": geom, "params": _sample_params(random, geom)}
        for geom in geoms
    ]

    dataset: dict[str, Any] = {
        "kind": template.dataset_kind,
        "name": f"trial_{identifier}_data",
        "rows": random.integer(48, 84) if template.dataset_kind not in ("categorical", "intervals") else random.integer(8, 12),
        "groups": ["Cyan", "Coral", "Gold"],
        "slope": round(0.5 + random.integer(2, 12) / 10, 2),
        "trend": round(0.08 + random.integer(1, 8) / 100, 2),
        "seasonality": random.integer(1, 4),
        "grouped": True,
    }
    mapping = dict(template.mapping)
    facet = "group" if "Faceting" in modifiers else None
    facet_params = ({
        name: random.pick(values)
        for name, values in FACET_PARAMETER_DOMAINS.items()
    } if facet else {})
    scale = (random.pick(("log10", "reverse")) if technique == "Categorical" else "reverse") \
        if "Scale Transformations" in modifiers else None
    coordinate = random.pick(("flip", "polar")) if "Coordinate Systems" in modifiers and technique == "Categorical" else (
        "flip" if "Coordinate Systems" in modifiers else None
    )
    annotation = f"Seed {seed & 0xFFFF:04X}" if "Annotations" in modifiers else None
    palette = list(random.pick(PALETTES))
    title = f"Level {trial_id}: {technique} study"
    description = "Recreate this procedurally generated target. Exact labels and colours are listed; the construction is yours to infer."
    plot = {
        "mapping": mapping,
        "layers": layers,
        "facet": facet,
        "facetParams": facet_params,
        "scale": scale,
        "coordinate": coordinate,
        "annotation": annotation,
        "theme": random.pick(THEMES),
        "themeParams": {
            name: random.pick(values)
            for name, values in THEME_PARAMETER_DOMAINS.items()
        },
        "palette": palette,
        "title": title,
        "xLabel": template.x_label,
        "yLabel": template.y_label,
    }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatorVersion": GENERATOR_VERSION,
        "trialId": trial_id,
        "seed": seed or 1,
        "technique": technique,
        "dataset": dataset,
        "plot": plot,
        "requiredItems": [technique, *modifiers],
        "predicates": _predicates(technique, modifiers, layers),
        "thresholds": {"match": 90, "mastery": 97},
        "brief": {"title": title, "description": description, "schema": template.schema, "colours": palette},
    }


def generate_slot(seed: int) -> dict[str, Any]:
    random = StableRandom(seed)
    base_order = random.shuffle(BASE_TECHNIQUES)
    repeated = random.shuffle(BASE_TECHNIQUES)[:3]
    techniques = base_order + repeated
    # Keep repeats away from their original where possible.
    for index in range(1, len(techniques)):
        if techniques[index] == techniques[index - 1]:
            techniques[index], techniques[-1] = techniques[-1], techniques[index]

    opening = techniques[0]
    modifier_cycle = random.shuffle(MODIFIERS[:-1])
    trials = []
    for index, technique in enumerate(techniques):
        if index == 0:
            modifiers = []
        elif index < 5:
            modifiers = [modifier_cycle[(index - 1) % len(modifier_cycle)]] if index >= 3 else []
        else:
            modifiers = random.shuffle(MODIFIERS[:-1])[:2]
        trials.append(build_trial(index + 1, technique, random.next_u32(), modifiers))

    final_left = build_trial("final-a", opening, random.next_u32(), ["Faceting", "Annotations"])
    final_right = build_trial("final-b", base_order[1], random.next_u32(), ["Coordinate Systems"])
    return {
        "slot_data_version": 2,
        "schema_version": SCHEMA_VERSION,
        "generator_version": GENERATOR_VERSION,
        "web_app_min_version": "0.4.0",
        "world_version": "0.4.0",
        "opening_technique": opening,
        "trials": trials,
        "final": {
            "schemaVersion": SCHEMA_VERSION,
            "generatorVersion": GENERATOR_VERSION,
            "trialId": "final",
            "technique": "Composition",
            "requiredItems": ["Exhibition Invitation", "Composition"],
            "panels": [final_left, final_right],
            "thresholds": {"match": 90, "mastery": 97},
            "brief": {
                "title": "Final Exhibition",
                "description": "Recreate both generated panels and combine them into one exhibition piece.",
                "schema": f"{final_left['brief']['schema']}; {final_right['brief']['schema']}",
                "colours": final_left["brief"]["colours"] + final_right["brief"]["colours"],
            },
        },
    }
