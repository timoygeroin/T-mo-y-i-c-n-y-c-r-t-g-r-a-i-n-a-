"""Pre-registered, outcome-blind public-game sample for spatial shadow audit.

The roster was read from the official 25-game public make list-games output
in CI run 40431333881 before this experiment. SHA-256 ordering with a frozen
seed selects six games other than ls20/vc33, independent of score or pixels.
The selected games are public disjoint replication, NOT hidden holdout.
"""
from __future__ import annotations

from hashlib import sha256

PUBLIC_GAME_IDS = (
    'vc33', 'ls20', 're86', 'cn04', 'tn36', 'r11l', 'sc25', 'cd82',
    'lp85', 'sb26', 'ft09', 'tu93', 's5i5', 'm0r0', 'lf52', 'wa30',
    'tr87', 'ar25', 'g50t', 'su15', 'ka59', 'sp80', 'dc22', 'bp35', 'sk48',
)
PRIOR_DIAGNOSTIC_GAMES = ('ls20', 'vc33')
SAMPLE_SEED = 'mondayid-arc3-spatial-v1:'
SAMPLE_SIZE = 6


def select_disjoint_games(public_game_ids=PUBLIC_GAME_IDS) -> tuple[str, ...]:
    """Return fixed, pre-registered sample; fail closed if public roster drifts."""
    if (not isinstance(public_game_ids, (list, tuple)) or
            len(public_game_ids) != len(PUBLIC_GAME_IDS) or
            any(not isinstance(g, str) for g in public_game_ids) or
            len(set(public_game_ids)) != len(PUBLIC_GAME_IDS) or
            set(public_game_ids) != set(PUBLIC_GAME_IDS)):
        raise ValueError('public game roster changed; sample cannot silently drift')
    eligible = set(public_game_ids) - set(PRIOR_DIAGNOSTIC_GAMES)
    return tuple(sorted(
        eligible,
        key=lambda game: (sha256((SAMPLE_SEED + game).encode('ascii')).hexdigest(), game),
    )[:SAMPLE_SIZE])
