"""Read-only gate for *prospective* discrimination among three causal worlds.

H0: unchanged scene. H1: absolute one-object displacement. H2: displacement
toward/away from nearest anchor. H1/H2 must each have unanimous nonstatic
support from >=2 distinct OTHER donor games. A candidate action is returned
only if all three BEFORE-action forecasts differ and a matching A->B->A
object-scene reversal was already witnessed in the target episode, with
adjacent start/restoration turns strictly preceding the proposed action
AND inside the caller-declared current episode (after RESET/level restart).

This is NOT proof of safe reversibility, a live probe, an agent policy, a
hidden holdout or a Kaggle action. Other PUBLIC donor games may be globally
later than the target. Never use the target action's outcome to choose it.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from conditional_world_conflict_audit import _witnesses
from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene
from relational_world_factorization import donor_rules, predict_scene
from remaining_public_sample import FROZEN_GAMES, HORIZON

PROTOCOL = "arc-agi3.pre-action-three-world-probe-readiness-v1"


def _worlds(before, level, action, absolute, relative):
    """Return all three distinct forecasts or abstain; no AFTER-scene input."""
    h1 = predict_scene(before, level, action, absolute, "absolute")
    h2 = predict_scene(before, level, action, relative, "relative")
    if h1 is None or h2 is None or len({before, h1, h2}) != 3:
        return None
    return dict(H0_static=before, H1_absolute=h1, H2_anchor_relative=h2)


def _matching_reversal(proofs, target, level, action, before, current_turn,
                       episode_start_turn):
    """Require a prior same-game, same-level, exact-action A->B->A witness."""
    if (type(current_turn) is not int or current_turn < 2 or
            type(episode_start_turn) is not int or
            episode_start_turn < 0 or episode_start_turn > current_turn):
        return False
    for p in proofs:
        start, restored = p.get("start_turn"), p.get("restored_turn")
        if (type(start) is not int or type(restored) is not int or
                start < episode_start_turn or restored != start + 1 or
                restored >= current_turn):
            continue
        if (p.get("game") == target and p.get("level") == level and
                p.get("action") == action and p.get("before") == before and
                p.get("restored") == before and
                p.get("middle") is not None and p["middle"] != before and
                p.get("inverse_action") not in (None, "", "RESET")):
            return True
    return False


def propose_probe(before, level, target_game, legal_actions, witnesses,
                  observed_reversals, current_turn, episode_start_turn):
    """Choose a deterministic SHADOW candidate; never execute any action.

    The caller must supply the current episode start turn; old-episode
    proofs are invalid even if game, level and scene match.
    A witnessed object-scene reversal is only a necessary *observational*
    gate; latent state may differ even if the visible object scene returns.
    """
    before = tuple(sorted(tuple(obj) for obj in before))
    absolute = donor_rules(witnesses, target_game, "absolute")
    relative = donor_rules(witnesses, target_game, "relative")
    for action in sorted(set(legal_actions)):
        if not isinstance(action, str) or action == "RESET":
            continue
        if not _matching_reversal(observed_reversals, target_game, level,
                                  action, before, current_turn,
                                  episode_start_turn):
            continue
        forecasts = _worlds(before, level, action, absolute, relative)
        if forecasts is not None:
            return dict(status="SHADOW_CANDIDATE_ONLY", action=action,
                        forecasts=forecasts,
                        evidence="two_other_donor_games_per_model_and_prior_observed_reversal",
                        action_executed=False)
    return dict(status="ABSTAIN", action=None, forecasts=None,
                action_executed=False)


def audit_frozen_public(records):
    """Prequential target-episode reversal gate on previously seen PUBLIC rows.

    Only the actually observed action is inspected as a possible probe,
    not invented alternative legal actions. Donors exclude the target game
    but may be globally later: this is a readiness diagnostic, not a
    prospective intervention or independent holdout.
    """
    grouped, frozen = _bounded_rows(records)
    witnesses = _witnesses(grouped)
    per_game = {}
    total = dict(same_level=0, observed_reversal_proofs=0,
                 supported_three_world_disagreements=0,
                 eligible_shadow_candidates=0)
    for game in FROZEN_GAMES:
        absolute = donor_rules(witnesses, game, "absolute")
        relative = donor_rules(witnesses, game, "relative")
        observed, prior = [], None
        episode_start_turn = 0
        last_level, last_turn = None, -1
        stats = dict(same_level=0, observed_reversal_proofs=0,
                     supported_three_world_disagreements=0,
                     eligible_shadow_candidates=0)
        for row in grouped[game]:
            level, turn, action = row["level_before"], row["turn"], row["action_key"]
            if level != last_level or turn != last_turn + 1:
                observed, prior = [], None
                episode_start_turn = turn
            last_level, last_turn = level, turn
            if action == "RESET" or row["level_after"] != level:
                observed, prior = [], None
                episode_start_turn = turn + 1
                if row["level_after"] != level:
                    last_level = row["level_after"]
                continue
            before = _scene(row["before_scene"])
            after = _scene(row["after_scene"])
            stats["same_level"] += 1
            stats["supported_three_world_disagreements"] += int(
                _worlds(before, level, action, absolute, relative) is not None)
            decision = propose_probe(before, level, game, (action,), witnesses,
                                     observed, current_turn=turn,
                                     episode_start_turn=episode_start_turn)
            stats["eligible_shadow_candidates"] += int(
                decision["status"] == "SHADOW_CANDIDATE_ONLY")
            # Learn the current outcome only AFTER scoring this opportunity.
            if (prior is not None and prior["after"] == before and
                    prior["before"] == after and before != after):
                observed.append(dict(game=game, level=level,
                                     action=prior["action"], before=prior["before"],
                                     middle=prior["after"], restored=after,
                                     inverse_action=action,
                                     start_turn=prior["turn"],
                                     restored_turn=turn))
                stats["observed_reversal_proofs"] += 1
            prior = dict(before=before, after=after, action=action, turn=turn)
        if stats["same_level"] != frozen["per_game"][game]["same_level_records"]:
            raise AssertionError("frozen matched-turn control drift")
        per_game[game] = stats
        for key, value in stats.items():
            total[key] += value
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                hypotheses=["H0_static", "H1_absolute", "H2_anchor_relative"],
                witness_count=len(witnesses), per_game=per_game, total=total,
                effect_on_agent="NONE_SHADOW_ONLY",
                acceptance="DIAGNOSTIC_ONLY_NO_POLICY_PROMOTION",
                caveat=("Reused PUBLIC traces, no new independent evidence. "
                        "Donor games may be globally later. Object-scene "
                        "reversal does not guarantee latent-state reversibility. "
                        "Only observed actions audited; no action executed, "
                        "no hidden score or Kaggle submission."))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: counterfactual_probe_readiness.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as f:
        print(json.dumps(audit_frozen_public(
            json.loads(line) for line in f if line.strip()), sort_keys=True))


if __name__ == "__main__":
    main()
