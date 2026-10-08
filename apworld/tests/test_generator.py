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
        self.assertEqual(len(first["trials"]), 8)
        self.assertEqual({trial["technique"] for trial in first["trials"]}, set(BASE_TECHNIQUES))
        self.assertTrue(all(a["technique"] != b["technique"] for a, b in zip(first["trials"], first["trials"][1:])))

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


if __name__ == "__main__":
    unittest.main()
