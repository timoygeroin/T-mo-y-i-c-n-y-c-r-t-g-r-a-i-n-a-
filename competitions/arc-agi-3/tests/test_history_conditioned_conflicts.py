"""Test-first counterfactual: can PRE-action history separate donor static/motion conflicts?"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))

from history_conditioned_conflicts import (
    partition_history_conflicts, iter_context_rows, HYPOTHESES,
)

ROLE = ("square", "area_unranked", (1, 1))

def witness(game, effect, prev_action="ACTION1", prev_changed=True,
            action="ACTION3"):
    return dict(game=game, level=0, action=action, role=ROLE,
                effect=effect, prev_action=prev_action, prev_changed=prev_changed)

def row(turn, action="ACTION1", level=0, after_level=None, before=None, after=None):
    return dict(turn=turn, action_key=action, level_before=level,
                level_after=level if after_level is None else after_level,
                before_scene=[] if before is None else before,
                after_scene=[] if after is None else after)

class HistoryConditionedConflictTests(unittest.TestCase):
    def test_competing_prior_actions_resolve_only_with_two_donors_each(self):
        w = [witness("g1", (2, 0), "ACTION1"),
             witness("g2", (2, 0), "ACTION1"),
             witness("g3", (0, 0), "ACTION2"),
             witness("g4", (0, 0), "ACTION2")]
        r = partition_history_conflicts(w, "target", "exact", set(), "prev_action")
        self.assertEqual(r["mixed_keys"], 1)
        self.assertEqual(r["resolved"], 1)
        self.assertEqual(r["supported_moving_contexts"], 1)

    def test_single_game_static_context_is_insufficient_not_resolved(self):
        w = [witness("g1", (2, 0)), witness("g2", (2, 0)),
             witness("g3", (0, 0), "ACTION2")]
        r = partition_history_conflicts(w, "target", "exact", set(), "prev_action")
        self.assertEqual(r["insufficient_conditional_support"], 1)
        self.assertEqual(r["resolved"], 0)

    def test_same_context_contradiction_remains_unresolved(self):
        w = [witness("g1", (2, 0)), witness("g2", (0, 0))]
        r = partition_history_conflicts(w, "target", "exact", set(), "prev_action")
        self.assertEqual(r["still_conflicting"], 1)

    def test_target_outcome_excluded_before_partition(self):
        w = [witness("g1", (2, 0)), witness("g2", (0, 0)),
             witness("target", (0, 0), "ACTION2")]
        r = partition_history_conflicts(w, "target", "exact", set(), "prev_action")
        self.assertEqual(r["mixed_keys"], 1)
        self.assertEqual(r["still_conflicting"], 1)

    def test_click_coordinates_preserved_in_prior_action(self):
        w = [witness("g1", (2, 0), "ACTION6@1,2"),
             witness("g2", (2, 0), "ACTION6@1,2"),
             witness("g3", (0, 0), "ACTION6@7,8"),
             witness("g4", (0, 0), "ACTION6@7,8")]
        r = partition_history_conflicts(w, "target", "both", set(), "prev_action")
        self.assertEqual(r["resolved"], 1)

    def test_scene_change_context_can_resolve_independently(self):
        w = [witness("g1", (2, 0), prev_changed=True),
             witness("g2", (2, 0), prev_changed=True),
             witness("g3", (0, 0), prev_changed=False),
             witness("g4", (0, 0), prev_changed=False)]
        r = partition_history_conflicts(w, "target", "exact", set(), "prev_scene_changed")
        self.assertEqual(r["resolved"], 1)

    def test_joint_history_does_not_invent_support(self):
        w = [witness("g1", (2, 0), "ACTION1", True),
             witness("g2", (2, 0), "ACTION2", True),
             witness("g3", (0, 0), "ACTION1", False),
             witness("g4", (0, 0), "ACTION2", False)]
        r = partition_history_conflicts(w, "target", "exact", set(), "joint")
        self.assertEqual(r["resolved"], 0)
        self.assertEqual(r["insufficient_conditional_support"], 1)

    def test_reset_and_level_change_clear_prior_context(self):
        seq = [row(0, "ACTION1"), row(1, "RESET"), row(2, "ACTION2"),
               row(3, "ACTION3", after_level=1), row(4, "ACTION4", level=1)]
        contexts = list(iter_context_rows(seq))
        self.assertEqual([(x[1], x[2]) for x in contexts],
                         [("EPISODE_START", None), ("EPISODE_START", None),
                          ("EPISODE_START", None)])

    def test_turn_discontinuity_clears_history(self):
        seq = [row(0, "ACTION1"), row(2, "ACTION2")]
        contexts = list(iter_context_rows(seq))
        self.assertEqual([x[1] for x in contexts],
                         ["EPISODE_START", "EPISODE_START"])

    def test_previous_scene_change_is_observed_only_after_previous_turn(self):
        obj = [2, 1, 1, 1, 1, 1]
        seq = [row(0, "ACTION1", before=[], after=[obj]),
               row(1, "ACTION2", before=[obj], after=[obj]),
               row(2, "ACTION3", before=[obj], after=[])]
        contexts = list(iter_context_rows(seq))
        self.assertEqual([(x[1], x[2]) for x in contexts],
                         [("EPISODE_START", None), ("ACTION1", True),
                          ("ACTION2", False)])

    def test_invalid_hypothesis_fails_closed(self):
        self.assertEqual(len(HYPOTHESES), 3)
        with self.assertRaises(ValueError):
            partition_history_conflicts([], "target", "exact", set(), "oracle")

if __name__ == "__main__":
    unittest.main()
