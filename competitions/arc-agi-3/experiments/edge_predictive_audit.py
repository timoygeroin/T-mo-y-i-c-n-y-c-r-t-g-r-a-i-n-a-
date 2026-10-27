"""Shadow-only, chronological predictive audit of edge-only public ARC observations.

At step t, use only the observed transition at t-1 and earlier *labeled*
within-game/level pairs to predict two binary outcomes at t: whether the
object scene changes and whether a level is completed. This tests association,
not causal relevance. No policy import, no cross-game transfer or hidden data.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

TRACE_SCHEMA = 'arc-agi3.shadow-transition.v1'
SPATIAL_SCHEMA = 'arc-agi3.spatial-delta.v1'


def _validate(row):
    if not isinstance(row, dict) or row.get('schema') != TRACE_SCHEMA:
        raise ValueError('invalid public transition')
    if not isinstance(row.get('game_id'), str) or not row['game_id']:
        raise ValueError('invalid game id')
    for key in ('turn', 'level_before', 'level_after', 'pixel_changes'):
        if type(row.get(key)) is not int or row[key] < 0:
            raise ValueError('invalid '+key)
    for key in ('before_scene', 'after_scene'):
        scene = row.get(key)
        if not isinstance(scene, list) or any(
                not isinstance(obj, list) or len(obj) != 6 or
                any(type(v) is not int for v in obj) for obj in scene):
            raise ValueError('invalid object scene')
    spatial = row.get('spatial_delta')
    if not isinstance(spatial, dict) or spatial.get('schema') != SPATIAL_SCHEMA:
        raise ValueError('missing spatial evidence')
    if any(spatial.get(k) != v for k,v in (
            ('height',64),('width',64),('edge_band',8),('tile_size',8))):
        raise ValueError('spatial geometry drift')
    counts = [spatial.get(k) for k in ('total_changes','border_changes','interior_changes')]
    if any(type(n) is not int or n < 0 for n in counts):
        raise ValueError('invalid spatial counts')
    total,border,interior = counts
    if total != row['pixel_changes'] or total != border+interior or total > 4096:
        raise ValueError('inconsistent spatial counts')
    if row['level_after'] < row['level_before']:
        raise ValueError('decreasing level')


def _edge_alias(row):
    return (row['level_before'] == row['level_after'] and
            row['before_scene'] == row['after_scene'] and
            row['spatial_delta']['border_changes'] > 0 and
            row['spatial_delta']['interior_changes'] == 0)


def _target(row):
    return (int(row['before_scene'] != row['after_scene']),
            int(row['level_after'] > row['level_before']))


def _laplace(positive, count):
    return (positive+1)/(count+2)


def score_steps(records, max_records=4096):
    """Yield prequential matched predictions; never update with current label first."""
    if type(max_records) is not int or not 1 <= max_records <= 100000:
        raise ValueError('invalid max_records')
    rows=[]
    seen=0
    previous=None
    current_game=None
    last_turn=-1
    counts={}
    for row in records:
        if seen >= max_records:
            raise ValueError('record limit exceeded')
        seen+=1
        _validate(row)
        game,turn=row['game_id'],row['turn']
        if game == current_game and turn <= last_turn:
            raise ValueError('unordered turns')
        if row.get('action_key') == 'RESET':
            # Never predict or train across a full environment restart.
            previous = None
            counts = {}
            current_game = game
            last_turn = turn
            continue
        contiguous=(previous is not None and game == current_game and
                    turn == last_turn+1 and
                    previous['level_before'] == previous['level_after'] == row['level_before'])
        if not contiguous:
            counts={}
        if contiguous:
            edge=int(_edge_alias(previous))
            actual=_target(row)
            past=_target(previous)
            pred={'game_id':game,'turn':turn,'prior_edge_alias':edge,
                  'actual_scene':actual[0],'actual_progress':actual[1]}
            for idx,name in enumerate(('scene','progress')):
                n=sum(c[0] for c in counts.values())
                y=sum(c[1][idx] for c in counts.values())
                group=counts.get(edge,(0,[0,0]))
                pred['marginal_'+name]=_laplace(y,n)
                pred['edge_'+name]=(_laplace(group[1][idx],group[0])
                                    if group[0] else pred['marginal_'+name])
                pred['temporal_'+name]=past[idx]
                pred['static_'+name]=0.0
            rows.append(pred)
            group=counts.setdefault(edge,[0,[0,0]])
            group[0]+=1
            group[1][0]+=actual[0]
            group[1][1]+=actual[1]
        previous=row if row['level_before']==row['level_after'] else None
        current_game=game
        last_turn=turn
    return rows


def evaluate(records,max_records=4096):
    steps=score_steps(records,max_records)
    brier={}
    for target in ('scene_change','level_advance'):
        suffix='scene' if target=='scene_change' else 'progress'
        brier[target]={}
        for model in ('edge','marginal','temporal','static'):
            brier[target][model]=(sum((s[model+'_'+suffix]-s['actual_'+suffix])**2
                                      for s in steps)/len(steps) if steps else None)
    return {'schema':'arc-agi3.edge-prequential.v1',
            'evaluated_pairs':len(steps),
            'prior_edge_alias_pairs':sum(s['prior_edge_alias'] for s in steps),
            'scene_change_events':sum(s['actual_scene'] for s in steps),
            'level_advance_events':sum(s['actual_progress'] for s in steps),
            'brier':brier,'effect_on_agent':'NONE_SHADOW_ONLY',
            'claim':'chronological_public_association_not_causal_or_kaggle_score'}


def main():
    if len(sys.argv)!=2:
        raise SystemExit('Usage: edge_predictive_audit.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as f:
        print(json.dumps(evaluate(json.loads(line) for line in f if line.strip()),sort_keys=True))

if __name__=='__main__':
    main()
