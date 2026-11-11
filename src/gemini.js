// This adapter translates the framework's messages to Gemini's native REST API.
export class Gemini {
  constructor({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    timeoutMs = 60_000, fetchImpl = fetch } = {}) {
    if (!apiKey) throw new Error('Set GEMINI_API_KEY before running the agent');
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async chat({ messages, tools }) {
    const contents = [];
    for (const message of messages.filter(m => m.role !== 'system')) {
      if (message.role === 'assistant') {
        // Preserve complete model parts, including opaque thought signatures.
        contents.push({ role: 'model', parts: message.providerParts ?? [{ text: message.content }] });
      } else if (message.role === 'tool') {
        const functionResponse = { name: message.tool_name, response: JSON.parse(message.content) };
        if (message.tool_call_id) functionResponse.id = message.tool_call_id;
        const previous = contents.at(-1);
        if (previous?.parts[0]?.functionResponse) previous.parts.push({ functionResponse });
        else contents.push({ role: 'user', parts: [{ functionResponse }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: message.content }] });
      }
    }
    const declarations = tools.map(({ function: fn }) => {
      const { additionalProperties, ...parameters } = fn.parameters;
      return { name: fn.name, description: fn.description,
        ...(Object.keys(parameters.properties).length ? { parameters } : {}) };
    });
    let response;
    try {
      response = await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n') }] },
          contents,
          ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : {}),
          generationConfig: { temperature: 0, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error('Gemini request failed or timed out. Check network access and try again.');
    }
    if (!response.ok) {
      const hints = { 400: 'Check the model name and request schema.', 401: 'Check GEMINI_API_KEY.',
        403: 'Check API key permissions and regional availability.', 404: 'Check GEMINI_MODEL.',
        429: 'Quota exceeded. Wait before retrying or check your Gemini quota.' };
      throw new Error(`Gemini HTTP ${response.status}. ${hints[response.status] || 'Try again later.'}`);
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.length || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
      throw new Error(`Gemini did not complete a response (${candidate?.finishReason || data.promptFeedback?.blockReason || 'no candidate'})`);
    }
    const parts = candidate.content.parts;
    return {
      role: 'assistant',
      content: parts.filter(p => p.text && !p.thought).map(p => p.text).join(''),
      tool_calls: parts.filter(p => p.functionCall).map(p => ({
        ...(p.functionCall.id ? { id: p.functionCall.id } : {}),
        function: { name: p.functionCall.name, arguments: p.functionCall.args ?? {} },
      })),
      providerParts: structuredClone(parts),
    };
  }
}
