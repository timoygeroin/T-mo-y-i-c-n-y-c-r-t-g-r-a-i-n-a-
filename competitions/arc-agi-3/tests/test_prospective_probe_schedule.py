"""Test-first frozen outcome-blind PUBLIC probe schedule and chronological audit."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from prospective_probe_schedule import (PROTOCOL, HORIZON, SAMPLE_SIZE,
    select_probe_games, choose_probe_action, probe_manifest, audit_probe_trace)
from disjoint_public_sample import PUBLIC_GAME_IDS

def row(game, turn, action="ACTION1", legal=None, pre_state="NOT_FINISHED"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game, turn=turn,
        pre_state=pre_state, action_key=action,
        legal_actions=legal if legal is not None else ["ACTION1"],
        level_before=0, level_after=0,
        before_scene=[[1, 1, 10, 10, 10, 10], [2, 1, 20, 10, 20, 10]],
        after_scene=[[1, 1, 10, 10, 10, 10], [2, 1, 20, 10, 20, 10]],
        before_frame_sha256="a" * 64, after_frame_sha256="a" * 64)

def minimal_rows():
    games = select_probe_games()
    sha = probe_manifest()["sha256"]
    return [dict(row(game, 0), plan_sha256=sha,
                 collection_policy="outcome_blind_cycle_v1") for game in games]

class ProbeScheduleTests(unittest.TestCase):
    def test_fixed_public_sample_no_score_based_selection(self):
        games = select_probe_games()
        self.assertEqual(len(games), SAMPLE_SIZE)
        self.assertEqual(len(set(games)), SAMPLE_SIZE)
        self.assertTrue(set(games).issubset(set(PUBLIC_GAME_IDS)))
        self.assertEqual(games, select_probe_games(tuple(reversed(PUBLIC_GAME_IDS))))

    def test_roster_drift_fails_closed(self):
        for roster in (PUBLIC_GAME_IDS[:-1], PUBLIC_GAME_IDS + ("unknown",),
                       PUBLIC_GAME_IDS[:-1] + (PUBLIC_GAME_IDS[0],)):
            with self.assertRaises(ValueError):
                select_probe_games(roster)

    def test_cycle_is_predeclared_not_game_or_scene_dependent(self):
        legal = ["ACTION1", "ACTION2", "ACTION3", "ACTION4", "ACTION5", "ACTION6"]
        self.assertEqual([choose_probe_action(t, legal)[0] for t in range(6)],
                         legal)
        self.assertEqual(choose_probe_action(6, legal)[0], "ACTION1")
        self.assertEqual(choose_probe_action(0, ["ACTION4"]), ("ACTION4", None))
        self.assertIsNone(choose_probe_action(0, ["ACTION7"]))
        self.assertEqual(choose_probe_action(0, []), None)

    def test_click_coordinates_bounded_and_exact(self):
        for t in range(HORIZON):
            action = choose_probe_action(t, ["ACTION6"])
            self.assertEqual(action[0], "ACTION6")
            self.assertEqual(len(action[1]), 2)
            self.assertTrue(all(0 <= v < 64 for v in action[1]))
        self.assertNotEqual(choose_probe_action(0, ["ACTION6"])[1],
                            choose_probe_action(6, ["ACTION6"])[1])

    def test_invalid_turn_or_legal_set_rejected(self):
        for turn in (-1, HORIZON, True, "0"):
            with self.assertRaises(ValueError):
                choose_probe_action(turn, ["ACTION1"])
        for legal in (None, "ACTION1", ["RESET"], ["ACTION1", "ACTION1"]):
            with self.assertRaises(ValueError):
                choose_probe_action(0, legal)

    def test_manifest_is_outcome_blind_and_stable(self):
        m = probe_manifest()
        self.assertEqual(m, probe_manifest())
        self.assertEqual(m["protocol"], PROTOCOL)
        self.assertEqual(m["horizon"], HORIZON)
        self.assertEqual(len(m["sha256"]), 64)
        self.assertFalse(any("after" in key or "score" in key or "outcome" in key
                             for key in m["plan"]))

    def test_audit_requires_full_ordered_sample_and_plan_hash(self):
        rows = minimal_rows()
        result = audit_probe_trace(rows)
        self.assertEqual(result["records"], SAMPLE_SIZE)
        self.assertEqual(result["strict_prior"]["absolute_forecasts"], 0)
        self.assertEqual(result["strict_prior"]["relative_forecasts"], 0)
        for bad in (rows[:-1], list(reversed(rows)),
                    [dict(rows[0], plan_sha256="0"*64)] + rows[1:],
                    [dict(rows[0], turn=1)] + rows[1:],
                    [dict(rows[0], action_key="ACTION2")] + rows[1:]):
            with self.subTest(bad=bad[:1]), self.assertRaises(ValueError):
                audit_probe_trace(bad)

    def test_audit_rejects_nonprecommitted_or_illegal_action(self):
        rows = minimal_rows()
        for change in ({"collection_policy": "agent_novelty"},
                       {"action_key": "ACTION6@2,3"},
                       {"legal_actions": ["ACTION2"]},
                       {"pre_state": "NOT_PLAYED"}):
            bad = copy.deepcopy(rows)
            bad[0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                audit_probe_trace(bad)

    def test_trace_requires_well_formed_frame_digests(self):
        rows = minimal_rows()
        for change in ({"before_frame_sha256": None},
                       {"after_frame_sha256": "not-a-sha"},
                       {"before_frame_sha256": "g" * 64}):
            bad = copy.deepcopy(rows)
            bad[0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                audit_probe_trace(bad)

    def test_same_visible_frame_cannot_claim_different_object_effect(self):
        # A deterministic scene extraction from identical visible pixels
        # cannot manufacture an H1/H2 translation witness.
        rows = minimal_rows()
        rows[0]["after_scene"] = [[1, 1, 11, 10, 11, 10],
                                  [2, 1, 20, 10, 20, 10]]
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)

    def test_same_visible_frame_across_games_has_one_scene(self):
        # Identity applies across independent episodes, not just a chain.
        rows = minimal_rows()
        changed = [[1, 1, 11, 10, 11, 10], [2, 1, 20, 10, 20, 10]]
        rows[1]["before_scene"] = changed
        rows[1]["after_scene"] = copy.deepcopy(changed)
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)

    def test_different_visible_frames_may_share_object_scene(self):
        # HUD or animation may change pixels without changing abstraction.
        rows = minimal_rows()
        rows[0]["after_frame_sha256"] = "b" * 64
        self.assertEqual(audit_probe_trace(rows)["records"], SAMPLE_SIZE)

    def test_same_game_consecutive_scene_must_chain(self):
        rows = minimal_rows()
        next_row = dict(row(rows[0]["game_id"], 1), plan_sha256=rows[0]["plan_sha256"],
                        collection_policy="outcome_blind_cycle_v1")
        next_row["before_scene"] = [[3, 1, 11, 10, 11, 10]]
        rows.insert(1, next_row)
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)


    def test_equivalent_scene_ordering_preserves_continuity(self):
        # Object detections are an unordered scene multiset. A stable frame
        # digest with reordered descriptors must not break an episode chain.
        rows = minimal_rows()
        next_row = dict(row(rows[0]["game_id"], 1),
                        plan_sha256=rows[0]["plan_sha256"],
                        collection_policy="outcome_blind_cycle_v1")
        next_row["before_scene"] = list(reversed(next_row["before_scene"]))
        rows.insert(1, next_row)
        self.assertEqual(audit_probe_trace(rows)["records"], SAMPLE_SIZE + 1)

    def test_same_game_consecutive_visible_frame_must_chain(self):
        rows = minimal_rows()
        next_row = dict(row(rows[0]["game_id"], 1), plan_sha256=rows[0]["plan_sha256"],
                        collection_policy="outcome_blind_cycle_v1")
        next_row["before_frame_sha256"] = "b" * 64
        rows.insert(1, next_row)
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)

    def test_only_horizon_completed_earlier_games_can_donate(self):
        # Merely moving on to another game does NOT finish the 24-turn
        # preregistered donor episode. Otherwise one-turn sources can
        # fabricate independent support for H1/H2.
        games = select_probe_games()
        rows = minimal_rows()
        short = audit_probe_trace(rows)
        self.assertEqual(short["per_game"][games[1]]["prior_games"], [])
        self.assertEqual(short["per_game"][games[2]]["prior_games"], [])

        # The first game is now observed for the entire bounded horizon;
        # only it, not the second one-turn game, can be an earlier donor.
        first = rows[0]
        extra = [dict(row(games[0], t), plan_sha256=first["plan_sha256"],
                      collection_policy="outcome_blind_cycle_v1")
                 for t in range(1, HORIZON)]
        rows[1:1] = extra
        complete = audit_probe_trace(rows)
        self.assertEqual(complete["per_game"][games[1]]["prior_games"], [games[0]])
        self.assertEqual(complete["per_game"][games[2]]["prior_games"], [games[0]])

    def test_full_horizon_with_mid_episode_reset_is_not_an_independent_donor(self):
        # 24 records are not necessarily one uninterrupted game episode.
        # A GAME_OVER/RESET in the middle cannot donate an independent
        # causal world rule to a later game's H1/H2 prediction.
        games = select_probe_games()
        rows = minimal_rows()
        first = rows[0]
        extra = [dict(row(games[0], t), plan_sha256=first["plan_sha256"],
                      collection_policy="outcome_blind_cycle_v1")
                 for t in range(1, HORIZON)]
        extra[11]["pre_state"] = "GAME_OVER"
        extra[11]["action_key"] = "RESET"
        rows[1:1] = extra
        result = audit_probe_trace(rows)
        self.assertEqual(result["per_game"][games[1]]["prior_games"], [])
        self.assertEqual(result["per_game"][games[1]]["ineligible_interrupted_prior_games"],
                         [games[0]])

    def test_reset_row_cannot_hide_malformed_visible_scene(self):
        rows = minimal_rows()
        rows[0]["pre_state"] = "GAME_OVER"
        rows[0]["action_key"] = "RESET"
        rows[0]["before_scene"] = [[1, 1, 70, 0, 70, 0]]
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)

    def test_impossible_object_area_cannot_be_donor_evidence(self):
        rows = minimal_rows()
        rows[0]["before_scene"] = [[1, 2, 10, 10, 10, 10]]
        rows[0]["after_scene"] = [[1, 2, 10, 10, 10, 10]]
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)

    def test_negative_level_cannot_enter_world_audit(self):
        rows = minimal_rows()
        rows[0]["level_before"] = -1
        rows[0]["level_after"] = -1
        with self.assertRaises(ValueError):
            audit_probe_trace(rows)

    def test_unknown_public_state_cannot_be_used_as_world_evidence(self):
        # ARC GameState.NOT_FINISHED is the running state, not IN_PROGRESS.
        # Arbitrary nonempty state strings must not authorize a scheduled
        # action and then enter H0/H1/H2 donor evidence.
        for state in ("PAUSED", "IN_PROGRESS", "IN_PROGRESS ", "RESET", "game_over"):
            rows = minimal_rows()
            rows[0]["pre_state"] = state
            with self.subTest(state=state), self.assertRaises(ValueError):
                audit_probe_trace(rows)

    def test_contiguous_two_turn_trace_is_accepted(self):
        rows = minimal_rows()
        next_row = dict(row(rows[0]["game_id"], 1), plan_sha256=rows[0]["plan_sha256"],
                        collection_policy="outcome_blind_cycle_v1")
        rows.insert(1, next_row)
        self.assertEqual(audit_probe_trace(rows)["records"], SAMPLE_SIZE + 1)

    def test_partial_trace_is_not_presented_as_horizon_complete(self):
        rows = minimal_rows()
        result = audit_probe_trace(rows)
        self.assertFalse(result["trace_horizon_complete"])
        self.assertEqual(result["incomplete_games"], list(select_probe_games()))
        self.assertEqual(result["interpretation"],
                         "PARTIAL_PUBLIC_PROBE_TRACE_NOT_VALID_FOR_HORIZON_COMPARISON")

    def test_full_horizon_requires_all_nine_games(self):
        games = select_probe_games()
        digest = probe_manifest()["sha256"]
        rows = [dict(row(game, turn), plan_sha256=digest,
                     collection_policy="outcome_blind_cycle_v1")
                for game in games for turn in range(HORIZON)]
        result = audit_probe_trace(rows)
        self.assertTrue(result["trace_horizon_complete"])
        self.assertEqual(result["incomplete_games"], [])
        self.assertEqual(result["records"], SAMPLE_SIZE * HORIZON)
        self.assertEqual(result["interpretation"],
                         "STRUCTURALLY_COMPLETE_UNAUTHENTICATED_PUBLIC_PROBE_TRACE")

    def test_full_horizon_does_not_authenticate_prospective_evidence(self):
        # A self-consistent JSONL file is not independently sourced or
        # timestamped pre-action evidence, even when all 216 rows are present.
        games = select_probe_games()
        digest = probe_manifest()["sha256"]
        rows = [dict(row(game, turn), plan_sha256=digest,
                     collection_policy="outcome_blind_cycle_v1")
                for game in games for turn in range(HORIZON)]
        result = audit_probe_trace(rows)
        self.assertTrue(result["trace_horizon_complete"])
        self.assertFalse(result["provenance_authenticated"])
        self.assertFalse(result["eligible_for_prospective_evidence"])
        self.assertEqual(result["interpretation"],
                         "STRUCTURALLY_COMPLETE_UNAUTHENTICATED_PUBLIC_PROBE_TRACE")

    def test_full_row_count_with_mid_episode_reset_is_not_valid_horizon_comparison(self):
        # A full 24-row count is not an uninterrupted 24-turn episode.
        # It must not be advertised as complete for matched-world comparisons.
        games = select_probe_games()
        digest = probe_manifest()["sha256"]
        rows = [dict(row(game, turn), plan_sha256=digest,
                     collection_policy="outcome_blind_cycle_v1")
                for game in games for turn in range(HORIZON)]
        rows[12]["pre_state"] = "GAME_OVER"
        rows[12]["action_key"] = "RESET"
        result = audit_probe_trace(rows)
        self.assertFalse(result["trace_horizon_complete"])
        self.assertEqual(result["interrupted_games"], [games[0]])
        self.assertEqual(result["incomplete_games"], [])
        self.assertEqual(result["interpretation"],
                         "INTERRUPTED_PUBLIC_PROBE_TRACE_NOT_VALID_FOR_HORIZON_COMPARISON")

    def test_competing_world_hypotheses_score_only_same_turn_disagreements(self):
        # A head-to-head contrast is meaningful only when BOTH H1 and H2
        # issue distinct forecasts on the SAME pre-action observation.
        # Do not mistake different forecast coverage for a causal win.
        from unittest.mock import patch
        from relational_world_factorization import _evaluate_target
        from effect_coverage_audit import _scene
        before = _scene([[1, 1, 10, 10, 10, 10],
                         [2, 1, 20, 10, 20, 10]])
        after = _scene([[1, 1, 11, 10, 11, 10],
                        [2, 1, 20, 10, 20, 10]])
        r = row("synthetic", 0)
        r["after_scene"] = [list(o) for o in after]
        rules = {"absolute": {"dummy": 1}, "relative": {"dummy": 1}}
        with patch("relational_world_factorization.predict_scene",
                   side_effect=lambda scene, level, action, rule, h:
                       after if h == "absolute" else before):
            result = _evaluate_target([r], rules)
        self.assertEqual(result["paired_disagreements"], 1)
        self.assertEqual(result["absolute_wins_on_disagreement"], 1)
        self.assertEqual(result["relative_wins_on_disagreement"], 0)
        self.assertEqual(result["neither_correct_on_disagreement"], 0)
        self.assertEqual(result["h0_wins_on_disagreement"], 0)

if __name__ == "__main__":
    unittest.main()
