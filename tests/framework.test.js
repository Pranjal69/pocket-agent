import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent, RunLimitError, tool, Gemini } from '../src/index.js';
import { createInventoryAgent } from '../examples/inventory-agent.js';

const answer = text => ({ role: 'assistant', content: text });
const call = (name, args = {}) => ({ role: 'assistant', tool_calls: [{ function: { name, arguments: args } }] });
function scripted(...responses) {
  const requests = [];
  return { requests, async chat(request) {
    requests.push(structuredClone(request));
    const response = responses.shift();
    if (!response) throw new Error('Script exhausted');
    return response;
  } };
}
const square = tool({ name: 'square', description: 'Square a number',
  parameters: { n: { type: 'number' } }, execute: ({ n }) => n * n });

test('executes a tool, sends its result to the model, and remembers completed turns', async () => {
  const model = scripted(call('square', { n: 3 }), answer('9'), answer('The earlier result was 9'));
  const events = [];
  const agent = new Agent({ model, instructions: 'Be helpful', tools: [square], onEvent: e => events.push(e.type) });
  const result = await agent.run('Square 3');
  assert.equal(result.text, '9');
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(JSON.parse(model.requests[1].messages.at(-1).content), { ok: true, result: 9 });
  assert.deepEqual(events, ['model_start', 'tool_start', 'tool_end', 'model_start', 'run_end']);
  const copy = agent.messages;
  copy[0].content = 'Mutated';
  assert.equal(agent.messages[0].content, 'Be helpful');
  await agent.run('What was it?');
  assert.ok(model.requests[2].messages.some(m => m.content === '9'));
  agent.reset();
  assert.equal(agent.messages.length, 1);
});

test('rejects invalid arguments before execution and lets the model repair them', async () => {
  const model = scripted(call('square', { n: '3' }), call('square', { n: 3 }), answer('9'));
  const agent = new Agent({ model, instructions: '', tools: [square] });
  const result = await agent.run('Square 3');
  assert.equal(JSON.parse(model.requests[1].messages.at(-1).content).ok, false);
  assert.equal(result.toolCalls, 2);
  assert.ok(result.trace.some(e => e.type === 'tool_error'));
});

test('unknown tools and tool exceptions become model-visible errors', async () => {
  const broken = tool({ name: 'broken', description: 'Fails', execute: () => { throw new Error('Unavailable'); } });
  const model = scripted(call('missing'), call('broken'), answer('Unable to complete'));
  const result = await new Agent({ model, instructions: '', tools: [broken] }).run('Try it');
  assert.equal(result.trace.filter(e => e.type === 'tool_error').length, 2);
  assert.match(model.requests[2].messages.at(-1).content, /Unavailable/);
});

test('schema validation rejects missing, extra, boolean-as-number, and fractional integers', async () => {
  for (const args of [{}, { n: 2, extra: 1 }, { n: true }, { n: NaN }, []]) {
    await assert.rejects(square.invoke(args), TypeError);
  }
  const integer = tool({ name: 'integer', description: 'Integer', parameters: { n: { type: 'integer' } }, execute: () => 1 });
  await assert.rejects(integer.invoke({ n: 1.5 }), TypeError);
});

test('step exhaustion discards the incomplete conversation', async () => {
  const agent = new Agent({ model: scripted(call('square', { n: 2 })), instructions: '', tools: [square], maxSteps: 1 });
  await assert.rejects(agent.run('Keep going'), RunLimitError);
  assert.equal(agent.messages.length, 1);
});

test('call budget rejects a whole batch before any tool runs', async () => {
  let executions = 0;
  const count = tool({ name: 'count', description: 'Count', execute: () => ++executions });
  const batch = call('count');
  batch.tool_calls.push(...call('count').tool_calls);
  const agent = new Agent({ model: scripted(batch), instructions: '', tools: [count], maxToolCalls: 1 });
  await assert.rejects(agent.run('Go'), RunLimitError);
  assert.equal(executions, 0);
});

test('model failure unlocks the agent and preserves prior memory', async () => {
  const model = scripted(answer('First'));
  const agent = new Agent({ model, instructions: '' });
  await agent.run('Hello');
  const before = agent.messages;
  await assert.rejects(agent.run('Again'), /Script exhausted/);
  assert.deepEqual(agent.messages, before);
  agent.reset();
});

test('rejects overlapping runs and tolerates observer failures', async () => {
  let finish;
  const model = { chat: () => new Promise(resolve => { finish = resolve; }) };
  const agent = new Agent({ model, instructions: '', onEvent: () => { throw new Error('Logger failed'); } });
  const first = agent.run('First');
  await assert.rejects(agent.run('Second'), /one run/);
  assert.throws(() => agent.reset(), /during a run/);
  finish(answer('Done'));
  assert.equal((await first).text, 'Done');
});

test('inventory example computes exact cents and stock availability', async () => {
  const model = scripted(call('list_products'), call('quote_order', { sku: 'DOCK-01', quantity: 5 }), answer('475 EUR; only 3 available'),
    call('quote_order', { sku: 'DOCK-01', quantity: 2 }), answer('190 EUR; available'));
  const agent = createInventoryAgent(model);
  await agent.run('Quote 5 docks');
  const firstQuote = JSON.parse(model.requests[2].messages.at(-1).content).result;
  assert.equal(firstQuote.totalCents, 47500);
  assert.equal(firstQuote.canFulfill, false);
  await agent.run('What about 2?');
  const secondQuote = JSON.parse(model.requests[4].messages.at(-1).content).result;
  assert.equal(secondQuote.totalCents, 19000);
  assert.equal(secondQuote.canFulfill, true);
});

test('Gemini adapter preserves signatures and groups parallel function responses', async () => {
  const requests = [];
  const parts = [
    { functionCall: { name: 'square', args: { n: 2 }, id: 'a' }, thoughtSignature: 'opaque-signature' },
    { functionCall: { name: 'square', args: { n: 3 }, id: 'b' } },
  ];
  const model = new Gemini({ apiKey: 'test-only', fetchImpl: async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts:
      requests.length === 1 ? parts : [{ text: '4 and 9' }] } }] }) };
  } });
  const result = await new Agent({ model, instructions: 'Calculate', tools: [square] }).run('Square 2 and 3');
  assert.equal(result.text, '4 and 9');
  assert.deepEqual(requests[1].body.contents[1].parts, parts);
  assert.deepEqual(requests[1].body.contents[2].parts.map(p => p.functionResponse.id), ['a', 'b']);
  assert.equal(requests[1].body.contents[2].parts[1].functionResponse.response.result, 9);
  assert.equal(requests[0].headers['x-goog-api-key'], 'test-only');
  assert.equal(requests[0].body.tools[0].functionDeclarations[0].parameters.additionalProperties, undefined);
});

test('Gemini surfaces quota and truncated responses without returning a false success', async () => {
  const quota = new Gemini({ apiKey: 'test-only', fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(quota.chat({ messages: [], tools: [] }), /Quota exceeded/);
  const truncated = new Gemini({ apiKey: 'test-only', fetchImpl: async () => ({ ok: true, json: async () => ({
    candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Incomplete' }] } }],
  }) }) });
  await assert.rejects(truncated.chat({ messages: [], tools: [] }), /MAX_TOKENS/);
});
