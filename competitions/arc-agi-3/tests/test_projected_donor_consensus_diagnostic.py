"""Test-first contracts for projected donor-consensus failure decomposition (shadow only)."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "experiments"))
sys.path.insert(0, str(ROOT / "tests"))

from action_role_counterfactual_audit import _consensus_projected, _key
from test_action_role_counterfactual_audit import fixture
from projected_donor_consensus_diagnostic import (
    partition_support, diagnose_projected_donor_consensus,
)

ROLE = ("square", "area_unranked", (1, 1))
K = (0, "ACTION1", ROLE)


def donors(a, b, action="ACTION1"):
    key = (0, action, ROLE)
    return {"g1": {key: set(a)}, "g2": {key: set(b)}, "target": {}}


class ProjectedDonorConsensusTests(unittest.TestCase):
    def test_two_independent_unanimous_nonstatic_donors_accepted(self):
        d = donors({(2, 0)}, {(2, 0)})
        r = partition_support(d, "target", "exact", {_key(*K, "exact")})
        self.assertEqual(r["categories"]["unanimous_nonstatic"], 1)
        self.assertEqual(r["target_overlap"]["unanimous_nonstatic"], 1)
        self.assertEqual(r["accepted"], _consensus_projected(d, "target", "exact"))

    def test_single_donor_is_not_consensus(self):
        d = donors({(2, 0)}, set())
        d["g2"] = {}
        r = partition_support(d, "target", "exact", set())
        self.assertEqual(r["categories"]["insufficient_donor_games"], 1)
        self.assertFalse(r["accepted"])

    def test_two_static_donors_not_promoted(self):
        r = partition_support(donors({(0, 0)}, {(0, 0)}), "target", "exact", set())
        self.assertEqual(r["categories"]["static_only"], 1)
        self.assertFalse(r["accepted"])

    def test_conflicting_and_mixed_effects_veto(self):
        r = partition_support(donors({(2, 0)}, {(3, 0)}), "target", "exact", set())
        self.assertEqual(r["categories"]["contradictory_or_mixed"], 1)
        r2 = partition_support(donors({(2, 0)}, {(0, 0)}), "target", "exact", set())
        self.assertEqual(r2["categories"]["contradictory_or_mixed"], 1)

    def test_one_game_multiple_transitions_is_one_donor(self):
        d = {"g1": {K: {(2, 0), (3, 0)}}, "target": {}}
        r = partition_support(d, "target", "exact", set())
        self.assertEqual(r["categories"]["insufficient_donor_games"], 1)

    def test_target_never_donates_its_own_outcome(self):
        d = donors({(2, 0)}, {(2, 0)})
        d["target"] = {K: {(7, 0)}}
        r = partition_support(d, "target", "exact", set())
        self.assertEqual(r["accepted"][K], (2, 0))

    def test_action6_click_coordinates_remain_distinct(self):
        d = donors({(2, 0)}, {(2, 0)}, action="ACTION6@1,2")
        target_key = _key(0, "ACTION6@7,8", ROLE, "both")
        r = partition_support(d, "target", "both", {target_key})
        self.assertEqual(r["categories"]["unanimous_nonstatic"], 1)
        self.assertEqual(r["target_overlap"]["unanimous_nonstatic"], 0)

    def test_full_frozen_synthetic_control_and_shadow_only(self):
        r = diagnose_projected_donor_consensus(fixture())
        self.assertEqual(r["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(len(r["per_game"]), 9)
        self.assertEqual(r["per_game"][r["games"][2]]["exact"]["target_overlap"]["unanimous_nonstatic"], 1)

    def test_frozen_roster_rejected(self):
        with self.assertRaises(ValueError):
            diagnose_projected_donor_consensus(fixture()[:-1])


if __name__ == "__main__":
    unittest.main()
