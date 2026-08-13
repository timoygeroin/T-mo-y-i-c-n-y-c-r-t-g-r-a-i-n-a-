# MONDAYID EXPERTISE FABRIC INTERACTION CONTRACT V1

Status: IMPLEMENTABLE CONTRACT
Depends on: MONDAYID_PHENOTYPE_DESIGN_LAW_V1, STATE-20260807-MONDAYID-WORK-016

## Purpose
Turn Expertise Fabric from a metaphor into a decision mechanism that can accept or reject a visible interaction before it reaches the user.

## First product scene: FOCUS OBJECT

The first scene is not a dashboard and not a chat. It is one mounted cognitive object representing the user's current active focus.

The object has exactly five canonical state dimensions:

```json
{
  "objectId": "focus:primary",
  "intent": "what the user is trying to move",
  "state": "what is currently true",
  "delta": "what changed since the prior accepted state",
  "evidence": ["why this state is believed"],
  "uncertainty": ["what remains unresolved"]
}
```

A host may render these differently, but MUST NOT fork their meaning.

## Interaction grammar

The user can perform only four semantic operations on the Focus Object:

1. `inspect` — reveal evidence, lineage, uncertainty, or causal structure.
2. `reframe` — change the representation without changing canonical meaning.
3. `act` — request an external mutation through a connector/host capability.
4. `challenge` — contest the state, evidence, priority, or interpretation.

Every visible gesture, click, voice command, drag, keyboard action or generated control MUST compile into one of these four operations.

If a control cannot state its semantic operation, it is decorative debt and fails.

## Expertise Fabric organs

Each proposed interaction is evaluated in parallel by the following organs. These are not personalities; they are independent constraint models.

### 1. Neuroscience / attention
Questions:
- What becomes salient first?
- Does the transition preserve object permanence?
- Does motion guide attention or merely consume it?
- Is working-memory demand increased unnecessarily?

Hard fail examples:
- important state disappears during a transition;
- simultaneous salient animations compete for attention;
- user must remember hidden prior state to understand current state.

### 2. Cognitive psychology
Questions:
- Is the system's current model legible?
- Can the user predict the consequence of the operation?
- Does recognition replace recall where possible?
- Are uncertainty and confidence distinguishable from fact?

Hard fail examples:
- system confidence is visually indistinguishable from evidence;
- a destructive action looks reversible when it is not;
- identical visuals produce different semantic consequences.

### 3. Psychodynamics / internal-world model
Questions:
- Is disagreement with MondayID allowed without social pressure?
- Does the surface preserve the user's agency rather than stage authority?
- Does the system expose contradiction without turning correction into punishment?

Hard fail examples:
- UI implies the model knows the user better than the evidence supports;
- challenge is hidden, shamed, or made harder than compliance;
- persuasive styling substitutes for proof.

### 4. Information theory / mathematics
Questions:
- What information is gained by this element?
- What ambiguity is removed?
- What new entropy/noise is introduced?
- Is there a simpler representation with the same decision value?

Operational heuristic:
`NetInformationValue = decision_relevant_bits_added - ambiguity_added - state_duplication_cost`

Hard fail: a visible component adds no decision-relevant information and no necessary affordance.

### 5. Human factors / motor interaction
Questions:
- Is the action reachable and recoverable?
- Does target size match consequence/frequency?
- Can the operation be performed under imperfect attention?
- Are accidental activations contained?

Hard fail examples:
- high-consequence action is adjacent to a frequent low-consequence action without guard;
- a gesture has no discoverable equivalent;
- a transition moves the target while the user is acting on it.

### 6. Systems / software engineering
Questions:
- Does the interaction preserve canonical state across host failure/remount?
- Can optimistic UI be reconciled with durable truth?
- Does host capability detection change presentation without changing semantics?

Hard fail examples:
- widget-local state is treated as canonical truth;
- host loss destroys the current object;
- the same operation means different things on different hosts.

### 7. Visual + industrial design
Questions:
- Does form express consequence and hierarchy?
- Is material/motion language consistent with the object's semantic state?
- Does the whole scene read as one phenotype rather than assembled cards?

Hard fail examples:
- visual novelty outranks state legibility;
- multiple unrelated materials compete for identity;
- component styling is attractive in isolation but weakens the whole scene.

### 8. Red Team / adversarial use
Questions:
- Can stale, uncertain, spoofed, or conflicting evidence produce a false authoritative state?
- Can the user be trapped by an irreversible transition?
- Can one host accidentally overwrite another host's fresher state?

Hard fail examples:
- no provenance for consequential state;
- stale write can become canonical;
- uncertainty is silently dropped during reframe.

## Synthesis gate

A proposal is accepted only if:

```text
all_hard_fails == false
AND semantic_operation in {inspect,reframe,act,challenge}
AND canonical_meaning_preserved == true
AND phenotype_coherence == true
AND provenance_available_for_consequential_claims == true
```

There is no weighted score that can compensate for a hard fail.

Soft tradeoffs may be ranked after hard-fail elimination using:

`Utility = TaskGain + Legibility + Recovery + Coherence - CognitiveLoad - MotorCost - LatencyCost - Ambiguity`

Weights are scene-specific and must be recorded with the decision receipt.

## Counterforce law

Every accepted change MUST record its induced countereffects.

Format:

```json
{
  "change": "example",
  "primaryEffect": "what improves",
  "counterEffects": [
    {"domain":"attention","cost":"...","mitigation":"..."},
    {"domain":"latency","cost":"...","mitigation":"..."}
  ]
}
```

No interaction may be described as a pure improvement.

## Phenotype law integration

The design unit is the whole experienced state, not an element.
Therefore an element can pass its local discipline checks and still fail if it breaks scene coherence.

Mandatory final question:
`If this element is removed or changed, what happens to the meaning of the whole scene?`

If the answer is "almost nothing", the element is a candidate for deletion.

## First field test

Input scene:
- One Focus Object is mounted.
- The object says a project is "ready to ship".
- Evidence contains 3 verified checks and 1 unresolved blocker.
- User taps the object's confident visual state.

Required behavior:
1. `inspect` is inferred, not `act`.
2. Evidence and unresolved blocker appear without replacing/remounting the Focus Object.
3. The strong "ready" phenotype weakens because uncertainty exists.
4. The blocker remains model-visible after UI interaction.
5. Reframing the object on another host preserves the blocker and evidence lineage.
6. If the host crashes, durable state recovers the same canonical object.

PASS requires all six.

## Rejection examples

- A glowing orb that visualizes "energy" without a defined state variable: REJECT.
- A card called "Focus" that only opens a chat: REJECT.
- A beautiful animation that hides evidence while it runs: REJECT.
- A host-specific widget state that cannot recover after remount: REJECT.
- A surface that makes disagreement harder than acceptance: REJECT.

## Implementation boundary

The first implementation MUST expose the canonical Focus Object and the four semantic operations. Styling comes after the field test is wired. No generative visual may be promoted to canon until its behavior passes this contract.
