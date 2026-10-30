"""Isolated, same-prefix one-click public causal probe. Never imports into contest agent.

H0: swapping one click after a matched prefix does not change the next frame.
H1: a different-color target changes the next frame and helps level progress.
H2: it changes the frame without helping progress, or causes a regression.
Predeclared: all 25 public games, 500 steps/arm, first eligible click-only
level-zero ACTION6 at steps 96..160, one alternative physical click maximum.
No game IDs or outcome-derived thresholds. Observed score is public/local only.
"""
from __future__ import annotations
import argparse
import hashlib
import inspect
import json
import re
from pathlib import Path


def choose_alternative(points, original, grid):
    """Prefer the nearest different-color salient target; otherwise nearest distinct.

    No game ID, level outcome, future frame or hidden state is consulted.
    """
    if original is None or not grid:
        return None
    ox, oy = original
    if not (0 <= oy < len(grid) and 0 <= ox < len(grid[oy])):
        return None
    color = int(grid[oy][ox])
    choices = []
    for i, p in enumerate(points):
        if not isinstance(p, (tuple, list)) or len(p) != 2:
            continue
        x, y = p
        if not (isinstance(x, int) and isinstance(y, int)):
            continue
        if not (0 <= x < 64 and 0 <= y < 64 and y < len(grid) and x < len(grid[y])):
            continue
        if (x, y) == (ox, oy):
            continue
        different_color = int(grid[y][x]) != color
        distance = abs(x - ox) + abs(y - oy)
        choices.append((0 if different_color else 1, distance, i, (x, y)))
    return min(choices)[3] if choices else None


def summarize_fork(before_hash, next_frozen_hash, next_candidate_hash,
                   level_before, level_frozen, level_candidate):
    return {
        "next_visible_diverged": next_frozen_hash != next_candidate_hash,
        "candidate_progress_advantage": level_candidate > level_frozen,
        "candidate_progress_regression": level_candidate < level_frozen,
        "level_before": level_before,
        "frozen_level_next": level_frozen,
        "candidate_level_next": level_candidate,
    }


MARKER = "        return action\n"
INSTRUMENT = """        _fork_full = hashlib.sha256(b''.join(bytes(int(v) & 255 for v in row) for row in grids[-1])).hexdigest() if grids else 'none'
        _fork_xy = self._last_position if action.name == 'ACTION6' and self._last_position is not None else (-1, -1)
        print(f'ARC_FORK game={self.game_id} step={self._steps} level={level} visible={_fork_full} action={action.name} x={_fork_xy[0]} y={_fork_xy[1]} branch={int(_fork_alt is not None)}', flush=True)
"""
CANDIDATE = """        _fork_alt = None
        if (not getattr(self, '_paired_fork_done', False) and 96 <= self._steps <= 160
                and level == 0 and action.name == 'ACTION6'
                and len(legal) == 1 and legal[0].name == 'ACTION6'
                and self._last_position is not None and grids and grids[-1]):
            _fork_orig = self._last_position
            _fork_alt = _paired_choose_alternative(
                self._salient_points(grids)[:self.MAX_CLICKS], _fork_orig, grids[-1])
            if _fork_alt is not None:
                _ox, _oy = _fork_orig
                _nx, _ny = _fork_alt
                _old_local = (level, key[1], _ox, _oy)
                _new_local = (level, key[1], _nx, _ny)
                _old_global = (level, _ox, _oy)
                _new_global = (level, _nx, _ny)
                self._click_visits[_old_local] -= 1
                self._global_click_visits[_old_global] -= 1
                self._click_visits[_new_local] += 1
                self._global_click_visits[_new_global] += 1
                self._last_position = _fork_alt
                action.set_data({'x': _nx, 'y': _ny})
                self._paired_fork_done = True
"""
FROZEN = "        _fork_alt = None\n"
ROW = re.compile(r"ARC_FORK game=(\S+) step=(\d+) level=(\d+) visible=(\w+) action=(\w+) x=(-?\d+) y=(-?\d+) branch=(\d+)")
SCORE = re.compile(r"Aggregate scorecard score:\s*([0-9.eE+-]+)")
GAME_SUM = re.compile(r"^\s*([a-z0-9]{4})\s+levels=\s*(\d+)\s+actions=\s*(\d+)", re.M)


def generate(source):
    if source.count(MARKER) != 1:
        raise ValueError("Unexpected frozen agent return-action structure")
    if source.count("class MyAgent(Agent):") != 1:
        raise ValueError("Unexpected frozen agent class")
    helper = inspect.getsource(choose_alternative).replace(
        "def choose_alternative(", "def _paired_choose_alternative(", 1)
    frozen = source.replace(MARKER, FROZEN + INSTRUMENT + MARKER, 1)
    candidate = source.replace("class MyAgent(Agent):", helper + "\n\nclass MyAgent(Agent):", 1)
    candidate = candidate.replace(MARKER, CANDIDATE + INSTRUMENT + MARKER, 1)
    assert frozen != candidate and "MAX_ACTIONS = 500" in frozen and "MAX_ACTIONS = 500" in candidate
    return frozen, candidate


def read_log(path):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    by_game = {}
    for m in ROW.finditer(text):
        gid, step, level, visible, action, x, y, branch = m.groups()
        item = dict(step=int(step), level=int(level), visible=visible,
                    action=action, x=int(x), y=int(y), branch=int(branch))
        game = by_game.setdefault(gid, {})
        if item["step"] in game:
            raise ValueError(f"duplicate preaction row: {gid}/{step}")
        game[item["step"]] = item
    scores = SCORE.findall(text)
    score = float(scores[-1]) if scores else None
    final = {m.group(1): {"levels": int(m.group(2)), "actions": int(m.group(3))}
             for m in GAME_SUM.finditer(text)}
    return by_game, score, final


def audit(frozen_log, candidate_log):
    a, score_a, final_a = read_log(frozen_log)
    b, score_b, final_b = read_log(candidate_log)
    if len(a) != 25 or set(a) != set(b) or set(final_a) != set(final_b) or len(final_a) != 25:
        raise ValueError("Expected same complete official 25-game roster in both arms")
    if score_a is None or score_b is None:
        raise ValueError("Missing official public local scorecard")
    records = {}
    invalid = []
    for gid in sorted(a):
        left, right = a[gid], b[gid]
        fork_steps = [t for t, row in right.items() if row["branch"]]
        if len(fork_steps) > 1:
            invalid.append(f"{gid}: more than one intervention")
        fork = fork_steps[0] if fork_steps else None
        if left[min(left)]["visible"] != right[min(right)]["visible"]:
            invalid.append(f"{gid}: unmatched initial visible frame")
        prefix_end = fork if fork is not None else max(max(left), max(right))
        for t in range(1, prefix_end + 1):
            if t not in left or t not in right:
                invalid.append(f"{gid}: missing prefix step {t}")
                break
            u, v = left[t], right[t]
            if (u["visible"], u["level"], u["action"]) != (v["visible"], v["level"], v["action"]):
                invalid.append(f"{gid}: divergent prestate/action before intervention step {t}")
                break
            if t < prefix_end and (u["x"], u["y"]) != (v["x"], v["y"]):
                invalid.append(f"{gid}: divergent physical action before intervention step {t}")
                break
        if fork is not None:
            u, v = left[fork], right[fork]
            if u["action"] != "ACTION6" or (u["x"], u["y"]) == (v["x"], v["y"]):
                invalid.append(f"{gid}: intervention did not change physical ACTION6")
            if not (96 <= fork <= 160 and u["level"] == 0):
                invalid.append(f"{gid}: intervention violated preregistered window")
            after_a, after_b = left.get(fork+1), right.get(fork+1)
            immediate = (summarize_fork(u["visible"], after_a["visible"], after_b["visible"],
                         u["level"], after_a["level"], after_b["level"])
                         if after_a and after_b else None)
        else:
            immediate = None
        first_a = next((t for t in sorted(left) if left[t]["level"] > 0), None)
        first_b = next((t for t in sorted(right) if right[t]["level"] > 0), None)
        records[gid] = {
            "fork_step": fork, "same_prefix_verified": not any(e.startswith(gid + ":") for e in invalid),
            "next_visible": immediate,
            "frozen_first_level_preaction": first_a,
            "candidate_first_level_preaction": first_b,
            "frozen_final": final_a[gid], "candidate_final": final_b[gid],
        }
    if invalid:
        raise ValueError("Protocol invalid: " + "; ".join(invalid[:12]))
    return {
        "schema": "mondayid.arc3.same_prefix_one_click_public_ab.v1",
        "status": "VALID_PUBLIC_LOCAL_SAME_PREFIX_NOT_LATENT_MATCHED",
        "protocol": {
            "games": 25, "action_cap_per_arm": 500,
            "first_eligible_click_only_level0_step_window": [96, 160],
            "one_click_replacement_per_game": True,
            "world_hypotheses": {
                "H0": "Alternative physical click has same next visible observation and no progress advantage",
                "H1": "Alternative different-color click changes next observation and improves progress by budget",
                "H2": "Alternative changes observation but has no progress gain or regresses",
            },
            "held_out_games": False,
            "independent_latent_reset_pairing": False,
            "baseline_unchanged_except_stdout_instrumentation": True,
        },
        "baseline": {"local_score": score_a,
                     "first_levels": sum(v["levels"] > 0 for v in final_a.values())},
        "candidate": {"local_score": score_b,
                      "first_levels": sum(v["levels"] > 0 for v in final_b.values())},
        "forked_games": sum(v["fork_step"] is not None for v in records.values()),
        "next_visible_divergences": sum(bool(v["next_visible"] and v["next_visible"]["next_visible_diverged"]) for v in records.values()),
        "improved_games": [g for g,v in records.items() if v["candidate_final"]["levels"] > v["frozen_final"]["levels"]],
        "regressed_games": [g for g,v in records.items() if v["candidate_final"]["levels"] < v["frozen_final"]["levels"]],
        "per_game": records,
        "limitations": ["All 25 public games already repeatedly used", "Same visible/action prefix does not authenticate equal latent reset state",
                        "A single click fork is not a learned world model", "No Kaggle hidden score or submission"],
    }


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("source"); g.add_argument("frozen"); g.add_argument("candidate")
    a = sub.add_parser("audit")
    a.add_argument("frozen_log"); a.add_argument("candidate_log"); a.add_argument("output")
    args = parser.parse_args()
    if args.cmd == "generate":
        frozen, candidate = generate(Path(args.source).read_text(encoding="utf-8"))
        Path(args.frozen).write_text(frozen, encoding="utf-8")
        Path(args.candidate).write_text(candidate, encoding="utf-8")
        print("ISOLATED_FORK_GENERATED frozen/candidate, no competition agent mutation")
    else:
        result = audit(args.frozen_log, args.candidate_log)
        Path(args.output).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({k:v for k,v in result.items() if k != "per_game"}, sort_keys=True))


if __name__ == "__main__":
    main()
