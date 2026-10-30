"""Shadow-only matched action-vs-role counterfactual on frozen PUBLIC ARC-AGI-3 traces.

The four competing donor world hypotheses project either action or relative
object role (or both). They retain exact level, >=2 independent OTHER games,
unanimous nonstatic effect, bounds, unique predicted moving object, local
prequential replay/effect precedence, and exact ACTION6 click coordinates.
Projection is a deliberately falsifiable counterfactual, NOT a policy.
Donor games may occur later globally; no hidden evaluation or causal claim.
"""
from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene
from remaining_public_sample import FROZEN_GAMES, HORIZON
from relative_area_rank_transfer_audit import (
    _donors_unranked, _roles_unranked, evaluate_area_rank_ablation,
)
from relative_geometry_transfer_audit import GATES
from single_object_prequential import _effect_forecast, _learn_effect

PROTOCOL = "arc-agi3.action-role-projected-counterfactual-v1"
VARIANTS = ("exact", "action", "role", "both")
HYPOTHESES = [
    "static", "within_game_replay_effect_static",
    "exact_action_exact_role", "action_ablated_role_exact",
    "action_exact_role_ablated", "action_and_role_ablated",
]


def _key(level, action, role, variant):
    if variant not in VARIANTS:
        raise ValueError("unknown hypothesis")
    # Never erase click coordinates: ACTION6 targets are distinct interventions.
    projected_action = ("ANY_NONCLICK_ACTION"
                        if variant in ("action", "both") and
                        not action.startswith("ACTION6") else action)
    projected_role = "ANY_ROLE" if variant in ("role", "both") else role
    return (level, projected_action, projected_role)


def _consensus_projected(donors, target, variant):
    by_key = defaultdict(lambda: defaultdict(set))
    for game, rules in donors.items():
        if game == target:
            continue
        for (level, action, role), effects in rules.items():
            by_key[_key(level, action, role, variant)][game].update(effects)
    accepted = {}
    for key, games in by_key.items():
        if len(games) < 2:
            continue
        effects = set().union(*games.values())
        if len(effects) != 1 or (0, 0) in effects:
            continue
        accepted[key] = next(iter(effects))
    return accepted


def _predict(before, level, action, rules, variant):
    candidates = []
    for obj, role in zip(before, _roles_unranked(before)):
        if role is None:
            continue
        delta = rules.get(_key(level, action, role, variant))
        if delta is None:
            continue
        dx, dy = delta
        color, area, x0, y0, x1, y1 = obj
        shifted = (color, area, x0+dx, y0+dy, x1+dx, y1+dy)
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


def _evaluate_target(rows, rules):
    seen, local = {}, defaultdict(set)
    last_level, last_turn = None, -1
    stats = dict(same_level=0, level_advances=0,
                 static_correct=0, baseline_correct=0)
    for variant in VARIANTS:
        stats.update({variant+"_correct": 0, variant+"_forecasts": 0,
                      variant+"_forecasts_correct": 0})
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
            baseline, donor_allowed = (next(iter(prior)) if len(prior) == 1
                                       else before), False
        elif effect is not None:
            baseline, donor_allowed = effect, False
        else:
            baseline, donor_allowed = before, True
        stats["baseline_correct"] += int(baseline == after)
        for variant in VARIANTS:
            candidate = (_predict(before, level, action, rules[variant], variant)
                         if donor_allowed else None)
            prediction = candidate if candidate is not None else baseline
            stats[variant+"_correct"] += int(prediction == after)
            stats[variant+"_forecasts"] += int(candidate is not None)
            stats[variant+"_forecasts_correct"] += int(
                candidate is not None and candidate == after)
        seen.setdefault((action, before), set()).add(after)
        _learn_effect(before, after, action, local)
    for variant in VARIANTS:
        stats[variant+"_delta"] = (stats[variant+"_correct"] -
                                   stats["baseline_correct"])
    return stats


def evaluate_action_role_counterfactual(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    previous = evaluate_area_rank_ablation(rows)
    donors = _donors_unranked(grouped)
    per_game, total, support = {}, {}, {}
    for game in FROZEN_GAMES:
        rules = {v: _consensus_projected(donors, game, v) for v in VARIANTS}
        stats = _evaluate_target(grouped[game], rules)
        prior = previous["per_game"][game]
        expected = frozen["per_game"][game]
        for key, old in (
            ("same_level", expected["same_level_records"]),
            ("level_advances", expected["level_advance_records"]),
            ("static_correct", expected["static_correct"]),
            ("baseline_correct", expected["combined_correct"]),
            ("exact_correct", prior["area_unranked_correct"]),
            ("exact_forecasts", prior["area_unranked_forecasts"]),
        ):
            if stats[key] != old:
                raise AssertionError("matched control drift: "+key)
        per_game[game] = stats
        support[game] = {v: len(rules[v]) for v in VARIANTS}
        for key, value in stats.items():
            total[key] = total.get(key, 0)+value
    gates = {}
    for variant in VARIANTS:
        positive = sum(v[variant+"_delta"] > 0 for v in per_game.values())
        negative = sum(v[variant+"_delta"] < 0 for v in per_game.values())
        forecast_games = sum(v[variant+"_forecasts"] > 0 for v in per_game.values())
        passes = (positive >= GATES["min_positive_games"] and
                  negative <= GATES["max_negative_games"] and
                  total[variant+"_forecasts"] >= GATES["min_strict_forecasts"] and
                  forecast_games >= GATES["min_forecast_games"] and
                  total["level_advances"] >= GATES["min_progress_events"])
        gates[variant] = dict(positive_games=positive, negative_games=negative,
                              forecast_games=forecast_games, research_gates_passed=passes)
    return dict(protocol=PROTOCOL, hypotheses=HYPOTHESES,
                games=list(FROZEN_GAMES), horizon=HORIZON,
                per_game=per_game, total=total, donor_support=support,
                acceptance=gates, effect_on_agent="NONE_SHADOW_ONLY",
                caveat="Exploratory PUBLIC leave-one-game-out; donor outcomes may be globally later. Projected action/role are competing counterfactual hypotheses, not learned causal invariants. No agent change, hidden score or Kaggle submission.")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: action_role_counterfactual_audit.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = evaluate_action_role_counterfactual(
            json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
