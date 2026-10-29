"""Strict-prior causal-effect shadow probe on OFFICIAL PUBLIC gameplay.

Generates an instrumented copy of the frozen agent, never changing its
action-selection code or the competition submission. H0 predicts no visible
change; H1 predicts the last same-level, same-physical-action outcome; H2
predicts the last same-level, same-state, same-physical-action outcome.
Forecasts are emitted BEFORE action execution, and observations are recorded
only on the next observed frame. No hidden-state, causality, or score claim.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

PREFIX_FORECAST = "MONDAYID_FORECAST_V1 "
PREFIX_OUTCOME = "MONDAYID_OUTCOME_V1 "

IMPORT = "import hashlib\n"
INIT = "        self._seen_full_reset = False\n"
METHOD = "    def _record_outcome(self, current: tuple[int,str], grids: list[list[list[int]]]) -> None:\n"
OBSERVE = "        outcome_identity = self._last_move\n"
ACTION = "        action.reasoning={'policy':"

PROBE_INIT = """        self._probe_pending = None
        self._probe_action_donors = {}
        self._probe_exact_donors = {}
"""

PROBE_METHOD = '''    def _probe_observe(self, current, grids, delta):
        pending = self._probe_pending
        if pending is None:
            return
        actual = {"changed": bool(delta > 0),
                  "progressed": bool(current[0] > pending["level"])}
        print("MONDAYID_OUTCOME_V1 " + json.dumps({
            "game": str(self.game_id), "step": pending["step"],
            "action": pending["action"], "before": pending["state"],
            "after": current[1], "actual": actual,
            "masked_changed_pixels": delta,
            "level_before": pending["level"], "level_after": current[0]
        }, sort_keys=True), flush=True)
        # Strict-prior donors are updated ONLY after this outcome is recorded.
        self._probe_action_donors[(pending["level"], pending["action"])] = dict(actual)
        self._probe_exact_donors[(pending["level"], pending["state"], pending["action"])] = dict(actual)
        self._probe_pending = None

    def _probe_forecast(self, key, action):
        physical = action.name
        if action.is_complex() and self._last_position is not None:
            physical = f"ACTION6@{self._last_position[0]},{self._last_position[1]}"
        predictions = {
            "H0_static": {"changed": False, "progressed": False},
            "H1_action": self._probe_action_donors.get((key[0], physical)),
            "H2_exact": self._probe_exact_donors.get((key[0], key[1], physical))
        }
        self._probe_pending = {
            "game": str(self.game_id), "step": self._steps,
            "level": key[0], "state": key[1], "action": physical,
            "predictions": predictions
        }
        print("MONDAYID_FORECAST_V1 " + json.dumps(self._probe_pending,
              sort_keys=True), flush=True)

'''


def generate(source: str) -> str:
    guards = {IMPORT: 1, INIT: 1, METHOD: 1, OBSERVE: 1, ACTION: 1}
    for anchor, expected in guards.items():
        if source.count(anchor) != expected:
            raise ValueError("frozen source anchor changed: " + repr(anchor))
    if source.count("        self._steps+=1\n") != 1:
        raise ValueError("frozen action counter anchor changed")
    result = source.replace(IMPORT, IMPORT + "import json\n", 1)
    result = result.replace(INIT, INIT + PROBE_INIT, 1)
    result = result.replace(METHOD, PROBE_METHOD + METHOD, 1)
    result = result.replace(OBSERVE, "        self._probe_observe(current, grids, delta)\n" + OBSERVE, 1)
    result = result.replace(ACTION, "        self._probe_forecast(key, action)\n" + ACTION, 1)
    compile(result, "<strict-prior-public-causal-probe>", "exec")
    return result


def parse_trace(text: str) -> dict:
    forecasts, outcomes = [], []
    seen, completed = {}, set()
    for line in text.splitlines():
        if line.startswith(PREFIX_FORECAST):
            row = json.loads(line[len(PREFIX_FORECAST):])
            if not isinstance(row, dict) or not {"game", "step", "action", "state", "predictions"}.issubset(row):
                raise ValueError("invalid pre-action forecast")
            key = (row["game"], row["step"])
            if key in seen or not row["action"]:
                raise ValueError("duplicate or invalid forecast")
            seen[key] = row
            forecasts.append(row)
        elif line.startswith(PREFIX_OUTCOME):
            row = json.loads(line[len(PREFIX_OUTCOME):])
            if not isinstance(row, dict) or not {"game", "step", "action", "before", "actual"}.issubset(row):
                raise ValueError("invalid post-action outcome")
            key = (row["game"], row["step"])
            if key not in seen or key in completed:
                raise ValueError("outcome missing preceding forecast or duplicate")
            prior = seen[key]
            if row["action"] != prior["action"] or row["before"] != prior["state"]:
                raise ValueError("outcome action/state differs from pre-action forecast")
            completed.add(key)
            outcomes.append(row)
    return {"forecast": forecasts, "outcome": outcomes}


def summarize(text: str) -> dict:
    trace = parse_trace(text)
    forecast = {(r["game"], r["step"]): r for r in trace["forecast"]}
    outcomes = trace["outcome"]
    worlds = ("H0_static", "H1_action", "H2_exact")
    comparison = {}
    for candidate in ("H1_action", "H2_exact"):
        eligible = [(forecast[(r["game"], r["step"])]["predictions"], r["actual"])
                    for r in outcomes
                    if forecast[(r["game"], r["step"])]["predictions"][candidate] is not None]
        comparison[candidate] = {
            "eligible": len(eligible),
            "change_correct": sum(int(p[candidate]["changed"] == actual["changed"])
                                  for p, actual in eligible),
            "static_change_correct_same_subset": sum(
                int(p["H0_static"]["changed"] == actual["changed"])
                for p, actual in eligible),
            "progress_correct": sum(int(p[candidate]["progressed"] == actual["progressed"])
                                    for p, actual in eligible),
            "static_progress_correct_same_subset": sum(
                int(p["H0_static"]["progressed"] == actual["progressed"])
                for p, actual in eligible)
        }
    return {
        "schema": "mondayid.arc3.public-strict-prior-effect-probe.v1",
        "forecasts": len(trace["forecast"]),
        "observed_outcomes": len(outcomes),
        "censored_forecasts": len(trace["forecast"]) - len(outcomes),
        "changed_outcomes": sum(int(r["actual"]["changed"]) for r in outcomes),
        "level_progress_outcomes": sum(int(r["actual"]["progressed"]) for r in outcomes),
        "action_conditioned_comparison": comparison,
        "causality_proven": False,
        "policy_changed": False,
        "interpretation": "INTERNAL_PREACTION_CHRONOLOGY_OFFICIAL_PUBLIC_SHADOW_ONLY"
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--analyze", type=Path)
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args()
    if args.analyze:
        result = summarize(args.analyze.read_text())
        data = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if args.summary:
            args.summary.write_text(data)
        print(data)
    elif args.source and args.output:
        args.output.write_text(generate(args.source.read_text()))
    else:
        parser.error("use --source/--output or --analyze")


if __name__ == "__main__":
    main()
