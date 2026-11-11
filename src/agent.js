export class RunLimitError extends Error {}

export class Agent {
  #history;
  #busy = false;
  #tools;

  constructor({ model, instructions, tools = [], maxSteps = 6, maxToolCalls = 10, onEvent = () => {} }) {
    if (!model || typeof model.chat !== 'function' || typeof instructions !== 'string') {
      throw new TypeError('Provide a model with chat() and string instructions');
    }
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || !Number.isSafeInteger(maxToolCalls) || maxToolCalls < 0) {
      throw new TypeError('Limits must be integers: maxSteps >= 1, maxToolCalls >= 0');
    }
    this.#tools = new Map(tools.map(t => [t.name, t]));
    if (this.#tools.size !== tools.length) throw new TypeError('Duplicate tool name');
    this.model = model;
    this.maxSteps = maxSteps;
    this.maxToolCalls = maxToolCalls;
    this.onEvent = onEvent;
    this.#history = [{ role: 'system', content: instructions }];
  }

  get messages() { return structuredClone(this.#history); }

  reset() {
    if (this.#busy) throw new Error('Cannot reset an agent during a run');
    this.#history = this.#history.slice(0, 1);
  }

  async run(prompt) {
    if (this.#busy) throw new Error('An agent supports one run at a time');
    if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Prompt must be nonempty');
    this.#busy = true;
    const trace = [];
    const emit = (type, details = {}) => {
      const event = { type, ...details };
      trace.push(structuredClone(event));
      // Observability must not change execution if a consumer's logger fails.
      try { this.onEvent(structuredClone(event)); } catch { /* best-effort observer */ }
    };
    // Commit memory only after a completed turn; tool side effects cannot be rolled back.
    const messages = [...this.messages, { role: 'user', content: prompt }];
    let toolCalls = 0;
    try {
      for (let step = 1; step <= this.maxSteps; step++) {
        emit('model_start', { step });
        const message = await this.model.chat({
          messages: structuredClone(messages),
          tools: [...this.#tools.values()].map(t => structuredClone(t.schema)),
        });
        if (!message || message.role !== 'assistant' ||
            (message.tool_calls !== undefined && !Array.isArray(message.tool_calls))) {
          throw new Error('Invalid model response');
        }
        const calls = message.tool_calls ?? [];
        if (calls.length === 0) {
          if (typeof message.content !== 'string' || !message.content.trim()) {
            throw new Error('Model returned an empty final answer');
          }
          messages.push(structuredClone(message));
          this.#history = messages;
          emit('run_end', { steps: step, toolCalls });
          return { text: message.content, steps: step, toolCalls, trace };
        }
        if (toolCalls + calls.length > this.maxToolCalls) {
          throw new RunLimitError(`Tool call budget exceeded (${this.maxToolCalls})`);
        }
        // Validate the batch before executing any of its tools.
        for (const call of calls) {
          if (!call?.function || typeof call.function.name !== 'string') {
            throw new Error('Malformed tool call');
          }
        }
        messages.push(structuredClone(message));
        for (const call of calls) {
          const { name, arguments: args } = call.function;
          toolCalls++;
          emit('tool_start', { name, args });
          let content;
          try {
            const registered = this.#tools.get(name);
            if (!registered) throw new Error(`Unknown tool: ${name}`);
            const result = await registered.invoke(args);
            content = JSON.stringify({ ok: true, result });
            emit('tool_end', { name });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            content = JSON.stringify({ ok: false, error: reason });
            emit('tool_error', { name, error: reason });
          }
          messages.push({ role: 'tool', tool_name: name, content,
            ...(call.id ? { tool_call_id: call.id } : {}) });
        }
      }
      throw new RunLimitError(`Model step budget exceeded (${this.maxSteps})`);
    } catch (error) {
      emit('run_error', { error: error.message });
      throw error;
    } finally {
      this.#busy = false;
    }
  }
}
