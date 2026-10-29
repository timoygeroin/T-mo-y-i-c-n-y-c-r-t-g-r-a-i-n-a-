"""UL004 isolated object-component nonprogress feedback experiment.

H0: the frozen per-coordinate click credit is at least as good.
H1: repeated visible-but-nonprogress effects on the SAME connected component
    should reduce exploration priority for all click points on that object.
H2: repeated visible effects are necessary progress (suppression regresses).

This source-to-source candidate is never imported by the competition agent.
It can only be promoted after matched-budget independent public evidence.
"""
from __future__ import annotations

import argparse
from pathlib import Path

INIT = "        self._click_failures: Counter[tuple[int, int, int]] = Counter()\n"
RECORD = "        # ACTION6 outcomes must be keyed by *coordinate*, not by the\n"
PICK = "        points=self._salient_points(grids)[:self.MAX_CLICKS]\n"
PENALTY = "            penalty -= 3*min(self._click_successes[causal_key], 2)\n"

INIT_EXTRA = """        # UL004 shadow candidate: per-level observed object response, not a
        # claim that visible change means progress.
        self._object_nonprogress = Counter()
        self._object_progress = Counter()
"""

RECORD_EXTRA = """        if self._last_move == 'ACTION6' and self._last_position is not None and self._last_grids:
            # Attribute an observed click only to an unambiguous object
            # in the PRIOR frame. Do not use future pixels to choose an object.
            x, y = self._last_position
            old_grid = self._last_grids[-1]
            if 0 <= y < len(old_grid) and 0 <= x < len(old_grid[y]):
                old_color = int(old_grid[y][x])
                candidates = [obj for obj in self._objects(old_grid)
                              if obj[0] == old_color and
                              obj[2] <= x <= obj[4] and obj[3] <= y <= obj[5]]
                if len(candidates) == 1:
                    component_key = (previous[0], candidates[0])
                    if progressed:
                        self._object_progress[component_key] += 1
                    elif changed or delta >= 8:
                        self._object_nonprogress[component_key] += 1
"""

PICK_EXTRA = """        # Recompute only once per decision; no game-ID-dependent policy.
        current_grid = grids[-1] if grids else []
        current_objects = self._objects(current_grid) if current_grid else ()
"""

PENALTY_EXTRA = """            if current_grid and 0 <= y < len(current_grid) and 0 <= x < len(current_grid[y]):
                pixel_color = int(current_grid[y][x])
                matches = [obj for obj in current_objects
                           if obj[0] == pixel_color and
                           obj[2] <= x <= obj[4] and obj[3] <= y <= obj[5]]
                if len(matches) == 1:
                    object_key = (key[0], matches[0])
                    failures = self._object_nonprogress[object_key]
                    if failures >= 2 and not self._object_progress[object_key]:
                        # At most 18 points penalty, never a hard blacklist.
                        penalty += 6 * min(failures - 1, 3)
"""


def generate(source: str) -> str:
    if "    MAX_ACTIONS = 500" not in source or "    MAX_CLICKS = 80" not in source:
        raise ValueError("frozen agent policy contract mismatch")
    for anchor in (INIT, RECORD, PICK, PENALTY):
        if source.count(anchor) != 1:
            raise ValueError("frozen source anchor missing or duplicated")
    result = source.replace(INIT, INIT + INIT_EXTRA, 1)
    result = result.replace(RECORD, RECORD_EXTRA + RECORD, 1)
    result = result.replace(PICK, PICK + PICK_EXTRA, 1)
    result = result.replace(PENALTY, PENALTY + PENALTY_EXTRA, 1)
    compile(result, "<ul004-object-component-feedback>", "exec")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))


if __name__ == "__main__":
    main()
