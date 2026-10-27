"""Shadow-only action-effect coverage and strict prequential replay contracts."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from effect_coverage_audit import classify, evaluate


def obj(color, x, y, area=1):
    return [color, area, x, y, x, y]


def row(game, turn, before, after, action='ACTION1', lb=0, la=None, legal=None):
    return dict(schema='arc-agi3.shadow-transition.v1', game_id=game, turn=turn,
                action_key=action, legal_actions=legal or ['ACTION1', 'ACTION2', 'ACTION6'],
                level_before=lb, level_after=lb if la is None else la,
                before_scene=before, after_scene=after)


class EffectCoverageTests(unittest.TestCase):
    def setUp(self):
        self.a = [obj(2, 3, 4), obj(5, 8, 9)]
        self.b = [obj(2, 4, 4), obj(5, 9, 9)]
        self.c = [obj(2, 4, 4), obj(5, 8, 9)]

    def test_static_global_and_partial_translation(self):
        self.assertEqual(classify(self.a, self.a), 'static')
        self.assertEqual(classify(self.a, self.b), 'global_translate')
        self.assertEqual(classify(self.a, self.c), 'single_object_translate')

    def test_global_and_partial_recolor(self):
        a = [obj(2, 3, 4), obj(2, 8, 9)]
        b = [obj(7, 3, 4), obj(7, 8, 9)]
        c = [obj(7, 3, 4), obj(2, 8, 9)]
        self.assertEqual(classify(a, b), 'global_recolor')
        self.assertEqual(classify(a, c), 'single_object_recolor')

    def test_count_change_and_unexplained(self):
        self.assertEqual(classify(self.a, [self.a[0]]), 'object_count_change')
        self.assertEqual(classify(self.a, [obj(7, 10, 10), obj(8, 13, 13)]), 'unexplained')

    def test_no_future_leakage(self):
        r = [row('g', 0, self.a, self.c), row('g', 1, self.a, self.c)]
        self.assertEqual(evaluate(r[:1])['replay_evaluated'], 0)
        v = evaluate(r)
        self.assertEqual(v['replay_evaluated'], 1)
        self.assertEqual(v['replay_correct'], 1)
        self.assertEqual(v['static_on_replay_correct'], 0)
        self.assertEqual(v['replay_nonstatic'], 1)

    def test_conflicting_same_action_effect_is_not_assumed_deterministic(self):
        r = [row('g', 0, self.a, self.b), row('g', 1, self.a, self.c),
             row('g', 2, self.a, self.c)]
        v = evaluate(r)
        self.assertEqual(v['replay_evaluated'], 2)
        self.assertEqual(v['replay_ambiguous'], 1)
        self.assertEqual(v['replay_correct'], 0)

    def test_game_level_and_reset_boundaries(self):
        r = [row('g', 0, self.a, self.c), row('h', 0, self.a, self.c),
             row('h', 1, self.a, self.c, la=1), row('h', 2, self.a, self.c, lb=1),
             row('h', 3, self.a, self.a, action='RESET', legal=[]),
             row('h', 4, self.a, self.c, lb=1)]
        v = evaluate(r)
        self.assertEqual(v['replay_evaluated'], 0)
        self.assertEqual(v['reset_records'], 1)
        self.assertEqual(v['level_advance_records'], 1)

    def test_action6_coordinates_do_not_pool(self):
        r = [row('g', 0, self.a, self.c, 'ACTION6@1,2'),
             row('g', 1, self.a, self.c, 'ACTION6@8,9'),
             row('g', 2, self.a, self.c, 'ACTION6@1,2')]
        v = evaluate(r)
        self.assertEqual(v['replay_evaluated'], 1)

    def test_invalid_action_and_scene_rejected(self):
        with self.assertRaises(ValueError):
            evaluate([row('g', 0, self.a, self.c, 'ACTION9')])
        with self.assertRaises(ValueError):
            evaluate([row('g', 0, [[2, 1, 64, 0, 64, 0]], self.c)])

    def test_bounded_and_empty(self):
        self.assertEqual(evaluate([])['same_level_records'], 0)
        with self.assertRaises(ValueError):
            evaluate([row('g', 0, self.a, self.c)], max_records=0)
        with self.assertRaises(ValueError):
            evaluate([row('g', 0, self.a, self.c)]*2, max_records=1)

    def test_episode_discontinuity_resets_replay(self):
        r = [row('g', 0, self.a, self.c), row('g', 3, self.a, self.c)]
        self.assertEqual(evaluate(r)['replay_evaluated'], 0)


if __name__ == '__main__':
    unittest.main()
