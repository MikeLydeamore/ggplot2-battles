from dataclasses import dataclass

from Options import Choice, PerGameCommonOptions, Toggle


class MasteryProgression(Toggle):
    """Allow progression items to be placed behind visual-score checks at 97% and above."""

    display_name = "97-100% Checks May Hold Progression"
    default = 0


class ScoreCheckInterval(Choice):
    """Create score checks from 80% through 100% at this percentage interval."""

    display_name = "Score Check Interval"
    option_every_1_percent = 1
    option_every_2_percent = 2
    option_every_5_percent = 5
    option_every_10_percent = 10
    default = 5


@dataclass
class GGPlotOptions(PerGameCommonOptions):
    mastery_progression: MasteryProgression
    score_check_interval: ScoreCheckInterval
