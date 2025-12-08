const { StateGraph, END } = require('@langchain/langgraph');

const classify_image = async (state) => {
    console.log('Mock classify_image called', state);
    return { test: 'updated' };
};

describe('LangGraph State Flow - Collectibles', () => {
  let app;

  beforeEach(() => {
    const workflow = new StateGraph({
      channels: {
        test: {
            value: (x, y) => y ?? x,
            default: () => "default"
        }
      }
    });

    workflow.addNode('classify_image', classify_image);
    workflow.setEntryPoint('classify_image');
    workflow.addEdge('classify_image', END);

    app = workflow.compile();
  });

  test('Simple graph run', async () => {
    const initialState = {
      test: 'initial'
    };

    try {
        console.log('Invoking graph...');
        const result = await app.invoke(initialState);
        console.log('Final Result Keys:', Object.keys(result));
        console.log('Result:', result);
    } catch (e) {
        console.error('Graph execution failed:', e);
        throw e;
    }
  });
});
