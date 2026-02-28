const { graphChannels } = require('./server/ai/langgraph/state');
console.log('Graph Channels Keys:', Object.keys(graphChannels));
console.log('Collectible ID Channel:', graphChannels.collectible_id);
