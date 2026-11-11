import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Gemini } from '../src/index.js';
import { createInventoryAgent } from './inventory-agent.js';

let agent;

async function ask(prompt) {
  console.log(`\nYou: ${prompt}`);
  const result = await agent.run(prompt);
  console.log(`\nAgent: ${result.text}\n(${result.steps} model calls, ${result.toolCalls} tool calls)`);
}

try {
  const model = new Gemini();
  agent = createInventoryAgent(model, event => console.log(`  [${event.type}] ${JSON.stringify(event)}`));
  console.log(`Pocket Agent | real Gemini model: ${model.model} | fictional inventory`);
  if (process.argv.includes('--demo')) {
    await ask('Can we supply 5 USB-C docks? What is the total price?');
    await ask('What about just 2 of those?');
  } else {
    const rl = createInterface({ input: stdin, output: stdout });
    console.log('Ask about inventory. /reset clears memory; /exit quits.');
    try {
      while (true) {
        const prompt = await rl.question('\n> ');
        if (prompt === '/exit') break;
        if (prompt === '/reset') { agent.reset(); console.log('Memory cleared.'); continue; }
        if (!prompt.trim()) continue;
        try { await ask(prompt); } catch (error) { console.error(error.message); }
      }
    } finally { rl.close(); }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
