"""Read-only relative-geometry counterfactual transfer on frozen PUBLIC ARC traces.

H0 static; H1 same-game prequential exact replay -> one-object effect;
H2/H3 H1 followed by a color/absolute-size invariant donor prediction
supported by >=1 / >=2 distinct OTHER public games. All hypotheses score
the same turns. Donor outcomes may be chronologically later than target
turns: leave-one-game-out, NOT global prequential or causal intervention.
No policy import, Kaggle action, hidden evaluation or promotion.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from remaining_public_sample import FROZEN_GAMES, HORIZON
from single_object_prequential import _effect_forecast, _learn_effect

PROTOCOL = "arc-agi3.relative-geometry-leave-one-public-game-out-v1"
GATES = dict(min_positive_games=3, max_negative_games=0,
             min_strict_forecasts=30, min_forecast_games=3,
             min_progress_events=3, automatic_policy_promotion=False)


def _sign(x):
    return (x > 0) - (x < 0)


def _roles(scene):
    """Coarse shape/relative-area/nearest-anchor direction, no palette or x/y.

    Ambiguous nearest anchors and duplicate object roles are excluded.
    This is a representation hypothesis, not a semantic player detector.
    """
    tentative = []
    for obj in scene:
        _, area, x0, y0, x1, y1 = obj
        others = [other for other in scene if other != obj]
        if not others:
            tentative.append(None)
            continue
        if all(area < other[1] for other in others):
            rank = "smallest"
        elif all(area > other[1] for other in others):
            rank = "largest"
        else:
            tentative.append(None)
            continue
        width, height = x1-x0+1, y1-y0+1
        shape = "square" if width == height else ("wide" if width > height else "tall")
        cx, cy = x0+x1, y0+y1
        distances = [(abs(o[2]+o[4]-cx)+abs(o[3]+o[5]-cy), o) for o in others]
        distance = min(d for d, _ in distances)
        nearest = [o for d, o in distances if d == distance]
        if len(nearest) != 1:
            tentative.append(None)
            continue
        anchor = nearest[0]
        direction = (_sign(anchor[2]+anchor[4]-cx),
                     _sign(anchor[3]+anchor[5]-cy))
        tentative.append((shape, rank, direction))
    counts = Counter(role for role in tentative if role is not None)
    return [role if role is not None and counts[role] == 1 else None
            for role in tentative]


def _learn_relative(before, after, action, level, evidence):
    kind = classify([list(x) for x in before], [list(x) for x in after])
    if kind not in ("static", "single_object_translate"):
        return
    removed = list((Counter(before)-Counter(after)).elements())
    added = list((Counter(after)-Counter(before)).elements())
    moved = None
    if kind == "single_object_translate" and len(removed) == len(added) == 1:
        old, new = removed[0], added[0]
        delta = (new[2]-old[2], new[3]-old[3])
        if abs(delta[0])+abs(delta[1]) != 1:
            return  # Only one-pixel cardinal effects are comparable.
        moved = (old, delta)
    for obj, role in zip(before, _roles(before)):
        if role is None:
            continue
        if moved is not None and obj == moved[0]:
            evidence[(level, action, role)].add(moved[1])
        elif obj in after:
            evidence[(level, action, role)].add((0, 0))


def _donors(grouped):
    by_game = {}
    for game, rows in grouped.items():
        rules = defaultdict(set)
        for row in rows:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before, after = _scene(row["before_scene"]), _scene(row["after_scene"])
            _learn_relative(before, after, row["action_key"], row["level_before"], rules)
        by_game[game] = rules
    return by_game


def _consensus(donors, target, min_donors):
    votes = defaultdict(dict)
    for game, rules in donors.items():
        if game == target:
            continue
        for key, effects in rules.items():
            votes[key][game] = frozenset(effects)
    accepted = {}
    for key, per_game in votes.items():
        if len(per_game) < min_donors:
            continue
        effects = set().union(*per_game.values())
        if len(effects) != 1 or (0, 0) in effects:
            continue  # Any static or contradictory witness vetoes transfer.
        accepted[key] = next(iter(effects))
    return accepted


def _predict(before, action, level, consensus):
    candidates = []
    for obj, role in zip(before, _roles(before)):
        if role is None:
            continue
        delta = consensus.get((level, action, role))
        if delta is None:
            continue
        dx, dy = delta
        c, area, x0, y0, x1, y1 = obj
        shifted = (c, area, x0+dx, y0+dy, x1+dx, y1+dy)
        if not (0 <= shifted[2] <= shifted[4] < 64 and
                0 <= shifted[3] <= shifted[5] < 64) or shifted in before:
            continue
        candidates.append((obj, shifted))
    if len(candidates) != 1:
        return None
    old, new = candidates[0]
    result = list(before)
    result.remove(old)
    result.append(new)
    return tuple(sorted(result))


def _evaluate_target(rows, weak, strict):
    seen = {}
    local = defaultdict(set)
    last_level, last_turn = None, -1
    stats = dict(same_level=0, level_advances=0, static_correct=0,
                 baseline_correct=0, permissive_correct=0, strict_correct=0,
                 permissive_relative_forecasts=0, permissive_relative_correct=0,
                 strict_relative_forecasts=0, strict_relative_correct=0)
    for row in rows:
        level, turn, action = row["level_before"], row["turn"], row["action_key"]
        if level != last_level or turn != last_turn+1:
            seen, local = {}, defaultdict(set)
        last_level, last_turn = level, turn
        if action == "RESET":
            seen, local = {}, defaultdict(set)
            continue
        if row["level_after"] != level:
            stats["level_advances"] += 1
            seen, local = {}, defaultdict(set)
            last_level = row["level_after"]
            continue
        before, after = _scene(row["before_scene"]), _scene(row["after_scene"])
        stats["same_level"] += 1
        stats["static_correct"] += int(before == after)
        prior = seen.get((action, before))
        effect, _ = _effect_forecast(before, action, local)
        if prior is not None:
            baseline = next(iter(prior)) if len(prior) == 1 else before
            donor_allowed = False
        elif effect is not None:
            baseline, donor_allowed = effect, False
        else:
            baseline, donor_allowed = before, True
        stats["baseline_correct"] += int(baseline == after)
        for name, rules in (("permissive", weak), ("strict", strict)):
            candidate = _predict(before, action, level, rules) if donor_allowed else None
            prediction = candidate if candidate is not None else baseline
            stats[name+"_correct"] += int(prediction == after)
            stats[name+"_relative_forecasts"] += int(candidate is not None)
            stats[name+"_relative_correct"] += int(candidate is not None and candidate == after)
        seen.setdefault((action, before), set()).add(after)
        _learn_effect(before, after, action, local)
    stats["permissive_delta"] = stats["permissive_correct"]-stats["baseline_correct"]
    stats["strict_delta"] = stats["strict_correct"]-stats["baseline_correct"]
    return stats


def evaluate_relative_transfer(records):
    grouped, frozen = _bounded_rows(records)
    donors = _donors(grouped)
    per_game, totals, support = {}, {}, {}
    for game in FROZEN_GAMES:
        weak = _consensus(donors, game, 1)
        strict = _consensus(donors, game, 2)
        result = _evaluate_target(grouped[game], weak, strict)
        expected = frozen["per_game"][game]
        if (result["same_level"] != expected["same_level_records"] or
                result["level_advances"] != expected["level_advance_records"] or
                result["static_correct"] != expected["static_correct"] or
                result["baseline_correct"] != expected["combined_correct"]):
            raise AssertionError("relative transfer baseline diverged from frozen control")
        per_game[game] = result
        support[game] = dict(one_donor_rules=len(weak), two_donor_rules=len(strict))
        for key, value in result.items():
            totals[key] = totals.get(key, 0)+value
    positive = sum(s["strict_delta"] > 0 for s in per_game.values())
    negative = sum(s["strict_delta"] < 0 for s in per_game.values())
    forecast_games = sum(s["strict_relative_forecasts"] > 0 for s in per_game.values())
    passed = (positive >= GATES["min_positive_games"] and
              negative <= GATES["max_negative_games"] and
              totals["strict_relative_forecasts"] >= GATES["min_strict_forecasts"] and
              forecast_games >= GATES["min_forecast_games"] and
              totals["level_advances"] >= GATES["min_progress_events"])
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                hypotheses=["static", "within_game_replay_effect_static",
                            "local_then_one_donor_relative",
                            "local_then_two_donor_relative"],
                representation="shape + strict relative area rank + nearest-anchor direction; unit cardinal effect",
                per_game=per_game, total=totals, donor_support=support,
                acceptance=dict(positive_games=positive, negative_games=negative,
                                strict_forecast_games=forecast_games,
                                research_gates_passed=passed,
                                result="RESEARCH_GATE_PASS_NO_AUTOMATIC_PROMOTION"
                                       if passed else "REJECT_POLICY_INTEGRATION"),
                effect_on_agent="NONE_SHADOW_ONLY",
                caveat="PUBLIC exploratory leave-one-game-out; donor outcomes can be later; no hidden holdout, causal intervention, policy A/B or Kaggle submission")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: relative_geometry_transfer_audit.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as f:
        print(json.dumps(evaluate_relative_transfer(json.loads(line) for line in f if line.strip()), sort_keys=True))


if __name__ == "__main__":
    main()
