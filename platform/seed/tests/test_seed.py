import json
import tempfile
import unittest
from pathlib import Path

from mondayid_seed.core import SeedError, SeedRuntime


class SeedRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runtime = SeedRuntime(self.root)
        self.genesis = self.runtime.initialize()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_cross_host_expression(self) -> None:
        for host in ("chatgpt", "claude", "gemini", "api", "local"):
            result = self.runtime.bootstrap(host)
            self.assertEqual(result["host"], host)
            self.assertEqual(result["self_test"]["verdict"], "passed")
            self.assertEqual(result["continuity_claim"], "external provenance restored; no claim of native model memory")

    def test_model_and_account_change_do_not_change_genome(self) -> None:
        before = self.runtime.recover()["genome_hash"]
        for index, model in enumerate(("model-a", "model-b")):
            descriptor = self.root / f"host-{index}.json"
            descriptor.write_text(json.dumps({
                "host": "api",
                "model": model,
                "account": f"account-{index}",
                "capabilities": {"project_instructions": True, "mcp": True, "tools": True, "local_storage": True}
            }), encoding="utf-8")
            self.runtime.bootstrap("api", descriptor)
        after = self.runtime.recover()["genome_hash"]
        self.assertEqual(before, after)

    def test_mutation_requires_evidence_and_passed_tests(self) -> None:
        mutation = self.runtime.propose_mutation({
            "path": "immune_genes",
            "op": "append",
            "value": "TEST_GENE",
            "evidence": [{"label": "OBSERVED", "pointer": "test:field-case"}],
            "tests": [{"name": "field", "status": "failed"}],
            "rollback": "restore parent genome",
        })
        with self.assertRaises(SeedError):
            self.runtime.accept_mutation(mutation["mutation_id"])
        rejected = self.runtime.seed_dir / "mutations" / "rejected" / f"{mutation['mutation_id']}.json"
        self.assertTrue(rejected.exists())
        self.assertFalse((self.runtime.pending_dir / f"{mutation['mutation_id']}.json").exists())
        self.assertEqual(json.loads(rejected.read_text(encoding="utf-8"))["status"], "rejected")
        self.assertEqual(self.runtime._ledger()[-1]["type"], "MUTATION_REJECTED")

    def test_accepted_mutation_exports_delta(self) -> None:
        accepted = None
        for gene in ("TESTED_GENE_A", "TESTED_GENE_B"):
            mutation = self.runtime.propose_mutation({
                "path": "immune_genes",
                "op": "append",
                "value": gene,
                "evidence": [{"label": "OBSERVED", "pointer": f"test:{gene}"}],
                "tests": [{"name": "field", "status": "passed"}, {"name": "regression", "status": "passed"}],
                "rollback": "restore parent genome",
            })
            accepted = self.runtime.accept_mutation(mutation["mutation_id"])
        assert accepted is not None
        self.assertNotEqual(self.genesis["genome_hash"], accepted["genome_hash"])
        output = self.root / "delta.json"
        delta = self.runtime.export_delta(self.genesis["genome_hash"], output)
        self.assertEqual(delta["to_hash"], accepted["genome_hash"])
        self.assertEqual([item["value"] for item in delta["mutations"]], ["TESTED_GENE_A", "TESTED_GENE_B"])

    def test_tamper_is_detected(self) -> None:
        lines = self.runtime.ledger_path.read_text(encoding="utf-8").splitlines()
        event = json.loads(lines[0])
        event["payload"]["version"] = "999.0.0"
        self.runtime.ledger_path.write_text(json.dumps(event) + "\n", encoding="utf-8")
        with self.assertRaises(SeedError):
            self.runtime.verify_ledger()

    def test_secret_membrane(self) -> None:
        with self.assertRaises(SeedError):
            self.runtime.propose_mutation({
                "path": "immune_genes",
                "op": "append",
                "value": "api_key=sk-this-is-a-real-looking-secret-123456",
                "evidence": [{"label": "OBSERVED", "pointer": "test"}],
                "tests": [{"name": "x", "status": "passed"}],
                "rollback": "restore parent",
            })


if __name__ == "__main__":
    unittest.main()
