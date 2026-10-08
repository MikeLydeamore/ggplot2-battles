import importlib.util
import pathlib
import sys
import unittest

GENERATOR_PATH = pathlib.Path(__file__).resolve().parents[1] / "ggplot_battles" / "generator.py"
SPEC = importlib.util.spec_from_file_location("ggplot_generator", GENERATOR_PATH)
generator = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = generator
SPEC.loader.exec_module(generator)
BASE_TECHNIQUES = generator.BASE_TECHNIQUES
FACET_PARAMETER_DOMAINS = generator.FACET_PARAMETER_DOMAINS
LAYER_PARAMETER_DOMAINS = generator.LAYER_PARAMETER_DOMAINS
THEME_PARAMETER_DOMAINS = generator.THEME_PARAMETER_DOMAINS
generate_slot = generator.generate_slot
score_thresholds = generator.score_thresholds


class GeneratorTests(unittest.TestCase):
    def test_score_check_intervals(self):
        self.assertEqual(score_thresholds(10), [80, 90, 100])
        self.assertEqual(score_thresholds(5), [80, 85, 90, 95, 100])
        self.assertEqual(len(score_thresholds(2)), 11)
        self.assertEqual(len(score_thresholds(1)), 21)
        self.assertEqual(8 * (1 + len(score_thresholds(10))), 32)
        self.assertEqual(8 * (1 + len(score_thresholds(5))), 48)
        self.assertEqual(8 * (1 + len(score_thresholds(2))), 96)
        self.assertEqual(8 * (1 + len(score_thresholds(1))), 176)

    def test_slot_shape_and_determinism(self):
        first = generate_slot(123456)
        second = generate_slot(123456)
        self.assertEqual(first, second)
        self.assertEqual(first["slot_data_version"], 2)
        self.assertEqual(first["generator_version"], 2)
        self.assertEqual(first["world_version"], "0.4.0")
        self.assertEqual(first["web_app_min_version"], "0.4.0")
        self.assertEqual(len(first["trials"]), 8)
        self.assertEqual({trial["technique"] for trial in first["trials"]}, set(BASE_TECHNIQUES))
        self.assertTrue(all(a["technique"] != b["technique"] for a, b in zip(first["trials"], first["trials"][1:])))
        for panel in first["final"]["panels"]:
            self.assertRegex(panel["dataset"]["name"], r"^[A-Za-z][A-Za-z0-9._]*$")
            self.assertNotIn("-", panel["dataset"]["name"])

    def test_many_slots_are_well_formed(self):
        for seed in range(1, 1001):
            slot = generate_slot(seed)
            self.assertEqual(len(slot["trials"]), 8)
            self.assertEqual(len({trial["trialId"] for trial in slot["trials"]}), 8)
            for trial in slot["trials"]:
                self.assertGreater(trial["seed"], 0)
                self.assertLess(trial["thresholds"]["match"], trial["thresholds"]["mastery"])
                self.assertGreater(len(trial["predicates"]), 0)
                if "Faceting" in trial["requiredItems"]:
                    self.assertIsNotNone(trial["plot"]["facet"])
                if "Scale Transformations" in trial["requiredItems"]:
                    self.assertIsNotNone(trial["plot"]["scale"])
                if "Coordinate Systems" in trial["requiredItems"]:
                    self.assertIsNotNone(trial["plot"]["coordinate"])
                if "Annotations" in trial["requiredItems"]:
                    self.assertIsNotNone(trial["plot"]["annotation"])

                for layer in trial["plot"]["layers"]:
                    domains = LAYER_PARAMETER_DOMAINS[layer["geom"]]
                    self.assertEqual(set(layer["params"]), set(domains))
                    for name, value in layer["params"].items():
                        self.assertIn(value, domains[name])

                for name, value in trial["plot"]["themeParams"].items():
                    self.assertIn(value, THEME_PARAMETER_DOMAINS[name])
                if trial["plot"]["facet"]:
                    for name, value in trial["plot"]["facetParams"].items():
                        self.assertIn(value, FACET_PARAMETER_DOMAINS[name])

    def test_parameter_domains_produce_variety(self):
        seen = {}
        interval_geoms = set()
        line_layer_counts = set()
        for seed in range(1, 301):
            for trial in generate_slot(seed)["trials"]:
                for layer in trial["plot"]["layers"]:
                    interval_geoms.add(layer["geom"]) if trial["technique"] == "Intervals" else None
                    for name, value in layer["params"].items():
                        seen.setdefault((layer["geom"], name), set()).add(value)
                if trial["technique"] == "Lines":
                    line_layer_counts.add(len(trial["plot"]["layers"]))

        for geom, domains in LAYER_PARAMETER_DOMAINS.items():
            for name, values in domains.items():
                self.assertEqual(seen[(geom, name)], set(values))
        self.assertTrue({"errorbar", "linerange"}.issubset(interval_geoms))
        self.assertGreater(len(line_layer_counts), 1)


if __name__ == "__main__":
    unittest.main()
