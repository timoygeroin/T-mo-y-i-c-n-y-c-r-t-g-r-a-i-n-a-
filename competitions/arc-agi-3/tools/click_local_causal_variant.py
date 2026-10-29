"""UL-001 shadow candidate: local causal click-neighborhood probing.

Hypothesis: once a click-only world has produced a visibly responsive point,
sample untried nearby candidates rather than repeatedly pressing the exact
same point. Not an official agent; prospective public A/B required.
"""
from __future__ import annotations
import argparse
from pathlib import Path

GUARD = "    MAX_CLICKS = 80\n"
GATE = "        scoring=[]\n"
RANK = "            predicted = self._transitions.get(\n"

GATE_NEW = """        # UL-001: only after at least eight actions in a first-level
        # click-only environment; no game IDs or externally known answers.
        self._causal_local_probe = (
            level == 0 and self._steps >= 8 and len(legal) == 1
            and legal[0].name == 'ACTION6'
        )
        scoring=[]
"""

RANK_NEW = """            if getattr(self, '_causal_local_probe', False):
                # Previous visible response is evidence for local probing,
                # not proof that the click advanced the level.
                neighbors = max((
                    min(n, 3) for (lvl, sx, sy), n
                    in self._click_successes.items()
                    if lvl == key[0] and (sx, sy) != (x, y)
                    and (sx-x)**2 + (sy-y)**2 <= 49
                ), default=0)
                penalty -= 2 * neighbors
                # Repeated exact clicks can be useful; this is deliberately
                # a falsifiable alternative, not a baseline change.
                penalty += 6 * min(self._click_successes[(key[0],x,y)], 2)
            predicted = self._transitions.get(
"""

def generate(source: str) -> str:
    if (source.count(GUARD) != 1 or source.count(GATE) != 1
            or source.count(RANK) != 1):
        raise ValueError("frozen source guard failed")
    result = source.replace(GATE, GATE_NEW, 1).replace(RANK, RANK_NEW, 1)
    compile(result, "<ul001-candidate>", "exec")
    return result

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))

if __name__ == "__main__":
    main()
