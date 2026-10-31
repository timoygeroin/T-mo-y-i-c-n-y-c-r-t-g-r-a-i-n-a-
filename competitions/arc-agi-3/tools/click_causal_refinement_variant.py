"""ARC-AGI-3 task-local causal click follow-up, never the frozen submission agent.

Mechanism: only after 96 stalled click-only level-zero actions, first run the
previously measured row-major 8x8 exploration. If a previously attempted
physical coordinate produced a visible local/large response without being
outvoted by failed attempts, test a small neighborhood before returning to
the coarse grid. A deliberately distant-neighbor arm falsifies the
local-causal interpretation. All effects remain in-sample until official
paired game scorecards and action-cost readback.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from click_affordance_variant import generate as affordance_generate

GATE = "        self._click_only = len(legal) == 1 and legal[0].name == 'ACTION6'\n"
ROW = "                points = uniform + [p for p in points if p not in uniform]\n"
GATE_REPLACEMENT = """        # Preserve all early successes and mixed-action behavior verbatim.
        self._click_only = (
            len(legal) == 1 and legal[0].name == 'ACTION6'
            and level == 0 and self._steps >= 96
        )
"""

def generate(source: str, mode: str = "near") -> str:
    if mode not in ("near", "far"):
        raise ValueError("mode must be near or far")
    result = affordance_generate(source)
    if result.count(GATE) != 1 or result.count(ROW) != 1:
        raise ValueError("frozen policy anchors changed; fail closed")
    result = result.replace(GATE, GATE_REPLACEMENT, 1)
    offsets = ((2,0),(-2,0),(0,2),(0,-2),(4,0),(-4,0),(0,4),(0,-4)) if mode == "near" else (
        (24,0),(-24,0),(0,24),(0,-24),(16,0),(-16,0),(0,16),(0,-16)
    )
    injection = """                # Causal follow-up: action-conditioned, not game-ID routing.
                # Negative control probes distant offsets from identical
                # prior evidence and preserves the same gate and budget.
                responsive = []
                for (observed_level, rx, ry), successes in self._click_successes.items():
                    if observed_level != key[0]:
                        continue
                    failures = self._click_failures[(observed_level, rx, ry)]
                    if successes > failures:
                        responsive.append((successes - failures, successes, rx, ry))
                responsive.sort(reverse=True)
                local = []
                for _, _, rx, ry in responsive[:3]:
                    for dx, dy in OFFSETS:
                        px, py = rx + dx, ry + dy
                        if min_x <= px < max_x and min_y <= py < max_y:
                            point = (px, py)
                            if point not in local:
                                local.append(point)
                points = local + uniform + [p for p in points if p not in local and p not in uniform]
""".replace("OFFSETS", repr(offsets))
    result = result.replace(ROW, injection, 1)
    compile(result, "<causal-click-"+mode+">", "exec")
    return result

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("near","far"), default="near")
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text(), mode=args.mode))

if __name__ == "__main__":
    main()
