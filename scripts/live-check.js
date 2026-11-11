// Opt-in integration check: this actually calls Gemini and consumes API quota.
import assert from 'node:assert/strict';
import { Gemini } from '../src/index.js';
import { createInventoryAgent } from '../examples/inventory-agent.js';

try {
  const agent = createInventoryAgent(new Gemini(), e => console.log(JSON.stringify(e)));
  const first = await agent.run('Use the tools to check whether we can supply 5 USB-C docks and quote the total.');
  console.log(first.text);
  assert.ok(first.trace.some(e => e.type === 'tool_end' && e.name === 'quote_order'), 'Expected a completed quote tool call');
  const firstQuote = JSON.parse(agent.messages.filter(m => m.role === 'tool' && m.tool_name === 'quote_order').at(-1).content).result;
  assert.equal(firstQuote.sku, 'DOCK-01');
  assert.equal(firstQuote.quantity, 5);
  assert.equal(firstQuote.totalCents, 47500);
  assert.equal(firstQuote.canFulfill, false);
  const second = await agent.run('What about 2 of those? Use the quote tool again.');
  console.log(second.text);
  const quote = agent.messages.filter(m => m.role === 'tool' && m.tool_name === 'quote_order').at(-1);
  const result = JSON.parse(quote.content).result;
  assert.equal(result.sku, 'DOCK-01');
  assert.equal(result.quantity, 2);
  assert.equal(result.totalCents, 19000);
  assert.equal(result.canFulfill, true);
  assert.ok(second.trace.some(e => e.type === 'tool_end' && e.name === 'quote_order'));
  console.log('LIVE CHECK PASSED: real Gemini tool use and follow-up context verified.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
