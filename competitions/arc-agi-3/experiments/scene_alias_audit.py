"""Read-only pixel-vs-object representation audit for ARC public traces.

Frame hashes and pixel deltas are evidence about *observations*, not hidden
world states. Scene aliasing may come from HUD, animation, occlusion or lost
object geometry; no claim of environment nondeterminism or policy gain.
Never imported by the submission agent.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Iterable

SCHEMA = 'arc-agi3.shadow-transition.v1'
SHA256 = re.compile(r'[0-9a-f]{64}\Z')


def _scene(value: object) -> tuple:
    if not isinstance(value, list):
        raise ValueError('scene must be list')
    result = []
    for item in value:
        if not isinstance(item, list) or len(item) != 6 or any(type(v) is not int for v in item):
            raise ValueError('invalid object descriptor')
        color, area, x0, y0, x1, y1 = item
        if not (0 <= color <= 255 and 1 <= area <= 4096 and
                0 <= x0 <= x1 < 64 and 0 <= y0 <= y1 < 64):
            raise ValueError('invalid object descriptor bounds')
        result.append(tuple(item))
    return tuple(sorted(result))


def evaluate_aliases(records: Iterable[dict], max_records: int = 4096) -> dict:
    """Count lost visual distinctions without making a causal-policy claim.

    Scope is one contiguous game episode and level. No cross-game/level
    transfer; ACTION6 is keyed by exact click coordinates.
    """
    if type(max_records) is not int or not 1 <= max_records <= 100000:
        raise ValueError('max_records must be 1..100000')
    stats = dict(records=0, same_level_records=0,
                 pixel_changed_scene_static=0, scene_changed_pixel_static=0,
                 scene_alias_groups=0, same_scene_action_conflicts=0)
    frames_by_scene: dict[tuple, set[str]] = {}
    outcomes_by_context: dict[tuple, set[tuple]] = {}
    game = None
    level = None
    last_turn = -1
    scope = 0
    for row in records:
        if stats['records'] >= max_records:
            raise ValueError('record limit exceeded')
        if not isinstance(row, dict) or row.get('schema') != SCHEMA:
            raise ValueError('invalid trace schema')
        gid, turn = row.get('game_id'), row.get('turn')
        lb, la = row.get('level_before'), row.get('level_after')
        action, legal = row.get('action_key'), row.get('legal_actions')
        if (not isinstance(gid, str) or not gid or type(turn) is not int or turn < 0 or
                type(lb) is not int or type(la) is not int or min(lb, la) < 0 or
                not isinstance(action, str) or not action or not isinstance(legal, list) or
                any(not isinstance(a, str) for a in legal)):
            raise ValueError('invalid game, turn, level, or action')
        base_action = action.split('@', 1)[0]
        if base_action not in legal or (base_action == 'ACTION6' and '@' not in action):
            raise ValueError('illegal action or missing click coordinates')
        before, after = _scene(row.get('before_scene')), _scene(row.get('after_scene'))
        bh, ah = row.get('before_frame_sha256'), row.get('after_frame_sha256')
        pixels = row.get('pixel_changes')
        if (not isinstance(bh, str) or not SHA256.fullmatch(bh) or
                not isinstance(ah, str) or not SHA256.fullmatch(ah) or
                type(pixels) is not int or not 0 <= pixels <= 4096):
            raise ValueError('missing or malformed pixel evidence')
        if (pixels == 0) != (bh == ah):
            raise ValueError('pixel delta and frame hashes disagree')
        if gid != game or turn <= last_turn or lb != level:
            scope += 1
        game, level, last_turn = gid, lb, turn
        stats['records'] += 1
        if lb != la:
            level = la
            scope += 1
            continue
        stats['same_level_records'] += 1
        stats['pixel_changed_scene_static'] += int(pixels > 0 and before == after)
        stats['scene_changed_pixel_static'] += int(pixels == 0 and before != after)
        for scene, digest in ((before, bh), (after, ah)):
            frames_by_scene.setdefault((scope, lb, scene), set()).add(digest)
        outcomes_by_context.setdefault((scope, lb, before, action), set()).add((after, ah))
    stats['scene_alias_groups'] = sum(len(v) > 1 for v in frames_by_scene.values())
    stats['same_scene_action_conflicts'] = sum(len(v) > 1 for v in outcomes_by_context.values())
    return {**stats,
            'effect_on_agent': 'NONE_SHADOW_ONLY',
            'claim': 'observational_diagnostic_not_hidden_state_or_nondeterminism'}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: scene_alias_audit.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as handle:
        print(json.dumps(evaluate_aliases(json.loads(line) for line in handle if line.strip()),
                         sort_keys=True))


if __name__ == '__main__':
    main()
