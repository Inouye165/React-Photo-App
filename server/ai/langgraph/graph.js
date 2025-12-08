// LangGraph-based implementation
// C:\Users\Ron\React-Photo-App\server\ai\langgraph\graph.js
const { StateGraph, END } = require('@langchain/langgraph');
// We need HumanMessage AND SystemMessage
const logger = require('../../logger');
const { graphChannels } = require('./state');
const auditLogger = require('./audit_logger');
const context = require('./context');

// Node implementations
const classify_image = require('./nodes/classify_image');
const generate_metadata = require('./nodes/generate_metadata');
const handle_collectible = require('./nodes/handle_collectible');
const describe_collectible = require('./nodes/describe_collectible');
const location_intelligence_agent = require('./nodes/location_intelligence_agent');
const decide_scene_label = require('./nodes/decide_scene_label');
const food_location_agent = require('./nodes/food_location_agent');
const food_metadata_agent = require('./nodes/food_metadata_agent');
const collect_context = require('./nodes/collect_context');
// Sprint 1 Nodes
const identify_collectible = require('./nodes/identify_collectible');
const valuate_collectible = require('./nodes/valuate_collectible');
// Node food_metadata_agent -> implemented in ./nodes/food_metadata_agent.js

function wrapNode(name, nodeFn, filePath) {
  return async (state) => {
    const runId = state.runId || 'unknown-run-id';
    auditLogger.logNodeStart(runId, name, state, filePath);
    return context.run({ runId, nodeName: name }, async () => {
      try {
        const result = await nodeFn(state);
        auditLogger.logNodeEnd(runId, name, result);
        return result;
      } catch (error) {
        auditLogger.logNodeEnd(runId, name, { error: error.message });
        throw error;
      }
    });
  };
}

// --- Router: Decides next node after collect_context ---
function route_after_context(state) {
  if (state.error) return END;
  const classification = String(state.classification || '').toLowerCase().trim();
  
  if (classification === 'collectables') {
    logger.info('[LangGraph] Router: Fast-tracking collectible');
    return 'identify_collectible';
  }
  
  return 'location_intelligence_agent';
}

// --- Router: Decides next node after the location intelligence agent ---
function route_after_location(state) {
  if (state.error) {
    logger.error('[LangGraph] Router: Error detected, ending graph.', state.error);
    return END;
  }

  const classification = String(state.classification || '').toLowerCase().trim();
  logger.info(`[LangGraph] Router: Routing after location intel for "${classification}"`);

  if (classification === 'collectables') {
    return 'handle_collectible';
  }

  if (classification === 'food') {
    return 'food_location_agent';
  }

  if (needPoi(state) && (classification === 'scenery' || classification.includes('scenery'))) {
    return 'decide_scene_label';
  }

  return 'generate_metadata';
}

function needPoi(state) {
  if (!state) return false;
  return Boolean(state.poiAnalysis?.gpsString);
}

// --- Build the LangGraph workflow ---
const workflow = new StateGraph({
  // Use explicit channels with reducers defined in state.js
  channels: graphChannels,
});

// 1. Add all the nodes
workflow.addNode('classify_image', wrapNode('classify_image', classify_image, require.resolve('./nodes/classify_image')));
workflow.addNode('generate_metadata', wrapNode('generate_metadata', generate_metadata, require.resolve('./nodes/generate_metadata')));
workflow.addNode('handle_collectible', wrapNode('handle_collectible', handle_collectible, require.resolve('./nodes/handle_collectible')));
workflow.addNode('describe_collectible', wrapNode('describe_collectible', describe_collectible, require.resolve('./nodes/describe_collectible')));
workflow.addNode('location_intelligence_agent', wrapNode('location_intelligence_agent', location_intelligence_agent, require.resolve('./nodes/location_intelligence_agent')));
workflow.addNode('decide_scene_label', wrapNode('decide_scene_label', decide_scene_label, require.resolve('./nodes/decide_scene_label')));
workflow.addNode('food_location_agent', wrapNode('food_location_agent', food_location_agent, require.resolve('./nodes/food_location_agent')));
workflow.addNode('food_metadata_agent', wrapNode('food_metadata_agent', food_metadata_agent, require.resolve('./nodes/food_metadata_agent')));
workflow.addNode('collect_context', wrapNode('collect_context', collect_context, require.resolve('./nodes/collect_context')));
// Sprint 1 Nodes
workflow.addNode('identify_collectible', wrapNode('identify_collectible', identify_collectible, require.resolve('./nodes/identify_collectible')));
workflow.addNode('valuate_collectible', wrapNode('valuate_collectible', valuate_collectible, require.resolve('./nodes/valuate_collectible')));

// 2. Set the entry point
workflow.setEntryPoint('classify_image');

// 3. Wire the flow: classification -> location intelligence -> rest
// Insert a short-circuit node that collects POI once per image and caches it.
workflow.addEdge('classify_image', 'collect_context');

// Sprint 1: Conditional routing after collect_context
workflow.addConditionalEdges(
  'collect_context',
  route_after_context,
  {
    identify_collectible: 'identify_collectible',
    location_intelligence_agent: 'location_intelligence_agent',
    __end__: END
  }
);

workflow.addConditionalEdges(
  'location_intelligence_agent',
  route_after_location,
  {
    generate_metadata: 'generate_metadata',
    decide_scene_label: 'decide_scene_label',
    handle_collectible: 'handle_collectible',
    food_location_agent: 'food_location_agent',
    __end__: END,
  }
);

// 4. Add the final edges
workflow.addEdge('generate_metadata', END);
workflow.addEdge('handle_collectible', 'describe_collectible');
workflow.addEdge('describe_collectible', END);
workflow.addEdge('decide_scene_label', 'generate_metadata');
workflow.addEdge('food_location_agent', 'food_metadata_agent');
workflow.addEdge('food_metadata_agent', END);

// Sprint 1 Edges
workflow.addEdge('identify_collectible', 'valuate_collectible');
workflow.addEdge('valuate_collectible', 'describe_collectible');

// 5. Compile the app
const app = workflow.compile();
module.exports = { app, __testing: { food_location_agent, food_metadata_agent, location_intelligence_agent, route_after_context } };
// Export the collect_context node for unit testing
module.exports.__testing.collect_context = collect_context;