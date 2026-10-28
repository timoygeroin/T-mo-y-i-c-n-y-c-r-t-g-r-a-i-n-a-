"""Precommitted, outcome-blind, PUBLIC ARC-AGI-3 donor probe.

The sample and legal-action-only schedule are frozen in Git BEFORE the
new public episodes run. This does not produce a hidden holdout, policy gain,
causal identification, or Kaggle submission. Other-game donors are restricted
to strictly earlier completed games in the frozen collection order.
"""
from __future__ import annotations

from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys

from disjoint_public_sample import PUBLIC_GAME_IDS

PROTOCOL = "arc-agi3.outcome-blind-public-probe-v1"
SEED = "mondayid-arc3-independent-actions-20261028-v1:"
SAMPLE_SIZE = 9
HORIZON = 24
ACTION_CYCLE = ("ACTION1", "ACTION2", "ACTION3", "ACTION4", "ACTION5", "ACTION6")
CLICK_POINTS = ((16, 16), (48, 16), (16, 48), (48, 48))
POLICY = "outcome_blind_cycle_v1"


def select_probe_games(public_game_ids=PUBLIC_GAME_IDS):
    if (not isinstance(public_game_ids, (tuple, list)) or
            len(public_game_ids) != len(PUBLIC_GAME_IDS) or
            len(set(public_game_ids)) != len(PUBLIC_GAME_IDS) or
            any(not isinstance(g, str) for g in public_game_ids) or
            set(public_game_ids) != set(PUBLIC_GAME_IDS)):
        raise ValueError("public roster drift: abort frozen probe")
    return tuple(sorted(
        public_game_ids,
        key=lambda g: (sha256((SEED + g).encode("ascii")).hexdigest(), g)
    )[:SAMPLE_SIZE])


def choose_probe_action(turn, legal_actions):
    """Only the turn number and advertised legal set may affect an action."""
    if type(turn) is not int or not 0 <= turn < HORIZON:
        raise ValueError("invalid bounded turn")
    if (not isinstance(legal_actions, (tuple, list)) or
            any(not isinstance(a, str) or
                a not in ACTION_CYCLE + ("ACTION7",) for a in legal_actions) or
            len(legal_actions) != len(set(legal_actions))):
        raise ValueError("invalid legal action set")
    allowed = set(legal_actions)
    for offset in range(len(ACTION_CYCLE)):
        action = ACTION_CYCLE[(turn + offset) % len(ACTION_CYCLE)]
        if action in allowed:
            click = CLICK_POINTS[(turn // len(ACTION_CYCLE)) % len(CLICK_POINTS)] if action == "ACTION6" else None
            return action, click
    return None


def _canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def probe_manifest():
    plan = dict(
        sample=list(select_probe_games()), seed=SEED, horizon=HORIZON,
        action_cycle=list(ACTION_CYCLE),
        click_points=[list(xy) for xy in CLICK_POINTS],
        fallback="next_cyclic_advertised_action_only",
        policy=POLICY,
        episode="new_local_public_env_per_game",
        no_game_specific_action_policy=True,
        action_inputs="turn_and_advertised_legal_only",
    )
    digest = sha256(_canonical(dict(protocol=PROTOCOL, plan=plan)).encode("ascii")).hexdigest()
    return dict(protocol=PROTOCOL, horizon=HORIZON, plan=plan, sha256=digest)


def audit_probe_trace(records):
    """Validate provenance/schedule, then score H0/H1/H2 using prior games only."""
    from conditional_world_conflict_audit import _witnesses
    from relational_world_factorization import (HYPOTHESES, _evaluate_target,
                                                 donor_rules)
    games = select_probe_games()
    manifest = probe_manifest()
    grouped = {g: [] for g in games}
    current = 0
    count = 0
    for row in records:
        count += 1
        if count > SAMPLE_SIZE * HORIZON or not isinstance(row, dict):
            raise ValueError("probe exceeded bounded record budget")
        game = row.get("game_id")
        if current >= len(games) or game != games[current]:
            if (current + 1 >= len(games) or game != games[current+1] or
                    not grouped[games[current]]):
                raise ValueError("non-precommitted game order")
            current += 1
        turn = row.get("turn")
        if type(turn) is not int or turn != len(grouped[game]) or turn >= HORIZON:
            raise ValueError("noncontiguous or unbounded turn")
        if (row.get("schema") != "arc-agi3.shadow-transition.v1" or
                row.get("collection_policy") != POLICY or
                row.get("plan_sha256") != manifest["sha256"]):
            raise ValueError("trace does not match prior committed protocol")
        legal = row.get("legal_actions")
        expected = choose_probe_action(turn, legal)
        pre_state = row.get("pre_state")
        action = row.get("action_key")
        if pre_state in ("NOT_PLAYED", "GAME_OVER"):
            if action != "RESET":
                raise ValueError("reset required by public game state")
        elif pre_state == "WIN":
            raise ValueError("cannot continue a won episode")
        elif not isinstance(pre_state, str) or not pre_state:
            raise ValueError("missing public game state")
        else:
            if expected is None:
                raise ValueError("no scheduled legal action")
            name, xy = expected
            exact = f"{name}@{xy[0]},{xy[1]}" if xy is not None else name
            if action != exact:
                raise ValueError("outcome-conditioned or off-schedule action")
        if type(row.get("level_before")) is not int or type(row.get("level_after")) is not int:
            raise ValueError("missing public level fields")
        if not isinstance(row.get("before_scene"), list) or not isinstance(row.get("after_scene"), list):
            raise ValueError("missing public visible-scene evidence")
        grouped[game].append(row)
    if current != SAMPLE_SIZE - 1 or any(not grouped[g] for g in games):
        raise ValueError("incomplete preregistered public sample")

    # Construct witnesses for reporting; donor_rules independently excludes
    # target and all future games, including their conflicting/static vetoes.
    witnesses = _witnesses(grouped)
    totals = defaultdict(int)
    per_game = {}
    for i, game in enumerate(games):
        eligible = frozenset(games[:i])
        rules = {h: donor_rules(witnesses, game, h, eligible) for h in HYPOTHESES}
        result = _evaluate_target(grouped[game], rules)
        per_game[game] = dict(**result, prior_games=list(games[:i]),
                              donor_rules={h: len(rules[h]) for h in HYPOTHESES})
        for key, value in result.items():
            if type(value) is int:
                totals[key] += value
    return dict(protocol=PROTOCOL, plan_sha256=manifest["sha256"],
                games=list(games), records=count, horizon=HORIZON,
                witness_count=len(witnesses), per_game=per_game,
                strict_prior=dict(
                    baseline_correct=totals["baseline_correct"],
                    absolute_correct=totals["absolute_correct"],
                    relative_correct=totals["relative_correct"],
                    absolute_forecasts=totals["absolute_forecasts"],
                    relative_forecasts=totals["relative_forecasts"],
                    absolute_delta=totals["absolute_delta"],
                    relative_delta=totals["relative_delta"],
                    same_level=totals["same_level"],
                    level_advances=totals["level_advances"]),
                policy_integration="REJECTED_UNLESS_SEPARATE_MATCHED_EVIDENCE",
                effect_on_agent="NONE_SHADOW_ONLY",
                interpretation="NEW_PUBLIC_ACTION_TRAJECTORIES_NOT_HIDDEN_HOLDOUT_OR_CAUSAL_PROOF")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prospective_probe_schedule.py PUBLIC_PROBE_TRACE.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as f:
        print(json.dumps(audit_probe_trace(json.loads(x) for x in f if x.strip()),
                         sort_keys=True))


if __name__ == "__main__":
    main()
