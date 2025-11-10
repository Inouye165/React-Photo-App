const logger = require('../../logger');

function normalizeToolCalls(rawCalls) {
  if (!rawCalls) return [];
  return rawCalls
    .map((call, idx) => {
      const id = call.id || call.tool_call_id || `call_${idx}`;
      const name = call.name || (call.function && call.function.name);
      if (!name) return null;
      const rawArgs = call.args ?? (call.function && call.function.arguments) ?? '{}';
      let parsedArgs;
      if (typeof rawArgs === 'string') {
        try {
          parsedArgs = rawArgs ? JSON.parse(rawArgs) : {};
        } catch {
          parsedArgs = rawArgs ? { query: rawArgs } : {};
        }
      } else {
        parsedArgs = rawArgs || {};
      }
      return {
        id,
        name,
        rawArgs: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs),
        parsedArgs
      };
    })
    .filter(Boolean);
}

async function invokeAgentWithTools(agent, initialMessages, tools = [], options = {}) {
  const history = Array.isArray(initialMessages) ? [...initialMessages] : [];
  const registry = new Map(tools.map(tool => [tool.name, tool]));
  const maxIterations = options.maxIterations || 4;

  for (let i = 0; i < maxIterations; i += 1) {
    const response = await agent.invoke(history);
    const rawToolCalls =
      response?.tool_calls ||
      response?.additional_kwargs?.tool_calls ||
      response?.kwargs?.tool_calls ||
      response?.kwargs?.additional_kwargs?.tool_calls;

    const toolCalls = normalizeToolCalls(rawToolCalls);

    if (!toolCalls.length) {
      return response;
    }

    history.push({
      role: 'assistant',
      content: response.content,
      tool_calls: toolCalls.map(call => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: call.rawArgs
        }
      }))
    });

    for (const call of toolCalls) {
      const tool = registry.get(call.name);
      if (!tool) {
        throw new Error(`Agent requested unsupported tool: ${call.name}`);
      }

      const result = await tool.invoke(call.parsedArgs);
      const resultPreview = typeof result === 'string' ? result : JSON.stringify(result);
      logger.debug('[AI Agent] Tool result', call.name, JSON.stringify({ args: call.parsedArgs, result: resultPreview.slice(0, 500) }));
      history.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: result
      });
    }
  }

  throw new Error('Agent exceeded maximum tool iterations');
}

module.exports = {
  normalizeToolCalls,
  invokeAgentWithTools,
};
