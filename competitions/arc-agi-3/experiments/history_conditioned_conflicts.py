"""PUBLIC shadow experiment: can prior observable history separate donor conflicts?

Competing H0 unconditional, H1 previous exact action, H2 previous observed
scene-change flag, H3 joint history. Current outcome NEVER enters context.
Require >=2 distinct OTHER games in EACH conditional stratum and unanimous
effects in all strata before declaring a mixed key explained. No policy import.
This is post-hoc PUBLIC attribution, not causal intervention or hidden holdout.
"""
from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import sys

from action_role_counterfactual_audit import VARIANTS, _key
from conditional_world_conflict_audit import _witnesses, diagnose_conditional_world_conflicts
from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene
from relative_area_rank_transfer_audit import _roles_unranked
from remaining_public_sample import FROZEN_GAMES, HORIZON

PROTOCOL = "arc-agi3.history-conditioned-donor-conflicts-v1"
HYPOTHESES = ("prev_action", "prev_scene_changed", "joint")
START = "EPISODE_START"


def iter_context_rows(rows):
    """Yield only eligible current rows with BEFORE-action observable history.

    RESET, level advance and noncontiguous turn each clear history. The
    previous scene-change bit is derived from the PREVIOUS completed action.
    """
    last_level, last_turn = None, -1
    previous_action, previous_changed = START, None
    for row in rows:
        level, turn, action = row["level_before"], row["turn"], row["action_key"]
        if level != last_level or turn != last_turn + 1:
            previous_action, previous_changed = START, None
        last_level, last_turn = level, turn
        if action == "RESET":
            previous_action, previous_changed = START, None
            continue
        if row["level_after"] != level:
            previous_action, previous_changed = START, None
            last_level = row["level_after"]
            continue
        # Score/emit current context BEFORE reading the current outcome.
        yield row, previous_action, previous_changed
        before, after = _scene(row["before_scene"]), _scene(row["after_scene"])
        previous_action = action
        previous_changed = before != after


def build_history_witnesses(grouped):
    witnesses = []
    for game, rows in grouped.items():
        for row, previous_action, previous_changed in iter_context_rows(rows):
            for w in _witnesses({game: [row]}):
                witnesses.append({**w, "prev_action": previous_action,
                                  "prev_changed": previous_changed})
    return witnesses


def _context(w, hypothesis):
    if hypothesis == "prev_action":
        return w["prev_action"]
    if hypothesis == "prev_scene_changed":
        return w["prev_changed"]
    if hypothesis == "joint":
        return (w["prev_action"], w["prev_changed"])
    raise ValueError("unknown history hypothesis")


def partition_history_conflicts(witnesses, target, variant, target_keys, hypothesis):
    """Only count genuinely mixed base keys with >=2 OTHER donor games.

    Conditional resolution requires every observed stratum to be supported
    by >=2 independent games and internally unanimous, with BOTH a static
    and a nonstatic stratum. Unsupported splits are NOT counted as gains.
    """
    if variant not in VARIANTS or hypothesis not in HYPOTHESES:
        raise ValueError("unknown hypothesis")
    groups = defaultdict(list)
    for w in witnesses:
        if w["game"] == target:
            continue
        groups[_key(w["level"], w["action"], w["role"], variant)].append(w)
    stats = dict(mixed_keys=0, resolved=0, insufficient_conditional_support=0,
                 still_conflicting=0, supported_moving_contexts=0,
                 target_overlap_mixed=0, target_overlap_resolved=0)
    for key, rows in groups.items():
        if len({w["game"] for w in rows}) < 2:
            continue
        effects = {tuple(w["effect"]) for w in rows}
        if (0, 0) not in effects or len(effects) < 2:
            continue
        stats["mixed_keys"] += 1
        stats["target_overlap_mixed"] += int(key in target_keys)
        strata = defaultdict(list)
        for w in rows:
            strata[_context(w, hypothesis)].append(w)
        insufficient = False
        conflicting = False
        supported_effects = set()
        for observations in strata.values():
            games = {w["game"] for w in observations}
            votes = {tuple(w["effect"]) for w in observations}
            if len(games) < 2:
                insufficient = True
            elif len(votes) != 1:
                conflicting = True
            else:
                effect = next(iter(votes))
                supported_effects.add(effect)
                stats["supported_moving_contexts"] += int(effect != (0, 0))
        resolved = (not insufficient and not conflicting and
                    (0, 0) in supported_effects and
                    any(effect != (0, 0) for effect in supported_effects))
        if resolved:
            stats["resolved"] += 1
            stats["target_overlap_resolved"] += int(key in target_keys)
        elif conflicting:
            stats["still_conflicting"] += 1
        else:
            stats["insufficient_conditional_support"] += 1
    if (stats["resolved"] + stats["insufficient_conditional_support"] +
            stats["still_conflicting"] != stats["mixed_keys"]):
        raise AssertionError("nonexhaustive history partition")
    return stats


def diagnose_history_conditioned_conflicts(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    prior = diagnose_conditional_world_conflicts(rows)
    witnesses = build_history_witnesses(grouped)
    per_game = {}
    totals = {v: {h: defaultdict(int) for h in HYPOTHESES} for v in VARIANTS}
    for game in FROZEN_GAMES:
        target_keys = {v: set() for v in VARIANTS}
        for row, _, _ in iter_context_rows(grouped[game]):
            for role in _roles_unranked(_scene(row["before_scene"])):
                if role is None:
                    continue
                for variant in VARIANTS:
                    target_keys[variant].add(_key(
                        row["level_before"], row["action_key"], role, variant))
        per_game[game] = {}
        for variant in VARIANTS:
            per_game[game][variant] = {}
            for hypothesis in HYPOTHESES:
                stats = partition_history_conflicts(
                    witnesses, game, variant, target_keys[variant], hypothesis)
                if stats["mixed_keys"] != prior["per_game"][game][variant]["mixed_keys"]:
                    raise AssertionError("unconditional conflict control drift")
                per_game[game][variant][hypothesis] = stats
                for name, value in stats.items():
                    totals[variant][hypothesis][name] += value
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                hypotheses=["H0_unconditional", *HYPOTHESES],
                per_game=per_game,
                total={v: {h: dict(totals[v][h]) for h in HYPOTHESES}
                       for v in VARIANTS},
                witness_count=len(witnesses),
                source_control_same_level=prior["source_control_same_level"],
                effect_on_agent="NONE_SHADOW_ONLY",
                acceptance="DIAGNOSTIC_ONLY_NO_POLICY_PROMOTION",
                caveat=("Post-hoc PUBLIC key exposures, not independent forecasts. "
                        "History is pre-action observable; all strata need two "
                        "independent other-game donors. Other donor outcomes may "
                        "be globally later. No hidden score, causal intervention, "
                        "gameplay gain, policy or Kaggle submission."))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: history_conditioned_conflicts.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        print(json.dumps(diagnose_history_conditioned_conflicts(
            json.loads(line) for line in handle if line.strip()), sort_keys=True))


if __name__ == "__main__":
    main()
