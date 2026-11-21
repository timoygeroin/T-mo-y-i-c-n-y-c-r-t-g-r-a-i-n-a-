"""Test-first: observable geometry may condition static vs moving donor effects."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))

from conditional_world_conflict_audit import feasibility, partition_conditional_conflicts

ROLE = ("square", "area_unranked", (1, 1))
OBJ = (2, 1, 5, 5, 5, 5)
ANCHOR = (9, 1, 20, 20, 20, 20)


def witness(game, effect, obj=OBJ, other=ANCHOR, action="ACTION1"):
    return dict(game=game, level=0, action=action, role=ROLE,
                obj=obj, before=(obj, other), effect=effect)


class ConditionalWorldConflictTests(unittest.TestCase):
    def test_counterfactual_boundary_and_collision_are_separate(self):
        at_edge = (2, 1, 63, 5, 63, 5)
        f = feasibility((at_edge, ANCHOR), at_edge, (2, 0))
        self.assertFalse(f["bounds"])
        self.assertFalse(f["clear"])
        blocked = (9, 1, 7, 5, 7, 5)
        f = feasibility((OBJ, blocked), OBJ, (2, 0))
        self.assertTrue(f["bounds"])
        self.assertFalse(f["clear"])

    def test_mixed_static_and_move_explained_by_boundary(self):
        edge = (2, 1, 63, 5, 63, 5)
        w = [witness("g1", (2, 0)), witness("g2", (0, 0), obj=edge)]
        r = partition_conditional_conflicts(w, "target", "exact", set())
        self.assertEqual(r["mixed_keys"], 1)
        self.assertEqual(r["boundary_explained"], 1)
        self.assertEqual(r["collision_explained"], 1)

    def test_collision_explains_when_boundary_does_not(self):
        blocked = (9, 1, 7, 5, 7, 5)
        w = [witness("g1", (2, 0)), witness("g2", (0, 0), other=blocked)]
        r = partition_conditional_conflicts(w, "target", "exact", set())
        self.assertEqual(r["boundary_explained"], 0)
        self.assertEqual(r["collision_explained"], 1)

    def test_unblocked_static_is_counterexample(self):
        w = [witness("g1", (2, 0)), witness("g2", (0, 0))]
        r = partition_conditional_conflicts(w, "target", "exact", set())
        self.assertEqual(r["unresolved_mixed"], 1)
        self.assertEqual(r["collision_explained"], 0)

    def test_two_incompatible_moves_cannot_be_explained_as_blocking(self):
        w = [witness("g1", (2, 0)), witness("g2", (3, 0)),
             witness("g3", (0, 0), obj=(2, 1, 63, 5, 63, 5))]
        r = partition_conditional_conflicts(w, "target", "exact", set())
        self.assertEqual(r["unresolved_mixed"], 1)

    def test_same_game_repetitions_not_independent_donors(self):
        w = [witness("g1", (2, 0)), witness("g1", (0, 0))]
        r = partition_conditional_conflicts(w, "target", "exact", set())
        self.assertEqual(r["mixed_keys"], 0)

    def test_target_outcomes_excluded_and_action6_coordinates_preserved(self):
        w = [witness("g1", (2, 0), action="ACTION6@1,2"),
             witness("g2", (0, 0), obj=(2, 1, 63, 5, 63, 5),
                     action="ACTION6@1,2"),
             witness("target", (3, 0), action="ACTION6@1,2")]
        r = partition_conditional_conflicts(w, "target", "both",
                                            {(0, "ACTION6@7,8", "ANY_ROLE")})
        self.assertEqual(r["mixed_keys"], 1)
        self.assertEqual(r["target_overlap_mixed"], 0)
        self.assertEqual(r["boundary_explained"], 1)

    def test_two_moving_donors_are_counted_without_policy_promotion(self):
        edge = (2, 1, 63, 5, 63, 5)
        w = [witness("g1", (2, 0)), witness("g2", (2, 0)),
             witness("g3", (0, 0), obj=edge)]
        r = partition_conditional_conflicts(w, "target", "exact", set())
        self.assertEqual(r["collision_explained"], 1)
        self.assertEqual(r["two_moving_donor_keys"], 1)
        self.assertNotIn("policy", r)


if __name__ == "__main__":
    unittest.main()
