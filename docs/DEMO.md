# Screen-recorded demo guide (target: 4 minutes)

This is a recording script, not a recorded video. Run the live check successfully before recording. Set up `.env` before sharing the screen and keep it closed during recording.

## Preparation

Open the repository in your editor with `README.md`, `src/agent.js`, and `examples/inventory-agent.js` available. Open a terminal at the repository root. Use your normal screen recorder to capture the editor and terminal, with microphone narration. No slides or editing are needed.

Run once before the recording:

```sh
node --test
node --env-file=.env scripts/live-check.js
```

## 0:00–0:35 — Explain the goal

Show the README and say:

> I built Pocket Agent, a small reusable JavaScript framework using real Gemini function calling. There are no external dependencies or agent frameworks. The example answers inventory questions from a fictional catalog. I used OpenAI Codex to implement and validate the proof of concept.

## 0:35–1:20 — Explain the framework

Show `src/agent.js` and the architecture diagram:

> The loop sends conversation history and tool schemas to Gemini. If the model asks for tools, the framework validates the arguments, runs registered handlers, and sends the results back. A final answer completes the turn. The five capabilities are bounded execution, typed tools, conversation memory, recoverable tool errors, and execution traces.

Point to the step limit, tool invocation, and history commit. Mention that failed turns do not commit memory, although external tool side effects cannot be undone.

## 1:20–1:50 — Show the example agent

Show `examples/inventory-agent.js`:

> An application supplies instructions and ordinary tool functions. This agent has two: list products and quote an order. The quote tool calculates with integer cents and checks stock. The model decides what to call and explains the result. No order is placed.

## 1:50–3:10 — Run the real model

In the terminal:

```sh
node --env-file=.env examples/inventory.js --demo
```

The two prompts run sequentially. Point out `model_start`, `tool_start`, and `tool_end` events, then inspect the final responses.

Expected **facts**, not exact wording:

| Question | Facts the answer should convey |
| --- | --- |
| Can we supply 5 USB-C docks? What is the total price? | EUR 475 total, only 3 in stock, cannot fulfill all 5. |
| What about just 2 of those? | The same USB-C dock, EUR 190 total, enough stock for 2. |

> The follow-up does not repeat the SKU. Conversation memory lets Gemini resolve “those” from the earlier turn. The visible trace shows actual tool calls, not just a generated answer.

Allow up to 80 seconds for the live portion. If API latency makes the recording exceed five minutes, re-record a shorter introduction after a successful run; do not present offline fixture output as a live call.

## 3:10–4:00 — Validation and tradeoffs

Run `node --test` and show the results.

> The focused tests cover error feedback, memory, execution limits, and the Gemini transport. Offline tests use fixtures; the demonstration uses real Gemini. I deliberately omitted persistence, parallel execution, and deployment to keep the design understandable within the assignment's scope. The next improvements would depend on an actual use case, starting with tool deadlines and bounded history.

Stop recording. Check that the video is under five minutes, the terminal text is readable, and the key is not visible. Upload the recording to the internal sharing location used for the assignment and include the link with the repository submission.
