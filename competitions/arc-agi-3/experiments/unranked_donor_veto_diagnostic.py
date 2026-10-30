"""Read-only attribution of unranked ARC donor-rule vetoes on frozen PUBLIC traces.

This diagnostic changes no learner, representation, competition policy, or
Kaggle state. All donor outcomes exclude the held-out game. Counts are
post-hoc key opportunities, NOT causal interventions or scored forecasts.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from remaining_public_sample import FROZEN_GAMES, HORIZON
from relative_area_rank_transfer_audit import (
    _roles_unranked, _donors_unranked, evaluate_area_rank_ablation
)
from relative_geometry_transfer_audit import _consensus

PROTOCOL = "arc-agi3.unranked-donor-veto-attribution-v1"
HYPOTHESES = [
    "H0_no_cross_game_support",
    "H1_action_level_mismatch",
    "H2_relative_role_mismatch",
    "H3_insufficient_independent_donors",
    "H4_static_or_conflicting_effect",
    "H5_eligible_two_donor_key",
]
VETOES = (
    "action_level_mismatch", "relative_role_mismatch",
    "insufficient_donor_games", "static_or_conflicting_effect",
    "eligible_two_donor_key",
)


def diagnose_unranked_veto(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    ablation = evaluate_area_rank_ablation(rows)
    donors = _donors_unranked(grouped)
    per_game = {}
    target_keys, target_action_levels = {}, {}
    observed = Counter()

    for game in FROZEN_GAMES:
        keys, action_levels = set(), set()
        stats = Counter()
        for row in grouped[game]:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before = _scene(row["before_scene"])
            after = _scene(row["after_scene"])
            level, action = row["level_before"], row["action_key"]
            roles = _roles_unranked(before)
            action_levels.add((level, action))
            keys.update((level, action, role) for role in roles if role is not None)
            stats["same_level"] += 1
            kind = classify([list(x) for x in before], [list(x) for x in after])
            if kind != "single_object_translate":
                continue
            removed = list((Counter(before)-Counter(after)).elements())
            added = list((Counter(after)-Counter(before)).elements())
            if len(removed) != 1 or len(added) != 1:
                raise AssertionError("invalid one-object translation")
            old, new = removed[0], added[0]
            dx, dy = new[2]-old[2], new[3]-old[3]
            if (dx == 0) == (dy == 0):
                stats["diagonal_or_zero_moves"] += 1
                continue
            stats["cardinal_moves"] += 1
            role = roles[before.index(old)]
            if role is None:
                stats["cardinal_role_rejected"] += 1
            else:
                stats["cardinal_role_eligible"] += 1
        if stats["same_level"] != frozen["per_game"][game]["same_level_records"]:
            raise AssertionError("frozen public trace count diverged")
        per_game[game] = dict(stats)
        observed.update(stats)
        target_keys[game] = keys
        target_action_levels[game] = action_levels

    total_vetoes = Counter()
    for target in FROZEN_GAMES:
        other_rules = defaultdict(dict)
        for donor_game, rules in donors.items():
            if donor_game == target:
                continue
            for key, effects in rules.items():
                other_rules[key][donor_game] = frozenset(effects)
        nonzero = {
            key: votes for key, votes in other_rules.items()
            if any(effect != (0, 0)
                   for effects in votes.values() for effect in effects)
        }
        veto = Counter({name: 0 for name in VETOES})
        for key, votes in nonzero.items():
            if key[:2] not in target_action_levels[target]:
                veto["action_level_mismatch"] += 1
            elif key not in target_keys[target]:
                veto["relative_role_mismatch"] += 1
            elif len(votes) < 2:
                veto["insufficient_donor_games"] += 1
            else:
                effects = set().union(*votes.values())
                if len(effects) != 1 or (0, 0) in effects:
                    veto["static_or_conflicting_effect"] += 1
                else:
                    veto["eligible_two_donor_key"] += 1
        if sum(veto.values()) != len(nonzero):
            raise AssertionError("veto partition not exhaustive")
        accepted = _consensus(donors, target, 2)
        accepted_overlap = len(set(accepted) & target_keys[target])
        if accepted_overlap != veto["eligible_two_donor_key"]:
            raise AssertionError("veto attribution disagrees with existing consensus")
        prior = ablation["per_game"][target]
        if prior["area_unranked_forecasts"] > accepted_overlap:
            raise AssertionError("prior forecasts exceed donor target-key support")
        per_game[target].update(
            nonzero_donor_keys=len(nonzero),
            target_action_level_overlap=sum(
                key[:2] in target_action_levels[target] for key in nonzero),
            target_exact_key_overlap=len(set(nonzero) & target_keys[target]),
            two_game_nonzero_keys=sum(len(votes) >= 2 for votes in nonzero.values()),
            accepted_two_donor_target_keys=accepted_overlap,
            prior_unranked_forecasts=prior["area_unranked_forecasts"],
            candidate_key_veto=dict(veto),
        )
        total_vetoes.update(veto)

    return {
        "protocol": PROTOCOL,
        "hypotheses": HYPOTHESES,
        "games": list(FROZEN_GAMES), "horizon": HORIZON,
        "per_game": per_game,
        "total_observed": dict(observed),
        "total_candidate_key_veto": dict(total_vetoes),
        "prior_area_rank_forecasts": ablation["total"]["area_unranked_forecasts"],
        "effect_on_agent": "NONE_SHADOW_ONLY",
        "caveat": "PUBLIC post-hoc key counts, not independent held-out forecasts; donors may occur later globally. Sequential veto attribution depends on gate order. No policy change, hidden evaluation or Kaggle submission.",
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: unranked_donor_veto_diagnostic.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = diagnose_unranked_veto(json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
