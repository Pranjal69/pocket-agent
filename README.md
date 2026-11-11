# Pocket Agent

A small, reusable agent framework built from scratch in JavaScript. It calls a real Gemini model through its REST API and exposes ordinary JavaScript functions as tools. No agent framework, orchestration library, SDK, or runtime dependency is used.

The example is an inventory assistant that looks up fictional products, calculates quotes, checks stock, and remembers follow-up questions. **Coding agent used: OpenAI Codex.**

## Quick start

Requirements: Node.js 20.6 or newer and a Gemini Developer API key from [Google AI Studio](https://aistudio.google.com/api-keys). No `npm install` is needed.

1. Copy `.env.example` to `.env` and replace `replace-with-your-key` with your API key.
2. Run these commands from the repository root:

```sh
node --env-file=.env examples/inventory.js --demo
```

For interactive chat:

```sh
node --env-file=.env examples/inventory.js
```

Ask `Can we supply 5 USB-C docks? What is the total price?`, then `What about just 2 of those?`. Use `/reset` to clear memory and `/exit` to quit.

The default is `gemini-3.5-flash-lite`, a function-calling model with a listed free tier. Availability and quotas depend on your account; check [Google's pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite). Change `GEMINI_MODEL` in `.env` to use another supported Gemini model. The demo uses fictional data only.

Alternatively, set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` as environment variables and use `npm run demo` or `npm start`. These npm commands do not automatically load `.env`.

## Five capabilities

| Capability | Implementation |
| --- | --- |
| Bounded agent loop | The model chooses tools, receives their results, and continues until a final answer; defaults to six model calls and ten tool calls per run. |
| Typed tool registration | Explicit schemas describe tools to the model; runtime validation rejects missing, unknown, or incorrectly typed arguments before execution. |
| Conversation memory | Completed turns are retained in an agent instance, enabling follow-ups; `reset()` starts fresh. Failed turns are not committed. |
| Recoverable tool errors | Unknown tools, bad arguments, and handler errors are returned to the model as structured results so it can correct its next call. |
| Execution traces | A callback reports model/tool activity and failures; successful results include a trace and execution counts. |

## Create your own agent

Save this as `my-agent.js` in the repository root:

```js
import { Agent, Gemini, tool } from './src/index.js';

const agent = new Agent({
  model: new Gemini(),
  instructions: 'Use the multiply tool for multiplication. Answer briefly.',
  tools: [tool({
    name: 'multiply',
    description: 'Multiply two numbers accurately.',
    parameters: { a: { type: 'number' }, b: { type: 'number' } },
    execute: ({ a, b }) => a * b,
  })],
  onEvent: event => console.log(event),
});

const result = await agent.run('What is 19 times 23?');
console.log(result.text);
```

Run `node --env-file=.env my-agent.js`. A tool handler may be synchronous or async and should return JSON-serializable data. Supported argument types are `string`, `number`, `integer`, and `boolean`; every declared argument is required. Put domain constraints such as minimum quantity in the handler.

## Validate

```sh
node --test
node --env-file=.env scripts/live-check.js
```

The first command runs 11 deterministic offline tests using scripted model responses and a fake HTTP transport. It does **not** call an LLM. The second explicitly calls Gemini and checks real tool selection, quote results, and follow-up context. It consumes API quota and fails if credentials, quota, or model behavior prevent success.

Local status: **11 tests passed**. A Gemini key is configured in the ignored local `.env`. Live validation was attempted, but this coding session blocked outbound connections (`EACCES`) before the request reached Google. The key and live behavior remain unverified. There is no fallback that silently substitutes a fake model in the demo.

## Layout and submission

```text
src/                   Reusable agent loop, tool validation, Gemini adapter
examples/              Inventory agent, CLI, fictional catalog
tests/                 Focused offline tests
scripts/live-check.js  Explicit real-LLM integration check
docs/                  Architecture, development notes, recording guide
```

- [Architecture and tradeoffs](docs/ARCHITECTURE.md)
- [Development approach and validation](docs/DEVELOPMENT.md)
- [Under-five-minute recording guide](docs/DEMO.md)

The repository destination is pending. No internal SAP GitHub upload or video recording has been made. Once the destination is supplied, push these files to that repository and attach the recorded demo link. Do not commit `.env`; it is ignored.

## Troubleshooting

- `Set GEMINI_API_KEY`: populate `.env` and use `--env-file=.env`, or set the environment variable.
- HTTP 400/404: check your model name and its availability for the Gemini Developer API.
- HTTP 401/403: check the API key, project permissions, and regional availability.
- HTTP 429: wait and check the project's quota. The framework does not automatically retry or switch to paid models.
- Request timeout: check network access to `generativelanguage.googleapis.com`. `new Gemini({ timeoutMs: 120000 })` increases the default 60-second timeout.
- Step/call budget exceeded: the run stops with `RunLimitError`; review the trace or tool description before increasing the limits.

This is a proof of concept: memory is in-process, tools are trusted application code, and final model wording is not guaranteed. See the architecture notes for the deliberate limits.
