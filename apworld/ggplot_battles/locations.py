from BaseClasses import Location

LOCATION_BASE_ID = 4_971_000
SCORE_RANGE = range(80, 101)


def structure_location_name(trial: int) -> str:
    return f"Trial {trial}: Structure"


def score_location_name(trial: int, score: int) -> str:
    return f"Trial {trial}: {score}% Match"


def structure_location_id(trial: int) -> int:
    return LOCATION_BASE_ID + trial * 100 + 1


def score_location_id(trial: int, score: int) -> int:
    return LOCATION_BASE_ID + trial * 100 + score


LOCATION_NAME_TO_ID = {}
for trial in range(1, 9):
    LOCATION_NAME_TO_ID[structure_location_name(trial)] = structure_location_id(trial)
    for score in SCORE_RANGE:
        LOCATION_NAME_TO_ID[score_location_name(trial, score)] = score_location_id(trial, score)


class GGPlotLocation(Location):
    game = "ggplot Battles"
