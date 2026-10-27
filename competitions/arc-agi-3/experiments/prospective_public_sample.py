"""Outcome-blind preregistration of a longer ARC-AGI-3 public causal audit.

This protocol is frozen BEFORE prospective detailed traces are collected.
All 25 games are publicly known and already used in aggregate benchmarks;
this is a new detailed public-trace sample, NOT an independent hidden holdout.
Selection is independent of gameplay outcomes. No game-specific heuristics.
"""
from __future__ import annotations

from hashlib import sha256
from disjoint_public_sample import (PUBLIC_GAME_IDS, PRIOR_DIAGNOSTIC_GAMES,
                                    select_disjoint_games)

PROTOCOL_VERSION = 'arc-agi3.prospective-causal.v1'
SAMPLE_SEED = 'mondayid-arc3-prospective-causal-v1:'
SAMPLE_SIZE = 8
HORIZON = 96
ACCEPTANCE_GATES = {
    'min_progress_events': 3,
    'min_evaluated_pairs': 100,
    'min_seen_joint_fraction': 0.25,
    'require_nonregression_vs_action_only': True,
    'automatic_policy_promotion': False,
}


def select_prospective_games(public_game_ids=PUBLIC_GAME_IDS) -> tuple[str, ...]:
    """Deterministic eight-game sample; reject silent public roster changes."""
    if (not isinstance(public_game_ids, (tuple, list)) or
            len(public_game_ids) != len(PUBLIC_GAME_IDS) or
            any(not isinstance(g, str) for g in public_game_ids) or
            len(set(public_game_ids)) != len(PUBLIC_GAME_IDS) or
            set(public_game_ids) != set(PUBLIC_GAME_IDS)):
        raise ValueError('public roster changed; cannot silently change sample')
    excluded = set(PRIOR_DIAGNOSTIC_GAMES) | set(select_disjoint_games())
    eligible = set(public_game_ids) - excluded
    return tuple(sorted(
        eligible,
        key=lambda game: (sha256((SAMPLE_SEED + game).encode('ascii')).hexdigest(), game),
    )[:SAMPLE_SIZE])
