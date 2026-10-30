"""Read-only area-rank ablation for public ARC-AGI-3 causal donor transfer.

Only strict relative-area rank is removed from role representation. Shape,
unique nearest-anchor direction, duplicate-role abstention, nonzero cardinal
movement, exact action (including ACTION6 coordinates), level, held-out
donor exclusion, static/conflict veto, two-game consensus and local replay
precedence are unchanged. No policy import or Kaggle interaction.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from remaining_public_sample import FROZEN_GAMES, HORIZON
from relative_geometry_transfer_audit import GATES, _consensus, _sign
from relative_nonunit_transfer_audit import evaluate_nonunit_relative_transfer
from single_object_prequential import _effect_forecast, _learn_effect

PROTOCOL = "arc-agi3.area-rank-unrestricted-leave-one-public-game-out-v1"


def _roles_unranked(scene):
    """Same nearest-anchor/shape role, except no strict area-rank requirement."""
    tentative = []
    for obj in scene:
        _, _, x0, y0, x1, y1 = obj
        others = [other for other in scene if other != obj]
        if not others:
            tentative.append(None)
            continue
        width, height = x1-x0+1, y1-y0+1
        shape = "square" if width == height else ("wide" if width > height else "tall")
        cx, cy = x0+x1, y0+y1
        distances = [(abs(o[2]+o[4]-cx)+abs(o[3]+o[5]-cy), o) for o in others]
        nearest_distance = min(d for d, _ in distances)
        nearest = [o for d, o in distances if d == nearest_distance]
        if len(nearest) != 1:
            tentative.append(None)
            continue
        anchor = nearest[0]
        direction = (_sign(anchor[2]+anchor[4]-cx),
                     _sign(anchor[3]+anchor[5]-cy))
        tentative.append((shape, "area_unranked", direction))
    counts = Counter(role for role in tentative if role is not None)
    return [role if role is not None and counts[role] == 1 else None
            for role in tentative]


def _learn_unranked(before, after, action, level, evidence):
    kind = classify([list(x) for x in before], [list(x) for x in after])
    if kind not in ("static", "single_object_translate"):
        return
    removed = list((Counter(before)-Counter(after)).elements())
    added = list((Counter(after)-Counter(before)).elements())
    moved = None
    if kind == "single_object_translate" and len(removed) == len(added) == 1:
        old, new = removed[0], added[0]
        dx, dy = new[2]-old[2], new[3]-old[3]
        if (dx == 0) == (dy == 0):
            return  # Zero or diagonal displacement is not cardinal.
        moved = (old, (dx, dy))
    for obj, role in zip(before, _roles_unranked(before)):
        if role is None:
            continue
        if moved is not None and obj == moved[0]:
            evidence[(level, action, role)].add(moved[1])
        elif obj in after:
            evidence[(level, action, role)].add((0, 0))


def _donors_unranked(grouped):
    by_game = {}
    for game, rows in grouped.items():
        rules = defaultdict(set)
        for row in rows:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            _learn_unranked(_scene(row["before_scene"]), _scene(row["after_scene"]),
                            row["action_key"], row["level_before"], rules)
        by_game[game] = rules
    return by_game


def _predict_unranked(before, action, level, consensus):
    candidates = []
    for obj, role in zip(before, _roles_unranked(before)):
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


def _evaluate_target_unranked(rows, one, two):
    seen = {}
    local = defaultdict(set)
    last_level, last_turn = None, -1
    stats = dict(same_level=0, level_advances=0, static_correct=0,
                 baseline_correct=0, one_correct=0, strict_correct=0,
                 one_forecasts=0, one_forecasts_correct=0,
                 strict_forecasts=0, strict_forecasts_correct=0)
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
        for label, rules in (("one", one), ("strict", two)):
            candidate = _predict_unranked(before, action, level, rules) if donor_allowed else None
            prediction = candidate if candidate is not None else baseline
            stats[label+"_correct"] += int(prediction == after)
            stats[label+"_forecasts"] += int(candidate is not None)
            stats[label+"_forecasts_correct"] += int(candidate is not None and candidate == after)
        seen.setdefault((action, before), set()).add(after)
        _learn_effect(before, after, action, local)
    return stats


def evaluate_area_rank_ablation(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    original = evaluate_nonunit_relative_transfer(rows)
    donors = _donors_unranked(grouped)
    per_game, total, support = {}, {}, {}
    for game in FROZEN_GAMES:
        one = _consensus(donors, game, 1)
        two = _consensus(donors, game, 2)
        result = _evaluate_target_unranked(grouped[game], one, two)
        old = original["per_game"][game]
        for key in ("same_level", "level_advances", "static_correct", "baseline_correct"):
            if result[key] != old[key]:
                raise AssertionError("area-rank ablation changed matched control: "+key)
        if (result["same_level"] != frozen["per_game"][game]["same_level_records"] or
                result["baseline_correct"] != frozen["per_game"][game]["combined_correct"]):
            raise AssertionError("area-rank ablation diverged from frozen public controls")
        stats = {
            "same_level": result["same_level"],
            "level_advances": result["level_advances"],
            "static_correct": result["static_correct"],
            "baseline_correct": result["baseline_correct"],
            "strict_nonunit_correct": old["strict_nonunit_correct"],
            "strict_nonunit_forecasts": old["strict_nonunit_forecasts"],
            "area_unranked_correct": result["strict_correct"],
            "area_unranked_forecasts": result["strict_forecasts"],
            "area_unranked_forecasts_correct": result["strict_forecasts_correct"],
            "area_unranked_delta": result["strict_correct"]-old["strict_nonunit_correct"],
            "area_unranked_vs_local_delta": result["strict_correct"]-result["baseline_correct"],
            "one_donor_forecasts": result["one_forecasts"],
        }
        per_game[game] = stats
        support[game] = {"one_donor_rules": len(one), "two_donor_rules": len(two)}
        for key, value in stats.items():
            total[key] = total.get(key, 0)+value
    positive = sum(x["area_unranked_delta"] > 0 for x in per_game.values())
    negative = sum(x["area_unranked_delta"] < 0 for x in per_game.values())
    forecast_games = sum(x["area_unranked_forecasts"] > 0 for x in per_game.values())
    passed = (positive >= GATES["min_positive_games"] and
              negative <= GATES["max_negative_games"] and
              total["area_unranked_forecasts"] >= GATES["min_strict_forecasts"] and
              forecast_games >= GATES["min_forecast_games"] and
              total["level_advances"] >= GATES["min_progress_events"])
    return {
        "protocol": PROTOCOL, "games": list(FROZEN_GAMES), "horizon": HORIZON,
        "hypotheses": ["static", "within_game_replay_effect_static",
                       "strict_area_rank_nonunit_two_donor",
                       "unranked_area_nonunit_two_donor"],
        "only_relaxation": "strict relative-area rank removed; unique nearest anchor, duplicate-role abstention, exact action, level, cardinal motion, donor consensus, conflict/static veto unchanged",
        "per_game": per_game, "total": total, "donor_support": support,
        "acceptance": {"positive_games": positive, "negative_games": negative,
                       "forecast_games": forecast_games,
                       "research_gates_passed": passed,
                       "result": "RESEARCH_GATE_PASS_NO_AUTOMATIC_PROMOTION"
                       if passed else "REJECT_POLICY_INTEGRATION"},
        "effect_on_agent": "NONE_SHADOW_ONLY",
        "caveat": "Exploratory PUBLIC leave-one-game-out trace; donor games may be globally later; not hidden holdout, causal intervention, gameplay gain or Kaggle submission",
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: relative_area_rank_transfer_audit.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = evaluate_area_rank_ablation(json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
