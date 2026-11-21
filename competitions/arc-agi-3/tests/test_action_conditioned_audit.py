import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from action_conditioned_audit import evaluate, score_steps


def row(game, turn, action='ACTION1', scene_change=False, edge=False, progress=False, level=0):
    before = [[1, 1, 1, 1, 1, 1]]
    after = [[2, 1, 1, 1, 1, 1]] if scene_change else before
    return {'schema':'arc-agi3.shadow-transition.v1','game_id':game,'turn':turn,
            'action_key':action,'level_before':level,'level_after':level+int(progress),
            'before_scene':before,'after_scene':after,
            'pixel_changes':int(edge)+int(scene_change),
            'spatial_delta':{'schema':'arc-agi3.spatial-delta.v1','height':64,'width':64,
              'edge_band':8,'tile_size':8,'total_changes':int(edge)+int(scene_change),
              'border_changes':int(edge),'interior_changes':int(scene_change)}}

class ActionConditionedAuditTest(unittest.TestCase):
    def test_no_future_leakage(self):
        a=[row('a',0,edge=True),row('a',1,scene_change=True),row('a',2),row('a',3)]
        b=a[:-1]+[row('a',3,scene_change=True)]
        pa=score_steps(a);pb=score_steps(b)
        for name in ('action_edge_scene','action_only_scene','edge_only_scene','marginal_scene'):
            self.assertEqual([x[name] for x in pa],[x[name] for x in pb])
    def test_action_only_uses_prior_action(self):
        rows=[row('a',0),row('a',1,'ACTION1',scene_change=True),row('a',2,'ACTION2'),
              row('a',3,'ACTION1',scene_change=True),row('a',4,'ACTION2')]
        p=score_steps(rows)
        self.assertGreater(p[2]['action_only_scene'],p[2]['marginal_scene'])
        self.assertLess(p[3]['action_only_scene'],p[3]['marginal_scene'])
    def test_joint_unseen_falls_back_to_action(self):
        rows=[row('a',0),row('a',1,'ACTION1',scene_change=True),row('a',2,edge=True),
              row('a',3,'ACTION1')]
        p=score_steps(rows)[-1]
        self.assertEqual(p['action_edge_scene'],p['action_only_scene'])
        self.assertFalse(p['seen_action_edge'])
        self.assertTrue(p['seen_action'])
    def test_joint_prior_support_changes_prediction(self):
        rows=[row('a',0,edge=True),row('a',1,'ACTION1',scene_change=True),
              row('a',2),row('a',3,'ACTION1'),row('a',4,edge=True),row('a',5,'ACTION1')]
        p=score_steps(rows)[-1]
        self.assertTrue(p['seen_action_edge'])
        self.assertNotEqual(p['action_edge_scene'],p['action_only_scene'])
    def test_game_and_level_reset(self):
        rows=[row('a',0),row('a',1,scene_change=True),row('a',2,progress=True),
              row('a',3,level=1),row('a',4,level=1),row('b',0),row('b',1)]
        p=score_steps(rows)
        self.assertEqual([s['turn'] for s in p],[1,2,4,1])
        self.assertFalse(p[2]['seen_action'])
        self.assertFalse(p[3]['seen_action'])
    def test_action6_clicks_not_pooled(self):
        rows=[row('a',0),row('a',1,'ACTION6@1,1',scene_change=True),
              row('a',2,'ACTION6@2,2'),row('a',3,'ACTION6@1,1')]
        p=score_steps(rows)
        self.assertFalse(p[1]['seen_action'])
        self.assertTrue(p[2]['seen_action'])
    def test_controls_same_denominator(self):
        out=evaluate([row('a',i,action='ACTION'+str(i%2+1),scene_change=i%2==0,edge=i%3==0) for i in range(8)])
        self.assertEqual(out['evaluated_pairs'],7)
        for target in ('scene_change','level_advance'):
            for model in ('action_edge','action_only','edge_only','marginal','temporal','static'):
                self.assertIsInstance(out['brier'][target][model],float)
    def test_no_future_label_in_current_prediction(self):
        a=[row('a',0),row('a',1,scene_change=True),row('a',2)]
        b=a[:-1]+[row('a',2,scene_change=True)]
        self.assertEqual(score_steps(a)[-1]['action_only_scene'],score_steps(b)[-1]['action_only_scene'])
    def test_reject_missing_action_identity(self):
        r=row('a',1);del r['action_key']
        with self.assertRaises(ValueError):score_steps([row('a',0),r])
    def test_reject_unordered_turns(self):
        with self.assertRaises(ValueError):score_steps([row('a',0),row('a',0)])
    def test_bounded_records(self):
        with self.assertRaises(ValueError):score_steps([row('a',0),row('a',1)],max_records=1)
    def test_shadow_only(self):
        out=evaluate([row('a',0),row('a',1)])
        self.assertEqual(out['effect_on_agent'],'NONE_SHADOW_ONLY')
        self.assertEqual(out['evaluated_pairs'],1)
        self.assertEqual(out['episode_count'],1)
    def test_previous_edge_model_reproduced(self):
        from edge_predictive_audit import score_steps as old_score_steps
        rows=[row('a',i,action='ACTION'+str(i%2+1),scene_change=i%2==0,edge=i%3==0) for i in range(9)]
        for new,old in zip(score_steps(rows),old_score_steps(rows)):
            for name in ('edge','marginal','temporal','static'):
                for target in ('scene','progress'):
                    self.assertEqual(new[('edge_only' if name=='edge' else name)+'_'+target],old[name+'_'+target])

if __name__=='__main__':unittest.main()
