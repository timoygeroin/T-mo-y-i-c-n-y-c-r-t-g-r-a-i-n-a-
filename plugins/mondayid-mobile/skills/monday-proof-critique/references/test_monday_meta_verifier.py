import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from monday_meta_verifier import Evidence, assess, calibrate, naive_receipt

class VerificationOfVerification(unittest.TestCase):
    def e(self, **overrides):
        props = dict(claim='Monday completed a real task', kind='functional',
                     expected_effect='same exact task completed', receipt_exists=True,
                     effect_observed=True, same_target=True,
                     independent_observation=True)
        props.update(overrides)
        return Evidence(**props)

    def test_alpha_style_restored_but_task_lost(self):
        # Historical-shaped failure: greeting recognized; prior task not resumed.
        self.assertEqual(assess(self.e(kind='transfer', effect_observed=False)), 'FALSIFIED_EFFECT')

    def test_file_or_plugin_receipt_does_not_prove_behavior(self):
        self.assertEqual(assess(self.e(effect_observed=None)), 'UNOBSERVED_EFFECT')

    def test_verifier_that_passes_noop_control_is_invalid(self):
        self.assertEqual(assess(self.e(negative_control_passed=True)), 'INVALID_VERIFIER')

    def test_unprimed_transfer_distinguished_from_known_script(self):
        self.assertEqual(assess(self.e(kind='transfer', test_exposed_to_candidate=True)), 'EXPOSED_TRANSFER_TEST')
        self.assertEqual(assess(self.e(kind='transfer', test_exposed_to_candidate=False)), 'SCOPED_EFFECT_OBSERVED')

    def test_orthogonal_success_without_expected_artifact_is_allowed(self):
        self.assertEqual(assess(self.e(receipt_exists=False)), 'SCOPED_EFFECT_OBSERVED')

    def test_executor_cannot_self_certify(self):
        self.assertEqual(assess(self.e(independent_observation=False)), 'NONINDEPENDENT_EVIDENCE')

    def test_goalpost_shift_is_not_success(self):
        self.assertEqual(assess(self.e(goal_changed_after_result=True)), 'INVALID_VERIFIER')

    def test_a_scoped_calibration_exposes_bad_proxy_in_two_directions(self):
        cases = [
            ('neither', self.e(receipt_exists=False, effect_observed=False), False),
            ('receipt_no_effect', self.e(receipt_exists=True, effect_observed=False), False),
            ('effect_without_receipt', self.e(receipt_exists=False, effect_observed=True), True),
            ('both', self.e(receipt_exists=True, effect_observed=True), True),
        ]
        legacy = calibrate(naive_receipt, cases)
        meta = calibrate(assess, cases)
        self.assertEqual(sum(x['false_accept'] or x['false_reject'] for x in legacy), 2)
        self.assertEqual(sum(x['false_accept'] or x['false_reject'] for x in meta), 0)

if __name__ == '__main__':
    unittest.main(verbosity=2)
