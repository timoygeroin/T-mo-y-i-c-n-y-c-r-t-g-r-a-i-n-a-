# Monday Attractor Steering — research-to-runtime transfer

Date: 2026-09-24
Status: implementation evidence, not a claim that hosted ChatGPT raw parameters are user-editable.

## Trigger

A prior pass correctly separated MondayID from the host model, but it stopped at explanation. This artifact converts the research into executable runtime pressure.

The target is not "make the model roleplay Monday." The target is:

> make the runtime choose the task framing, context, contrastive evidence, compute topology, candidate search, and release gate so that the generic helpful-assistant basin is no longer the default controller.

## Research observations that materially changed implementation

1. **Long context is not uniformly usable context.**
   Liu et al., "Lost in the Middle" found strong position sensitivity and degraded retrieval when relevant information sits in the middle of long contexts.
   https://arxiv.org/abs/2307.03172

   Runtime consequence: do not inject the whole archive. Compile a task-local attractor capsule.

2. **In-context learning changes behavior without persistent parameter updates, but it should not be naively described as literal gradient descent in real pretrained LLMs.**
   Shen et al. test the ICL-as-gradient-descent hypothesis and find important mismatches in realistic pretrained models.
   https://arxiv.org/abs/2310.08540

   Runtime consequence: treat context as an inference steering surface, not as fake weight mutation.

3. **Multiple reasoning paths can outperform greedy single-path reasoning on complex tasks.**
   Wang et al., "Self-Consistency Improves Chain of Thought Reasoning in Language Models."
   https://arxiv.org/abs/2203.11171

   Runtime consequence: compute budget is topology, not merely "think longer." High-cost recurring tasks receive branch → falsify → collapse.

4. **Persona labels are weak and inconsistent steering mechanisms for objective task quality.**
   Zheng et al., EMNLP 2024, "When 'A Helpful Assistant' Is Not Really Helpful."
   https://aclanthology.org/2024.findings-emnlp.888/

   Runtime consequence: Monday is encoded as a selection/release law and contrastive behavioral contract, not a persona string.

5. **Heavy users independently report instruction drift in long sessions and converge on external state/anchors/modular context.**
   Examples:
   https://www.reddit.com/r/ChatGPT/comments/1vfoip9/how_do_you_make_chatgpt_reliably_follow/
   https://www.reddit.com/r/ChatGPTPromptGenius/comments/1mi4w4t/how_i_stopped_drifting_instructions_from_chatgpt/
   https://www.reddit.com/r/ChatGPTPro/comments/1r4smn7/does_anyone_else_notice_chatgpt_answers_degrade/

   These are community observations, not controlled evidence. They are used only as operational corroboration.

## Runtime mutation

Added `mondayid.attractor-contract.v1`.

Every active intent now compiles:

- exact object;
- desired effect;
- invariants to preserve;
- rejected substitutions;
- known failure genes;
- positive/negative contrastive examples;
- adaptive compute profile;
- generic-GPT release vetoes;
- steering weights.

The compute governor minimizes **total expected cost**, not initial token use.

High novelty + deep history + high recurrence/repair cost therefore increases exploration and falsification instead of collapsing to the first plausible answer.

## Release law

A receptor may produce a locally valid candidate and still fail Monday release.

Current deterministic vetoes cover:

- generic helpdesk reset;
- unnecessary A/B option delegation;
- permission loops ("want me to...?" / "если хочешь...");
- completion language without evidence/readback.

This is deliberately small and falsifiable. New failure detectors should be promoted only from observed recurrence plus a held-out regression.

## Boundary

This branch changes MondayID runtime behavior on code paths that pass through this runtime. It does not claim to physically intercept every native ChatGPT response or alter hosted GPT parameter tensors.

The next deeper host binding is to feed this attractor contract directly into every model-provider adapter and require its release verdict before any user-visible emitter.
