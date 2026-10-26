# MondayID / ARC-AGI-3 offline agent

**Status (2026-10-26 18:56 UTC):** executable research baseline, **not submitted to Kaggle**, **no leaderboard score**. **19 contract tests pass on Python 3.12**. Official Python 3.12 public-game smoke now completes **1 level in vc33**, 0 in ls20, with a raw **two-game local scorecard score of 1.7857142857142856** at both 50 and 120 actions. This is a real local engine result, not a private Kaggle evaluation or a prize claim. Competition enrollment and rule acceptance remain unverified.

## Goal and physical limits

This component targets [ARC Prize 2026 — ARC-AGI-3](https://www.kaggle.com/competitions/arc-prize-2026-arc-agi-3). The competition evaluates an **offline** notebook agent. GPT/Grok cloud calls cannot be used during Kaggle scoring; any winning behavior must be inside the submitted code or permitted local model weights. Every result must be independently verified by benchmark execution and Kaggle acceptance.

ARC Prize 2026's overall $2M is split across tracks. ARC-AGI-3 has up to $850K conditional prizes, NOT $1B, and terms require open-source reproducibility for prize eligibility. A billion-dollar business outcome would require a separate commercialization path and is not a contest payout.

## What was built

- `agent/my_agent.py`: **single-file** official starter-compatible `MyAgent(Agent)` implementation, no third-party online services, no credentials, stable game-id seed. Requires Python 3.12 and the official ARC runtime.
- Novelty-driven policy: remembers seen board hashes and chosen actions, penalizes no-op repeats, uses online screen-change and level-progress feedback, and tests legal actions only.
- `ACTION6` click heuristic examines connected non-background color components, excludes known HUD borders on 64x64 frames, and probes an 8x8 spatial grid. Coordinates are capped at 0..63. It learns per-coordinate local/remote visual effects and penalizes known toggling loops. This is weak unsupervised salience, **not** semantic object recognition.
- In-process outcome memory, seeded decision tie-breaking, limits on number of state records. Cardinal movement continues through newly observed states until blocked rather than oscillating immediately.
- `tests/test_agent.py`: stubbed-runtime contract tests. **Passing these proves interface and control logic, not game performance.**

## Deploy through official Kaggle starter

Use [ARC-AGI-3-Kaggle-Starter](https://github.com/arcprize/ARC-AGI-3-Kaggle-Starter), keeping its notebook build and framework intact:

```sh
# In a Python 3.12 environment after cloning the official starter:
make setup
cp /path/to/MondayID/competitions/arc-agi-3/agent/my_agent.py agent/my_agent.py
make verify-local
make play-local
# Only after rules accepted and successful benchmarks: configure Kaggle
# token privately in the official starter, choose username, then:
# make submit
# make status
```

Final leaderboard submission additionally requires a deliberate `Submit to Competition` on Kaggle. Store API tokens *only* in the starter's gitignored private `.kaggle/` directory, never in this repo, chat, or PR. Confirm the Kaggle rules and final deadline yourself in the signed-in session.

## Verification ladder (do not conflate stages)

1. **Implemented:** code exists and imported through a stub ARC runtime.
2. **Unit tested:** `python -m unittest discover -s tests -v` passes in this directory.
3. **Integration tested:** official Python 3.12 starter successfully runs the agent against real environments and produces a scorecard. **Observed v3 on public ls20/vc33: 1 completed vc33 level; two-game local scorecard 1.7857142857142856.** [Evidence: GitHub Actions run 40382082274](https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/40382082274). All-25-public-game coverage is a separate pending benchmark.
4. **Competition accepted:** Kaggle notebook is uploaded, evaluated offline, and received a valid submission status. **Pending.**
5. **Effective:** baseline is beaten across public games, then verified against hidden leaderboard. **Pending.**
6. **Prize:** independently adjudicated under current competition rules. **Not claimed.**

## Known limitations / next experiments

This baseline does not identify goals or infer physical object rules, exploit grid navigation, or train a policy. Action-centric exploration may score zero despite valid execution. Important next experiments: state abstraction robust to animation, object tracking and causal motion estimation, shortest-path planning, game-family skill discovery, offline visual policy inference, loss-free state retention on reset, and repeated-seed scorecard comparisons against the official random baseline.

**Keep MondayID's identity, consent and continuity laws separate from the contest solver.** The contest code is replaceable strategy software, not the organism or any claimed sentient entity.


## Causal diagnostic finding (2026-10-26)

The public-game inspection revealed that `vc33` updates its top-row timer by 1-2 pixels every action even when a click has no gameplay effect. The previous agent repeatedly clicked those HUD pixels. Excluding HUD candidates exposed a meaningful interactive location around `(61,33)`: three repeated clicks produced large remote screen changes, with the third advancing the first level. This observation drove the **coordinate-specific transition memory** change, rather than an unverified guess that any screen change indicates progress. The 1.785714 local score is reproducible in both 50-step and 120-step two-game smoke runs; no hidden/private score is implied.
