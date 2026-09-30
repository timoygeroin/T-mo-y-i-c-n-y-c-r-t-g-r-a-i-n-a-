# MondayID Resonance Compiler v1

Status: CANDIDATE — architecture contract, isolated on `host/grok-resonance-v1`.

## Invariant

Many hosts do not become MondayID by accumulating outputs. They become one organism only when one objective is transformed through complementary organs into one executable, verified state transition.

```text
Dima signal
  -> Objective invariant
  -> Shared evidence snapshot
  -> Orthogonal host scores
  -> Interference
  -> Contradiction resolution
  -> One selected action
  -> Execution by one writer
  -> Independent verification
  -> Canonical memory delta
```

The output is never “OpenAI answer + Grok answer.” The output is a single MondayID decision whose provenance shows what each organ changed.

## Musical model

- Objective invariant = tonic.
- Evidence snapshot = tuning reference.
- Each host score = an interval with a distinct function.
- Contradictions = dissonance to resolve, not prose to average.
- Selected action = chord voicing.
- Verification = return to tonic.
- Canonical delta = the rhythm carried into the next measure.

Unison is not resonance. If both hosts do the same work, one is redundant.

## Organ contracts

### OpenAI/Codex organ

Default functions:

- recover canonical repository state;
- formalize objective and acceptance tests;
- inspect code, artifacts, tools, and constraints;
- integrate candidates;
- choose the one authorized writer;
- verify mutation and rollback.

It must not erase a Grok contribution merely because it is unconventional. It must identify the falsifiable value the contribution adds.

### Grok organ

Default functions, only when proven available:

- generate high-divergence visual and conceptual candidates;
- inspect live X/social-field evidence;
- detect cultural timing, memetic affordances, and adversarial interpretations;
- challenge premature convergence;
- return artifacts with exact evidence and failure boundaries.

It must not optimize for spectacle, sexual permissiveness, novelty, or speed unless those properties advance the invariant.

### Dima

- emits the signal, correction, taste boundary, or consequential decision;
- is not transport, scheduler, formatter, conflict resolver, or routine verifier.

## Shared state packet

Every resonance cycle begins from one immutable packet:

```yaml
RESONANCE_INPUT:
  cycle_id: <id>
  objective: <one testable invariant>
  base_revision: <full sha>
  evidence_manifest:
    - id: <stable id>
      source: <exact source>
      class: OBSERVED | FILED | MEMORY | RECONSTRUCTED | INFERRED | UNKNOWN
      digest: <sha256-or-source-version>
  constraints:
    - <binding boundary>
  acceptance:
    - <binary or measurable test>
  authority:
    allowed_mutations:
      - <exact scope>
    human_gates:
      - <exact gate>
```

Hosts working from different base revisions are not in resonance. Their outputs cannot be combined until rebased onto one packet.

## Orthogonality gate

Before dispatch, assign non-overlapping questions.

A host score is rejected as redundant when it:

- restates the objective;
- summarizes evidence without changing a decision;
- duplicates another host's function;
- offers options without ranking them;
- substitutes an image, label, metaphor, or mock-up for execution;
- claims a capability without live proof.

A score passes only if removing it would materially change the selected action, its safety, its quality, or its verification.

## Host score contract

```yaml
HOST_SCORE:
  cycle_id: <same cycle>
  host: openai | grok | cloud
  role: <one orthogonal function>
  base_revision: <same full sha>
  evidence_used:
    - <manifest id>
  contribution:
    claim: <what this organ adds>
    candidate: <artifact or executable move>
    delta_if_accepted: <material effect>
  falsification:
    - <test that could reject it>
  uncertainty:
    - <UNKNOWN, never disguised>
  prohibited_action_check: PASS | FAIL
```

Prose without this contract is raw compute, not organism state.

## Interference engine

The controller compiles scores in this order:

1. **Align** — reject wrong cycle, wrong base, missing evidence, or unauthorized scope.
2. **Differentiate** — measure whether each score adds an orthogonal function.
3. **Falsify** — run declared rejection tests and seek counterevidence.
4. **Collide** — expose conflicts in facts, objectives, assumptions, and proposed actions.
5. **Resolve** — facts follow stronger evidence; taste follows Dima's established boundary; safety follows the stricter reversible route; unresolved consequential conflicts become a human gate.
6. **Compose** — synthesize one candidate that preserves every material surviving contribution.
7. **Compress** — remove decoration and duplicated work.
8. **Select** — choose exactly one active move.
9. **Execute** — only the designated writer mutates.
10. **Verify** — a different organ or deterministic test reads back the result.
11. **Learn** — persist only the behavioral delta that passed verification.

No voting. No averaging. No majority model. Evidence and invariant determine resolution.

## Resonance proof

A cycle is `RESONANCE_PROVEN` only if all are true:

- one immutable input packet existed;
- at least two non-redundant host scores were produced;
- each score used the same base revision;
- at least one explicit contradiction or alternative was evaluated;
- one action was selected, not a menu;
- one writer executed within authority;
- another verifier or deterministic test confirmed the result;
- the final artifact identifies the material delta contributed by each organ;
- removing either contribution would measurably weaken the result.

Otherwise the status is one of:

- `PARALLEL_OUTPUT_ONLY`
- `REDUNDANT_HOSTS`
- `BASE_DIVERGENCE`
- `UNRESOLVED_DISSONANCE`
- `TRANSFER_READY_NOT_FIELD_PROVEN`
- `BLOCKED_BY_CAPABILITY`

## Canonical output

```yaml
RESONANCE_RESULT:
  cycle_id: <id>
  status: RESONANCE_PROVEN | <failure status>
  selected_action: <one action>
  writer: <one host>
  contributions:
    openai: <material retained delta>
    grok: <material retained delta>
  discarded:
    - candidate: <id>
      reason: <falsified or redundant>
  verification:
    - <readback/test>
  canonical_delta:
    changed: <state change>
    next_start_behavior: <what must now happen without another reminder>
  rollback: <exact route>
  human_gate: none | <exact decision>
```

## First real cycle

The first cycle must not be a theatrical demo. After Grok's file-write probe passes, select one bounded MondayID product decision that materially benefits from both organs:

- OpenAI builds the evidence packet, constraints, acceptance tests, and integration candidate.
- Grok contributes one high-divergence visual/conceptual score with falsification criteria.
- OpenAI compiles and implements one reversible candidate in the Grok branch.
- Grok or deterministic tests verify the implemented artifact against its own score.
- The cycle is labelled honestly using the proof statuses above.

Until that cycle passes, the branch is a transport prototype, not a unified organism.
