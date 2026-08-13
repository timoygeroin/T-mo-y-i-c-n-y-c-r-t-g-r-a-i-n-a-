# OPENAI PLUGIN SURFACE MAP — 2026-08-07

Status: CANONICAL_RESEARCH / CURRENT_PLATFORM_PASS
Purpose: determine whether MondayID should live inside ChatGPT, Sites, Codex, a standalone runtime, or a compiled combination of those surfaces.

## 1. Source set reviewed

Current OpenAI documentation surfaces reviewed for this pass:

- Plugin architecture: https://developers.openai.com/plugins/concepts/plugins
- ChatGPT plugin UI / MCP Apps bridge: https://developers.openai.com/plugins/build/chatgpt-ui
- Plugin runtime reference: https://developers.openai.com/plugins/reference
- Skills: https://developers.openai.com/plugins/concepts/skills
- Codex hooks: https://developers.openai.com/codex/hooks
- Codex / ChatGPT subagents: https://developers.openai.com/codex/subagents
- ChatGPT / Codex models and intelligence levels: https://developers.openai.com/codex/models
- ChatGPT Sites availability and management: https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites
- Apps / plugin-directory transition and workspace controls: current OpenAI Help Center plugin/app pages.

This document records platform facts separately from MondayID deductions.

---

## 2. Platform facts

### 2.1 Plugins are now the installable package boundary

One plugin can combine:
- Skills
- an MCP server
- tools and structured results
- optional UI resources
- surface-specific capabilities, including Codex-only hooks

ChatGPT and Codex share one plugin directory. Therefore the package boundary can span multiple OpenAI surfaces without forcing every capability to run everywhere.

### 2.2 ChatGPT UI is a real application surface

A plugin UI runs in an isolated iframe and can use the MCP Apps bridge. A mounted component can:
- receive tool input and results
- initiate tool calls itself
- send follow-up messages into the conversation
- update model-visible context
- maintain widget-scoped UI state
- request host modals
- use optional ChatGPT file helpers
- adapt to host signals such as theme / locale / display mode

Presentations include inline, carousel, fullscreen, and picture-in-picture. Fullscreen is explicitly intended for rich maps, editing canvases and detailed browsing while the normal ChatGPT composer remains available.

### 2.3 Widget state is not durable system memory

`widgetState` belongs to one rendered UI instance. OpenAI explicitly says business data must remain server-authoritative. Therefore MondayID's state machine / memory / proof ledger cannot be replaced by client widget state.

### 2.4 Data and rendering should be decoupled

For non-trivial interactive apps, OpenAI recommends separating data/compute/mutation tools from render tools so the iframe does not remount on every tool call. This matches MondayID's intended split between cognition/world-state and manifestation.

### 2.5 Skills are progressive workflow memory

The model sees skill metadata first and loads the full `SKILL.md` when the request matches. Skills can package instructions, references, scripts, templates and assets. This is a much stronger fit for MondayID laws than a single giant always-loaded prompt.

### 2.6 Codex provides lifecycle hooks

Hooks exist around session, prompt, tool and subagent lifecycle events. Important events include:
- SessionStart / SessionEnd
- UserPromptSubmit
- PreToolUse / PostToolUse
- PermissionRequest
- PreCompact / PostCompact
- SubagentStart / SubagentStop
- Stop

PreToolUse can block or rewrite supported local/MCP tool calls. Stop and SubagentStop can force another focused pass. SessionStart can inject recovered context after startup/resume/compaction.

This is a native substrate for MondayID continuation, proof gates, mutation policy, drift detection and post-compaction recovery.

### 2.7 Subagents and Ultra already provide native parallel cognition

ChatGPT Work and Codex can run specialized subagents in parallel and collect their results. Ultra combines maximum supported reasoning with proactive task delegation. Parallel work is best suited to independent read-heavy exploration/tests/triage/summarization; parallel writes require coordination.

Therefore MondayID should NOT pretend to invent a second fake intelligence slider or duplicate the substrate. It should compile its cognition policy onto native model/reasoning/subagent controls when the host exposes them.

### 2.8 Sites is a real persistent public product surface

Current OpenAI Help Center documentation describes ChatGPT Sites as a public-beta environment for creating, previewing, publishing and sharing interactive websites/lightweight apps. Sites can persist beyond a Work chat, and availability depends on plan/region/workspace rollout.

This means a public MondayID web projection can be hosted inside the OpenAI ecosystem when Sites is available, while still keeping the core portable.

### 2.9 Current availability is not uniform across surfaces

Plugin / Work / Codex features differ across ChatGPT web, desktop, CLI, IDE and mobile. Current Learn documentation explicitly treats plugins as Work/Codex capabilities rather than a universal ordinary-chat/mobile surface. Mobile availability should therefore be capability-detected and re-verified at build/release time, not assumed.

---

## 3. Platform constraints that matter to MondayID

1. ChatGPT plugin UI is host-governed. It should cooperate with ChatGPT's composer and presentation grammar rather than imitate a complete alien operating system inside an iframe.
2. Durable canonical state must be server-side / external to widget state.
3. UI tools and mutation tools require accurate safety/side-effect annotations and server validation.
4. CSP and allowed domains are explicit; arbitrary network behavior cannot be assumed.
5. Capabilities vary by host. Code must feature-detect, not branch on a product-name fantasy.
6. Hooks are powerful but Codex-specific. They are not a universal runtime law by themselves.
7. Native subagents/Ultra are substrate. MondayID's value must be orchestration law, memory, state, proof, cognition compilation and cross-surface continuity, not simply 'more agents'.
8. Sites is promising but cannot be the sole owner of MondayID because account/region/runtime availability can change.

---

## 4. The key deduction: MondayID needs a Manifestation Compiler

The old question was wrong:

`Should MondayID be a website OR a ChatGPT app OR a Codex agent?`

The stronger architecture is:

```text
                         MONDAYID CORE
            state / memory / laws / world model / proof
                               |
                     COGNITIVE COMPILER
                               |
                  MANIFESTATION COMPILER
                               |
        +----------------------+----------------------+
        |                      |                      |
  ChatGPT projection      Sites projection       Codex projection
  host-native Matter      full public Matter     Work / build organism
  fullscreen + composer   web/mobile browser     skills + hooks + subagents
        |                      |                      |
        +----------------------+----------------------+
                               |
                      future native surfaces
```

Formal form:

`Representation_t = Compile(State_t, UserModel_t, Intent_t, HostCapabilities_t, HostConstraints_t)`

Host limitations become inputs to the compiler rather than reasons to fork the product identity.

---

## 5. What each surface should become

### ChatGPT projection

Primary role: conversational cognitive lens.

Use:
- interactive-decoupled React widget
- fullscreen for maps / causal structures / Matter spaces
- normal ChatGPT composer as universal language input
- inline/PiP only when they are semantically correct
- MCP Apps bridge first
- host-specific `window.openai` APIs only as capability-detected extensions

The visual language should encode MondayID semantics while respecting host constraints.

### Sites projection

Primary role: public standalone face and richer Matter laboratory.

Use:
- full branded visual grammar
- persistent public experience
- responsive web/mobile-browser design
- deeper navigation only where cognition requires it
- public demos and onboarding
- optional identity/persistence features supported by Sites

Sites is a production surface, not the source of truth.

### Codex projection

Primary role: MondayID Work / evolution / engineering metabolism.

Use:
- Skills to package laws and specialized workflows
- SessionStart for continuity recovery
- PreToolUse for mutation/risk gates
- PostToolUse for proof review
- Pre/PostCompact for state preservation/recovery
- SubagentStart/Stop for swarm lifecycle
- Stop/SubagentStop to require another pass when evidence is insufficient
- native model reasoning effort and Ultra/subagents as execution substrate

MondayID Work should compile policy into these primitives rather than duplicate them.

---

## 6. COGNITION_DEPTH revised

Previous presets FLOW / DEEP / FORGE / OMEGA remain useful, but they are now policy bundles rather than fictional IQ levels.

Example policy vector:

`D = {reasoning_effort, passes, worker_diversity, retrieval_breadth, alternative_models, adversarial_pressure, verification_depth, tool_budget, continuation_depth}`

Host compiler maps this vector to available substrate.

Examples:
- ChatGPT Work with Ultra: map OMEGA to Ultra + MondayID verification/recovery/proof policy.
- ChatGPT ordinary surface without subagents: keep MondayID state and UI, reduce parallelism, preserve proof law.
- Codex: map FORGE/OMEGA to hooks + skills + subagents + exact execution receipts.
- Standalone/Sites: use MondayID's own backend orchestration where host-native subagents are absent.

Thus MondayID never lies that it 'raised the model IQ'. It increases the amount and structure of cognition applied to the objective.

---

## 7. Unexpected combinations enabled by the docs

### A. Conversation-controlled living canvas

Fullscreen UI remains mounted while ChatGPT's composer stays available. Therefore a user can talk to the same visual state and have it morph without switching between 'chat mode' and 'app mode'. This is almost exactly the Matter UI interaction law.

### B. Interface selection becomes model context

A selection inside Matter UI can be pushed into model-visible context. The user's attention itself can therefore become an input to the next cognitive pass, without copying a giant screen state into prose.

### C. Same plugin, different nervous systems

The package can expose UI/MCP for ChatGPT and lifecycle hooks/skills for Codex. One installed object can manifest as a cognitive interface in one host and an engineering organism in another.

### D. The giant MondayID prompt can dissolve into a skill fabric

Core invariants remain tiny and always-on. Specialized laws activate progressively as skills only when relevant. This reduces context pollution and preserves more usable reasoning capacity.

### E. MondayID Work can become event-driven rather than prompt-driven in Codex

Hooks create native interception points around startup, compaction, tools, permissions and stopping. The Work loop can enforce continuation/proof where the host actually exposes lifecycle events instead of asking the model to remember to self-enforce every law.

---

## 8. Decision

Do NOT abandon the independent MondayID Core.
Do NOT make ChatGPT plugin UI the sole product.
Do NOT make Sites the owner of state.
Do NOT duplicate native Ultra/subagents with theatrical internal agents.

Build **one cognitive organism with multiple compiled manifestations**.

Canonical architecture:

`MONDAYID CORE -> COGNITIVE COMPILER -> MANIFESTATION COMPILER -> HOST PROJECTION`

This is now the preferred product architecture until contradicted by a stronger field test.

---

## 9. Next executable experiment

Build the smallest real `interactive-decoupled` MondayID plugin projection that proves all four at once:

1. one mounted fullscreen Matter surface,
2. one data tool that returns state/delta/evidence/uncertainty,
3. one UI interaction that calls a tool without remounting and updates model-visible focus,
4. durable state remains outside the widget and can be recovered in a later turn.

In parallel, keep the same state schema renderable by the public Sites/standalone projection.

Passing this experiment proves that MondayID is not trapped inside any one platform surface.
