"""Read-only ARC public trace: counterfactual edge-vs-action predictive controls.

All models predict the next observed transition using only prior labeled
transitions in the same game and level. Action identity is known before its
outcome; prior edge alias is observed at t-1. No policy or Kaggle interaction.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from edge_predictive_audit import _validate, _edge_alias, _target, _laplace

MODELS = ('action_edge', 'action_only', 'edge_only', 'marginal', 'temporal', 'static')


def score_steps(records, max_records=4096):
    if type(max_records) is not int or not 1 <= max_records <= 100000:
        raise ValueError('invalid max_records')
    steps = []
    previous = None
    current_game = None
    last_turn = -1
    episode = 0
    counts = {}
    total = [0, 0, 0]
    for index, row in enumerate(records):
        if index >= max_records:
            raise ValueError('record limit exceeded')
        _validate(row)
        action = row.get('action_key')
        if not isinstance(action, str) or not action or len(action) > 128:
            raise ValueError('missing or invalid action identity')
        game, turn = row['game_id'], row['turn']
        if game == current_game and turn <= last_turn:
            raise ValueError('unordered turns')
        if action == 'RESET':
            # RESET is not a legal game action; exclude it from prediction
            # and reset all within-episode evidence before the next move.
            previous = None
            counts = {}
            total = [0, 0, 0]
            current_game = game
            last_turn = turn
            continue
        contiguous = (previous is not None and game == current_game and
                      turn == last_turn + 1 and
                      previous['level_before'] == previous['level_after'] == row['level_before'])
        if not contiguous:
            counts = {}
            total = [0, 0, 0]
            episode += 1
        if contiguous:
            edge = int(_edge_alias(previous))
            actual = _target(row)
            past = _target(previous)
            action_group = counts.get(('action', action), [0, 0, 0])
            joint_group = counts.get(('joint', action, edge), [0, 0, 0])
            edge_group = counts.get(('edge', edge), [0, 0, 0])
            pred = {'game_id':game, 'level_before':row['level_before'],
                    'turn':turn, 'episode':episode,
                    'seen_action':action_group[0] > 0,
                    'seen_action_edge':joint_group[0] > 0,
                    'prior_edge_alias':edge,
                    'actual_scene':actual[0], 'actual_progress':actual[1]}
            for idx, target in enumerate(('scene', 'progress'), start=1):
                marginal = _laplace(total[idx], total[0])
                action_only = (_laplace(action_group[idx], action_group[0])
                               if action_group[0] else marginal)
                pred['marginal_'+target] = marginal
                pred['action_only_'+target] = action_only
                pred['action_edge_'+target] = (
                    _laplace(joint_group[idx], joint_group[0])
                    if joint_group[0] else action_only)
                pred['edge_only_'+target] = (
                    _laplace(edge_group[idx], edge_group[0])
                    if edge_group[0] else marginal)
                pred['temporal_'+target] = past[idx-1]
                pred['static_'+target] = 0.0
            steps.append(pred)
            total[0] += 1
            total[1] += actual[0]
            total[2] += actual[1]
            for key in (('action', action), ('joint', action, edge), ('edge', edge)):
                group = counts.setdefault(key, [0, 0, 0])
                group[0] += 1
                group[1] += actual[0]
                group[2] += actual[1]
        previous = row if row['level_before'] == row['level_after'] else None
        current_game = game
        last_turn = turn
    return steps


def evaluate(records, max_records=4096):
    steps = score_steps(records, max_records)
    brier = {}
    for target, suffix in (('scene_change','scene'),('level_advance','progress')):
        brier[target] = {
            model: (sum((s[model+'_'+suffix]-s['actual_'+suffix])**2
                        for s in steps)/len(steps) if steps else None)
            for model in MODELS}
    episodes = {}
    for s in steps:
        group = episodes.setdefault(s['episode'], {'game_id':s['game_id'],
                                  'level':s['level_before'], 'n':0,
                                  'edge_minus_marginal':0.,
                                  'joint_minus_action':0.,
                                  'action_minus_marginal':0.})
        actual = s['actual_scene']
        loss = lambda model: (s[model+'_scene']-actual)**2
        group['n'] += 1
        group['edge_minus_marginal'] += loss('edge_only')-loss('marginal')
        group['joint_minus_action'] += loss('action_edge')-loss('action_only')
        group['action_minus_marginal'] += loss('action_only')-loss('marginal')
    per_episode = []
    for _, g in sorted(episodes.items()):
        per_episode.append({**g,
            'edge_minus_marginal':g['edge_minus_marginal']/g['n'],
            'joint_minus_action':g['joint_minus_action']/g['n'],
            'action_minus_marginal':g['action_minus_marginal']/g['n']})
    return {'schema':'arc-agi3.action-conditional-prequential.v1',
            'evaluated_pairs':len(steps), 'episode_count':len(per_episode),
            'prior_edge_alias_pairs':sum(s['prior_edge_alias'] for s in steps),
            'seen_action_pairs':sum(s['seen_action'] for s in steps),
            'seen_joint_pairs':sum(s['seen_action_edge'] for s in steps),
            'scene_change_events':sum(s['actual_scene'] for s in steps),
            'level_advance_events':sum(s['actual_progress'] for s in steps),
            'brier':brier, 'scene_episode_deltas':per_episode,
            'effect_on_agent':'NONE_SHADOW_ONLY',
            'claim':'same-public-trace-action-conditional-falsification-not-held-out-or-causal'}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: action_conditioned_audit.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as f:
        print(json.dumps(evaluate(json.loads(line) for line in f if line.strip()),sort_keys=True))

if __name__ == '__main__':
    main()
