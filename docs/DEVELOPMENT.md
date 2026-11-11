# Development approach

**Coding agent used: OpenAI Codex.** Codex inspected the workspace, implemented the framework and example, consulted provider documentation, wrote focused tests, and ran validation. This document describes the work actually performed rather than a proposed process.

## How the solution evolved

1. Started from an empty workspace and reduced the assignment to five capabilities: bounded execution, typed tools, memory, tool-error recovery, and traces. Chose a read-only inventory example to make model decisions and deterministic calculations easy to demonstrate.
2. Initially considered Python and local Ollama. The environment had no working Python installation and blocked runtime downloads. Switched to dependency-free JavaScript using the available Node runtime.
3. After the user selected Gemini, replaced the Ollama transport with a Gemini REST adapter. Kept the orchestration code independent of the provider. Checked Google's documentation for function calls, preserved response parts and call IDs, and selected a configurable free-tier model.
4. Implemented the smallest complete loop, then added argument validation, error feedback, bounded execution, memory commit behavior, and trace callbacks. Kept business calculations in example tools rather than in the framework.
5. Validated success and failure paths with deterministic model responses and a fake HTTP transport. Added a separate opt-in live check so offline tests cannot be mistaken for real LLM validation.

The user supplied the assignment, chose Gemini, and deferred the GitHub destination. Codex handled the implementation and local checks. No existing agent framework or orchestration package was used, and no subagents were used.

## Validation performed

The 11 tests in `tests/framework.test.js` passed in an isolated Node process launched through Codex's available Node runtime. The standard `node --test` command runs the same tests on a normal Node installation.

Coverage focuses on behavior that can break the agent loop:

- A real tool handler's result reaches the next model request; completed turns and reset behave correctly.
- Invalid arguments, unknown tools, and handler exceptions produce feedback that allows another model step.
- Model-step exhaustion preserves prior memory, while oversized tool batches execute no tools.
- Overlapping runs are rejected; observer failures do not interrupt execution.
- Inventory totals and availability are correct for five and two docks.
- Gemini requests preserve opaque signatures, group function responses, and retain call IDs.
- Quota errors and truncated model responses fail explicitly.

The offline model replies are scripted fixtures, not LLM-generated evidence. The user subsequently supplied a Gemini API key, which was saved to the ignored local `.env`. The live integration check was attempted but failed before reaching Google: outbound network access in the coding session returned `EACCES`. The key and live demo therefore remain unverified. `scripts/live-check.js` is ready to run from a terminal with network access; it asserts that Gemini uses the quote tool for both the initial question and a contextual follow-up.

## Remaining submission steps

1. Run the live check from a terminal with network access using the configured `.env`. Inspect the final wording as well as the tool results.
2. Record the short demo using `docs/DEMO.md`; no video has been generated yet.
3. Push to the internal SAP GitHub repository when its URL is supplied, and share the video link.

These external steps are explicitly pending; the local test pass does not imply that the assignment has already been submitted.
