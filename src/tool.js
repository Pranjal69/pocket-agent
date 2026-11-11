// Deliberately small schema subset: required, flat primitive arguments only.
const types = new Set(['string', 'number', 'integer', 'boolean']);

export function tool({ name, description, parameters = {}, execute }) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || !description || typeof execute !== 'function') {
    throw new TypeError('A tool needs a valid name, description, and execute function');
  }
  const properties = structuredClone(parameters);
  for (const [key, spec] of Object.entries(properties)) {
    if (!types.has(spec.type)) throw new TypeError(`Unsupported type for ${key}`);
  }
  return {
    name,
    schema: {
      type: 'function',
      function: { name, description, parameters: {
        type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
      } },
    },
    async invoke(args) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new TypeError('Arguments must be an object');
      }
      for (const key of Object.keys(args)) {
        if (!Object.hasOwn(properties, key)) throw new TypeError(`Unknown argument: ${key}`);
      }
      for (const [key, spec] of Object.entries(properties)) {
        if (!Object.hasOwn(args, key)) throw new TypeError(`Missing argument: ${key}`);
        const value = args[key];
        const valid = spec.type === 'integer' ? Number.isSafeInteger(value)
          : typeof value === spec.type && (spec.type !== 'number' || Number.isFinite(value));
        if (!valid) throw new TypeError(`${key} must be ${spec.type}`);
      }
      return execute(args);
    },
  };
}
