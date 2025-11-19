// LangGraph-based implementation
// C:\Users\Ron\React-Photo-App\server\ai\langgraph\graph.js
const { StateGraph, END } = require('@langchain/langgraph');
// We need HumanMessage AND SystemMessage
const logger = require('../../logger');
const { AppState } = require('./state');
// Node implementations
const classify_image = require('./nodes/classify_image');
const generate_metadata = require('./nodes/generate_metadata');
const handle_collectible = require('./nodes/handle_collectible');
const location_intelligence_agent = require('./nodes/location_intelligence_agent');
const decide_scene_label = require('./nodes/decide_scene_label');
const food_location_agent = require('./nodes/food_location_agent');
const food_metadata_agent = require('./nodes/food_metadata_agent');
const collect_context = require('./nodes/collect_context');
// Node food_metadata_agent -> implemented in ./nodes/food_metadata_agent.js

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
  // Use the Zod schema from your state.js for validation
  channels: AppState.shape, // <-- This fix was correct
});

// 1. Add all the nodes
workflow.addNode('classify_image', classify_image);
workflow.addNode('generate_metadata', generate_metadata);
workflow.addNode('handle_collectible', handle_collectible);
workflow.addNode('location_intelligence_agent', location_intelligence_agent);
workflow.addNode('decide_scene_label', decide_scene_label);
workflow.addNode('food_location_agent', food_location_agent);
workflow.addNode('food_metadata_agent', food_metadata_agent);
workflow.addNode('collect_context', collect_context);

// 2. Set the entry point
workflow.setEntryPoint('classify_image');

// 3. Wire the flow: classification -> location intelligence -> rest
// Insert a short-circuit node that collects POI once per image and caches it.
workflow.addEdge('classify_image', 'collect_context');
workflow.addEdge('collect_context', 'location_intelligence_agent');

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
workflow.addEdge('handle_collectible', END);
workflow.addEdge('decide_scene_label', 'generate_metadata');
workflow.addEdge('food_location_agent', 'food_metadata_agent');
workflow.addEdge('food_metadata_agent', END);

// 5. Compile the app
const app = workflow.compile();
module.exports = { app, __testing: { food_location_agent, food_metadata_agent, location_intelligence_agent } };
// Export the collect_context node for unit testing
module.exports.__testing.collect_context = collect_context;