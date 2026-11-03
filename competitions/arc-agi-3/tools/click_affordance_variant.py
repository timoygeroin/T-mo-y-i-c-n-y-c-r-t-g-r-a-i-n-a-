"""Affordance-gated click exploration candidate, isolated from contest agent.

The 25-game exploratory A/B/C showed uniform-first helped one click-only game
but harmed a mixed-action game. This *post-hoc* hypothesis is in-sample and
cannot be promoted without prospective/held-out evidence. No game IDs are used.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from click_coverage_variant import generate as expand_coverage

PICK = "        points=self._salient_points(grids)[:self.MAX_CLICKS]\n"
SCORE = "        scoring=[]\n"

PICK_REPLACEMENT = """        click_only = getattr(self, '_click_only', False)
        points=self._salient_points(grids)[:self.MAX_CLICKS if click_only else 80]
        if click_only and grids and grids[-1]:
            grid = grids[-1]
            height = min(64, len(grid))
            width = min(64, max((len(row) for row in grid[:height]), default=0))
            full = height == 64 and width == 64
            min_x, min_y = (1, 2) if full else (0, 0)
            max_x, max_y = width, (61 if full else height)
            if max_x > min_x and max_y > min_y:
                uniform = []
                for yi in range(8):
                    for xi in range(8):
                        x = min_x + ((2*xi+1) * (max_x-min_x)) // 16
                        y = min_y + ((2*yi+1) * (max_y-min_y)) // 16
                        p = (max(0,min(63,x)), max(0,min(63,y)))
                        if p not in uniform:
                            uniform.append(p)
                points = uniform + [p for p in points if p not in uniform]
"""

SCORE_REPLACEMENT = """        # Generic affordance gate, not a per-game special case.
        self._click_only = len(legal) == 1 and legal[0].name == 'ACTION6'
        scoring=[]
"""


def generate(source: str) -> str:
    """Preserve mixed-action behavior; reorder click targets only for click-only scenes."""
    result = expand_coverage(source, "coverage")
    if result.count(PICK) != 1 or result.count(SCORE) != 1:
        raise ValueError("frozen click policy source guard failed")
    result = result.replace(PICK, PICK_REPLACEMENT, 1)
    result = result.replace(SCORE, SCORE_REPLACEMENT, 1)
    compile(result, "<affordance-gated-candidate>", "exec")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))


if __name__ == "__main__":
    main()
