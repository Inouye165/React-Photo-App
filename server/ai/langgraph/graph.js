
// LangGraph-based implementation
const { StateGraph, END } = require('@langchain/langgraph');
const { HumanMessage } = require('@langchain/core/messages');
const { openai } = require('../openaiClient');
const logger = require('../../logger');

// State schema: must match what service.js expects
// (see also server/ai/langgraph/state.js for zod schema)

// Node 1: classify_image
async function classify_image(state) {
	try {
		logger.info('[LangGraph] classify_image node invoked');
		const prompt =
			'Classify this image as one of the following categories: scenery, food, receipt, collectables, health data, or other. '
			+ 'Return ONLY a JSON object: {"classification": "..."}.';
		const msg = new HumanMessage({
			content: [
				{ type: 'text', text: prompt },
				{ type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'low' } }
			]
		});
		const response = await openai.chat.completions.create({
			model: 'gpt-4o',
			messages: [
				{ role: 'system', content: 'You are a helpful assistant for image classification.' },
				{ role: 'user', content: msg.content },
			],
			max_tokens: 64,
			response_format: { type: 'json_object' },
		});
		let parsed;
		try {
			parsed = JSON.parse(response.choices[0].message.content);
		} catch (e) {
			logger.error('[LangGraph] classify_image: Failed to parse model response', e);
			return { ...state, error: 'Failed to parse classification response: ' + e.message };
		}
		logger.info('[LangGraph] classify_image: Model classified as', parsed.classification);
		return { ...state, classification: parsed.classification, error: null };
	} catch (err) {
		logger.error('[LangGraph] classify_image: Error', err);
		return { ...state, error: err.message || String(err) };
	}
}

// Node 2: generate_metadata
async function generate_metadata(state) {
	try {
		logger.info('[LangGraph] generate_metadata node invoked');
		const prompt =
			`You are a photo archivist. Given the image and the following context, generate a JSON object with three fields:\n` +
			`caption: A short, one-sentence title for the photo.\n` +
			`description: A detailed, multi-sentence paragraph describing the visual contents.\n` +
			`keywords: A comma-separated string that begins with the classification provided (${state.classification}) followed by 4-9 descriptive keywords. After the descriptive keywords, append explicit metadata keywords for capture date, capture time, facing direction, GPS coordinates, and altitude. Use the formats date:YYYY-MM-DD, time:HH:MM:SSZ, direction:<cardinal or degrees>, gps:<latitude,longitude>, altitude:<value>m. When a value is missing, use date:unknown, time:unknown, direction:unknown, gps:unknown, or altitude:unknown.\n` +
			`\nContext:\n` +
			`classification: ${state.classification}\n` +
			`metadata: ${JSON.stringify(state.metadata)}\n` +
			`gps: ${state.gpsString}\n` +
			`device: ${state.device}\n` +
			`\nReturn ONLY a JSON object: {"caption": "...", "description": "...", "keywords": "..."}`;
		const msg = new HumanMessage({
			content: [
				{ type: 'text', text: prompt },
				{ type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'high' } }
			]
		});
		const response = await openai.chat.completions.create({
			model: 'gpt-4o',
			messages: [
				{ role: 'system', content: 'You are a helpful assistant for photo metadata extraction.' },
				{ role: 'user', content: msg.content },
			],
			max_tokens: 512,
			response_format: { type: 'json_object' },
		});
		let parsed;
		try {
			parsed = JSON.parse(response.choices[0].message.content);
		} catch (e) {
			logger.error('[LangGraph] generate_metadata: Failed to parse model response', e);
			return { ...state, error: 'Failed to parse metadata response: ' + e.message };
		}
		logger.info('[LangGraph] generate_metadata: Model returned metadata');
		return { ...state, finalResult: parsed, error: null };
	} catch (err) {
		logger.error('[LangGraph] generate_metadata: Error', err);
		return { ...state, error: err.message || String(err) };
	}
}


// Build the LangGraph workflow with the correct state schema
const { AppState } = require('./state');
const workflow = new StateGraph(AppState);

workflow.addNode('classify_image', classify_image);
workflow.addNode('generate_metadata', generate_metadata);

workflow.setEntryPoint('classify_image');
workflow.addConditionalEdges('classify_image', (state) => state.error ? END : 'generate_metadata');
workflow.addEdge('generate_metadata', END);

const app = workflow.compile();
module.exports = { app };
