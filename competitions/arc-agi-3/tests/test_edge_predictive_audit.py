import unittest
from edge_predictive_audit import evaluate, score_steps


def row(game, turn, scene_change=False, edge=False, progress=False, level=0):
    before = [[1, 1, 1, 1, 1, 1]]
    after = [[2, 1, 1, 1, 1, 1]] if scene_change else before
    return {'schema':'arc-agi3.shadow-transition.v1', 'game_id':game,'turn':turn,
            'level_before':level,'level_after':level+int(progress),
            'before_scene':before,'after_scene':after,
            'pixel_changes':1 if edge or scene_change else 0,
            'spatial_delta':{'schema':'arc-agi3.spatial-delta.v1','height':64,'width':64,
              'edge_band':8,'tile_size':8,'total_changes':1 if edge or scene_change else 0,
              'border_changes':int(edge),'interior_changes':int(scene_change),
              'changed_tiles':[[0,0,1]] if edge else ([[2,2,1]] if scene_change else [])}}

class AuditTest(unittest.TestCase):
    def test_no_cross_game_training(self):
        rows=[row('a',i,scene_change=True) for i in range(5)]+[row('b',0),row('b',1)]
        steps=score_steps(rows)
        self.assertEqual(len(steps),5)
        self.assertEqual(steps[-1]['marginal_scene'],.5)
    def test_no_future_leakage(self):
        a=[row('a',0,edge=True),row('a',1,scene_change=True),row('a',2,edge=True),row('a',3)]
        b=a[:-1]+[row('a',3,scene_change=True)]
        self.assertEqual([s['edge_scene'] for s in score_steps(a)], [s['edge_scene'] for s in score_steps(b)])
    def test_same_level_and_contiguous_only(self):
        rows=[row('a',0),row('a',1),row('a',2,progress=True),row('a',3,level=1),row('a',5,level=1),row('a',6,level=1)]
        self.assertEqual([s['turn'] for s in score_steps(rows)], [1,2,6])
    def test_prior_edge_is_only_feature(self):
        rows=[row('a',0,edge=True),row('a',1,scene_change=True),row('a',2,edge=True),row('a',3,scene_change=True),row('a',4,edge=True),row('a',5)]
        steps=score_steps(rows)
        self.assertEqual(steps[0]['edge_scene'],.5)
        self.assertEqual(steps[2]['edge_scene'],2/3)
        self.assertEqual(steps[4]['edge_scene'],3/4)
    def test_no_edge_support_falls_back_to_marginal(self):
        steps=score_steps([row('a',0),row('a',1,scene_change=True),row('a',2,edge=True),row('a',3)])
        self.assertEqual(steps[-1]['edge_scene'],steps[-1]['marginal_scene'])
    def test_all_controls_same_denominator(self):
        out=evaluate([row('a',i,scene_change=(i%2==0),edge=(i%2==1)) for i in range(6)])
        self.assertEqual(out['evaluated_pairs'],5)
        for target in ('scene_change','level_advance'):
            for method in ('edge','marginal','temporal','static'):
                self.assertIn(method,out['brier'][target])
    def test_reject_invalid_geometry(self):
        r=row('a',0,edge=True);r['spatial_delta']['interior_changes']=1
        with self.assertRaises(ValueError): score_steps([r,row('a',1)])
    def test_reject_unordered_turns(self):
        with self.assertRaises(ValueError): score_steps([row('a',1),row('a',1)])
    def test_no_game_specific_features_or_policy_effect(self):
        out=evaluate([row('x',0),row('x',1)])
        self.assertEqual(out['effect_on_agent'],'NONE_SHADOW_ONLY')
        self.assertEqual(out['evaluated_pairs'],1)
    def test_max_record_bound(self):
        with self.assertRaises(ValueError): evaluate([row('x',0),row('x',1)],max_records=1)

if __name__=='__main__': unittest.main()
