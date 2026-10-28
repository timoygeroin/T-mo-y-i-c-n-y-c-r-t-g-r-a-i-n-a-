"""PUBLIC shadow: absolute displacement versus anchor-relative world factorization.

H0: unchanged local prequential replay/effect/static control.
H1: exact action + shape + nearest-anchor axis predicts absolute displacement.
H2: same pre-action key predicts toward/away nearest anchor, with magnitude.
Require >=2 distinct OTHER donor games, unanimous nonstatic effects, no
static or unmodeled witnesses, one unambiguous movable target, and valid bounds.
No target outcome enters donor construction; donors may be globally later.
No agent/policy import, hidden evaluation, or Kaggle interaction.
"""
from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import sys

from conditional_world_conflict_audit import _witnesses
from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene
from relative_area_rank_transfer_audit import _roles_unranked
from remaining_public_sample import FROZEN_GAMES, HORIZON
from single_object_prequential import _effect_forecast, _learn_effect

PROTOCOL = "arc-agi3.anchor-relative-world-factorization-v1"
HYPOTHESES = ("absolute", "relative")


def _key(level, action, role):
    if role is None:
        return None
    shape, _, direction = role
    if direction in ((1, 0), (-1, 0)):
        axis = "x"
    elif direction in ((0, 1), (0, -1)):
        axis = "y"
    else:
        return None
    return level, action, shape, axis


def effect_code(w, hypothesis):
    """Post-outcome donor label; target prediction never calls this function."""
    if hypothesis not in HYPOTHESES:
        raise ValueError("unknown hypothesis")
    if _key(w["level"], w["action"], w["role"]) is None:
        return None
    dx, dy = w["effect"]
    if dx == dy == 0:
        return ("static", 0)
    sx, sy = w["role"][2]
    if (sx and dy) or (sy and dx) or (dx == 0 and dy == 0):
        return None
    if hypothesis == "absolute":
        return ("absolute", dx, dy)
    along = dx * sx + dy * sy
    return ("toward" if along > 0 else "away", abs(along))


def donor_rules(witnesses, target, hypothesis, eligible_games=None):
    """Unanimous effect across >=2 independent OTHER games; abstain on any veto."""
    if hypothesis not in HYPOTHESES:
        raise ValueError("unknown hypothesis")
    if eligible_games is not None and (not isinstance(eligible_games, (set, frozenset)) or any(not isinstance(g, str) or not g for g in eligible_games)):
        raise ValueError("eligible games must be a set of game IDs")
    groups = defaultdict(lambda: defaultdict(set))
    invalid = set()
    for w in witnesses:
        if w["game"] == target or (eligible_games is not None and w["game"] not in eligible_games):
            continue
        key = _key(w["level"], w["action"], w["role"])
        if key is None:
            continue
        code = effect_code(w, hypothesis)
        if code is None:
            invalid.add(key)
            continue
        groups[key][w["game"]].add(code)
    accepted = {}
    for key, games in groups.items():
        if key in invalid or len(games) < 2:
            continue
        codes = set().union(*games.values())
        if len(codes) != 1:
            continue
        code = next(iter(codes))
        if code[0] == "static":
            continue
        accepted[key] = code
    return accepted


def predict_scene(before, level, action, rules, hypothesis):
    """Counterfactual scene forecast using only BEFORE-action objects."""
    if hypothesis not in HYPOTHESES:
        raise ValueError("unknown hypothesis")
    before = tuple(sorted(before))
    candidates = []
    for obj, role in zip(before, _roles_unranked(before)):
        key = _key(level, action, role)
        if key is None or key not in rules:
            continue
        code = rules[key]
        if hypothesis == "absolute":
            if len(code) != 3 or code[0] != "absolute":
                continue
            dx, dy = code[1:]
        else:
            if len(code) != 2 or code[0] not in ("toward", "away"):
                continue
            direction = 1 if code[0] == "toward" else -1
            dx, dy = (direction * code[1] * v for v in role[2])
        color, area, x0, y0, x1, y1 = obj
        moved = (color, area, x0+dx, y0+dy, x1+dx, y1+dy)
        if not (0 <= moved[2] <= moved[4] < 64 and
                0 <= moved[3] <= moved[5] < 64):
            continue
        if moved in before:
            continue
        candidates.append((obj, moved))
    if len(candidates) != 1:
        return None
    old, new = candidates[0]
    after = list(before)
    after.remove(old)
    after.append(new)
    return tuple(sorted(after))


def _evaluate_target(rows, rules):
    seen, local = {}, defaultdict(set)
    last_level, last_turn = None, -1
    stats = dict(same_level=0, level_advances=0, static_correct=0,
                 baseline_correct=0)
    for h in HYPOTHESES:
        stats.update({h+"_correct": 0, h+"_forecasts": 0,
                      h+"_forecasts_correct": 0})
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
        local_effect, _ = _effect_forecast(before, action, local)
        if prior is not None:
            baseline = next(iter(prior)) if len(prior) == 1 else before
            donor_allowed = False
        elif local_effect is not None:
            baseline, donor_allowed = local_effect, False
        else:
            baseline, donor_allowed = before, True
        stats["baseline_correct"] += int(baseline == after)
        for h in HYPOTHESES:
            candidate = (predict_scene(before, level, action, rules[h], h)
                         if donor_allowed else None)
            prediction = candidate if candidate is not None else baseline
            stats[h+"_correct"] += int(prediction == after)
            stats[h+"_forecasts"] += int(candidate is not None)
            stats[h+"_forecasts_correct"] += int(candidate is not None and
                                                 candidate == after)
        seen.setdefault((action, before), set()).add(after)
        _learn_effect(before, after, action, local)
    for h in HYPOTHESES:
        stats[h+"_delta"] = stats[h+"_correct"] - stats["baseline_correct"]
    return stats


def evaluate_relational_worlds(records):
    grouped, frozen = _bounded_rows(records)
    witnesses = _witnesses(grouped)
    per_game, total, support = {}, defaultdict(int), {}
    prior_support, prior_order = {}, {}
    prior_totals = defaultdict(int)
    for index, target in enumerate(FROZEN_GAMES):
        # Only completed games strictly earlier in the collection sequence.
        prior = frozenset(FROZEN_GAMES[:index])
        prior_order[target] = list(FROZEN_GAMES[:index])
        strict_rules = {h: donor_rules(witnesses, target, h, prior)
                        for h in HYPOTHESES}
        strict = _evaluate_target(grouped[target], strict_rules)
        prior_support[target] = {h: len(strict_rules[h]) for h in HYPOTHESES}
        for h in HYPOTHESES:
            prior_totals[h + "_forecasts"] += strict[h + "_forecasts"]
            prior_totals[h + "_correct"] += strict[h + "_correct"]
        rules = {h: donor_rules(witnesses, target, h) for h in HYPOTHESES}
        result = _evaluate_target(grouped[target], rules)
        if strict["baseline_correct"] != result["baseline_correct"]:
            raise AssertionError("chronological baseline drift")
        control = frozen["per_game"][target]
        for name, expected in (
            ("same_level", control["same_level_records"]),
            ("level_advances", control["level_advance_records"]),
            ("static_correct", control["static_correct"]),
            ("baseline_correct", control["combined_correct"]),
        ):
            if result[name] != expected:
                raise AssertionError("frozen matched control drift: "+name)
        per_game[target] = result
        support[target] = {h: len(rules[h]) for h in HYPOTHESES}
        for name, value in result.items():
            total[name] += value
    acceptance = {}
    for h in HYPOTHESES:
        positive = sum(s[h+"_delta"] > 0 for s in per_game.values())
        negative = sum(s[h+"_delta"] < 0 for s in per_game.values())
        forecast_games = sum(s[h+"_forecasts"] > 0 for s in per_game.values())
        passed = (positive >= 3 and negative == 0 and
                  total[h+"_forecasts"] >= 30 and forecast_games >= 3 and
                  total["level_advances"] >= 3)
        acceptance[h] = dict(positive_games=positive, negative_games=negative,
                             forecast_games=forecast_games,
                             research_gates_passed=passed,
                             result=("RESEARCH_GATE_PASS_NO_AUTOMATIC_PROMOTION"
                                     if passed else "REJECT_POLICY_INTEGRATION"))
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                hypotheses=["H0_local_replay_effect_static",
                            "H1_absolute_anchor_axis",
                            "H2_toward_away_anchor_axis"],
                per_game=per_game, total=dict(total), donor_support=support,
                chronological_prior_game_only=dict(
                    donor_order=list(FROZEN_GAMES),
                    eligible_prior_games_per_target=prior_order,
                    donor_support_per_target=prior_support,
                    total_forecasts={h: prior_totals[h + "_forecasts"] for h in HYPOTHESES},
                    total_correct={h: prior_totals[h + "_correct"] for h in HYPOTHESES},
                    effect_on_agent="NONE_SHADOW_ONLY",
                    caveat="Prior completed PUBLIC games only; no independent holdout."),
                acceptance=acceptance, witness_count=len(witnesses),
                effect_on_agent="NONE_SHADOW_ONLY",
                caveat=("PUBLIC post-hoc donor pool, globally later games possible; "
                        "not a hidden holdout or causal intervention. Exact actions "
                        "including ACTION6 coordinates retained. No policy import, "
                        "Kaggle submission, prize or score claim."))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: relational_world_factorization.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as f:
        print(json.dumps(evaluate_relational_worlds(
            json.loads(line) for line in f if line.strip()), sort_keys=True))


if __name__ == "__main__":
    main()
