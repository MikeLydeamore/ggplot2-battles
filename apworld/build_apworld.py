"""Build the ggplot Battles custom Archipelago world."""

from __future__ import annotations

import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
WORLD = ROOT / "ggplot_battles"
OUTPUT = ROOT / "dist" / "ggplot_battles.apworld"


def build() -> Path:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".apworld.tmp")
    temporary.unlink(missing_ok=True)

    with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for source in sorted(WORLD.rglob("*")):
            if not source.is_file() or "__pycache__" in source.parts or source.suffix == ".pyc":
                continue
            archive.write(source, source.relative_to(ROOT).as_posix())

    shutil.move(temporary, OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    print(build())
