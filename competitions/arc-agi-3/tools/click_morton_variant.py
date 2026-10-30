"""Research-only dispersed click ordering after a level-zero click-only stall.

This candidate preserves the frozen agent and the existing threshold gate.
After 96 unsuccessful click-only steps it changes the 8x8 uniform target
priority from row-major to a Morton-prefix (quadtree) order. This is a
pre-registered action intervention, not a learned world model or held-out gain.
"""
from __future__ import annotations

from click_stagnation_variant import generate as stagnation_generate

THRESHOLD_GUARD = "and level == 0 and self._steps >= 128"
UNIFORM_GUARD = """                for yi in range(8):
                    for xi in range(8):
                        x = min_x + ((2*xi+1) * (max_x-min_x)) // 16
                        y = min_y + ((2*yi+1) * (max_y-min_y)) // 16
                        p = (max(0,min(63,x)), max(0,min(63,y)))
                        if p not in uniform:
                            uniform.append(p)"""

MORTON = """                # Spread early trials across distant quadrants, then refine.
                # Bit-interleaved prefix: k=0..3 targets four large quadrants.
                for k in range(64):
                    xi = ((k & 1) << 2) | ((k & 4) >> 1) | ((k & 16) >> 4)
                    yi = ((k & 2) << 1) | ((k & 8) >> 2) | ((k & 32) >> 5)
                    x = min_x + ((2*xi+1) * (max_x-min_x)) // 16
                    y = min_y + ((2*yi+1) * (max_y-min_y)) // 16
                    p = (max(0,min(63,x)), max(0,min(63,y)))
                    if p not in uniform:
                        uniform.append(p)"""


def generate(source: str, threshold: int = 96) -> str:
    if not isinstance(threshold, int) or not 1 <= threshold <= 499:
        raise ValueError("threshold must be between 1 and 499")
    result = stagnation_generate(source)
    if result.count(THRESHOLD_GUARD) != 1 or result.count(UNIFORM_GUARD) != 1:
        raise ValueError("frozen candidate source guard failed")
    result = result.replace(THRESHOLD_GUARD, f"and level == 0 and self._steps >= {threshold}", 1)
    result = result.replace(UNIFORM_GUARD, MORTON, 1)
    compile(result, "<morton-research-candidate>", "exec")
    return result
