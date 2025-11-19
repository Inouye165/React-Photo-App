const logger = require('../../../logger');
const { openai } = require('../../openaiClient');
const { metadataPayloadWithDirection, extractTimestamp, ensureRestaurantInDescription, parseNumber, accumulateDebugUsage, extractUsageFromResponse } = require('../utils');
const { fetchDishNutrition } = require('../../food/nutritionSearch');

async function food_metadata_agent(state) {
  let debugUsage = state.debugUsage;
  try {
    logger.info('[LangGraph] food_metadata_agent: Enter', { photoId: state.filename });
    const metadataForPrompt = metadataPayloadWithDirection(state);

    const promptPoi = state.poiAnalysis || {};
    const city = promptPoi.city || (promptPoi.locationIntel ? promptPoi.locationIntel.city : null) || promptPoi.location || promptPoi.region || null;
    const region = promptPoi.region || (promptPoi.locationIntel ? promptPoi.locationIntel.region : null) || null;
    const locationString = [city, region].filter(Boolean).join(', ');
    const timestamp = extractTimestamp(state.metadata);

    const { FOOD_METADATA_SYSTEM_PROMPT, FOOD_METADATA_USER_PROMPT, FOOD_METADATA_CRITICAL_RULE_TEXT } = require('../../prompts/food_metadata_agent');
    const systemPrompt = FOOD_METADATA_SYSTEM_PROMPT || 'You are a professional photo archivist. Your tone is informative, concise, and professional. Return ONLY a JSON object.';

    const nearbyForPrompt = state.nearby_food_places_curated || state.poiAnalysis?.food?.curated || state.nearby_food_places || state.poiAnalysis?.food?.candidates || [];
    const foodMeta = state.poiAnalysis?.food || {};
    const bestCandidate = state.best_restaurant_candidate || null;
    const deterministicRestaurant = !!foodMeta?.deterministic_restaurant || !!bestCandidate?.deterministic;
    const lockedRestaurantName = foodMeta?.restaurant_name || bestCandidate?.name || null;
    const lockedRestaurantAddress = foodMeta?.restaurant_address || bestCandidate?.address || null;

    let userPrompt = (FOOD_METADATA_USER_PROMPT || '')
      .replace('{classification}', String(state.classification || ''))
      .replace('{photo_timestamp}', String(timestamp || 'unknown'))
      .replace('{photo_location}', String(locationString || 'unknown'))
      .replace('{metadataForPrompt}', JSON.stringify(metadataForPrompt || {}))
      .replace('{nearbyForPrompt}', JSON.stringify(nearbyForPrompt || []));

    userPrompt = userPrompt.replace('{CRITICAL_RULE_TEXT}', FOOD_METADATA_CRITICAL_RULE_TEXT || '');
    const CRITICAL_RULE_TEXT = '        * **CRITICAL FORMAT RULE:** If `restaurant_name` in your JSON is not null, the description MUST contain the exact `restaurant_name` string verbatim at least once. If it does not, rewrite the description so the restaurant name appears explicitly.';
    if (!userPrompt.includes('CRITICAL FORMAT RULE')) {
      const anchor = '        * **Always** try to append the location and date, like: "...in [photo_location] on [photo_timestamp]."\n    * **keywords:** Include the dish, cuisine, and restaurant name (if found).';
      const replacement = `        * **Always** try to append the location and date, like: "...in [photo_location] on [photo_timestamp]."\n${CRITICAL_RULE_TEXT}\n    * **keywords:** Include the dish, cuisine, and restaurant name (if found).`;
      userPrompt = userPrompt.replace(anchor, replacement);
    }
    userPrompt = userPrompt.replace(/`deterministic_restaurant`/g, "'deterministic_restaurant'").replace(/`restaurant_name`/g, "'restaurant_name'").replace(/`restaurant_address`/g, "'restaurant_address'");

    const userContent = [ { type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'high' } } ];

    const configuredModel = state.modelOverrides?.defaultModel || 'gpt-4o-mini';
    const response = await openai.chat.completions.create({
      model: configuredModel,
      messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userContent } ],
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });
    const raw = response?.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn('[LangGraph] food_metadata_agent: Failed to parse JSON response', err && err.message ? err.message : err, raw.slice(0, 1000));
      return { ...state, error: 'Failed to parse food metadata response' };
    }

    const finalParsed = {
      caption: parsed.caption || (parsed.dish_name ? parsed.dish_name : (parsed.description ? parsed.description.slice(0, 80) : 'Food photo')),
      description: parsed.description || parsed.caption || '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.join(', ') : (parsed.keywords || (parsed.cuisine ? `${parsed.cuisine}` : 'food')),
      classification: state.classification,
    };

    const foodData = {
      dish_name: parsed.dish_name || null,
      dish_type: parsed.dish_type || null,
      cuisine: parsed.cuisine || null,
      restaurant_name: parsed.restaurant_name || (state.best_restaurant_candidate ? state.best_restaurant_candidate.name : null),
      restaurant_address: parsed.restaurant_address || (state.best_restaurant_candidate ? state.best_restaurant_candidate.address : null),
      restaurant_confidence: parseNumber(parsed.restaurant_confidence) || (state.best_restaurant_candidate ? 0.6 : 0.0),
      restaurant_reasoning: parsed.restaurant_reasoning || null,
      location_summary: parsed.location_summary || null,
    };

    const chosenPlaceId = parsed.chosen_place_id || parsed.chosen_placeId || parsed.restaurant_place_id || null;
    let chosenCandidate = null;
    if (chosenPlaceId) {
      const candidateSource = state.nearby_food_places_curated || state.nearby_food_places || [];
      if (Array.isArray(candidateSource)) {
        chosenCandidate = candidateSource.find(p => p.placeId === chosenPlaceId || p.place_id === chosenPlaceId) || null;
      }
    }
    const parsedRestaurantConfidence = parseNumber(parsed.restaurant_confidence);
    const impliedConfidence = parsedRestaurantConfidence != null ? parsedRestaurantConfidence : 0.85;
    if (chosenCandidate && impliedConfidence >= 0.5) {
      foodData.restaurant_name = parsed.restaurant_name || chosenCandidate.name;
      foodData.restaurant_address = parsed.restaurant_address || chosenCandidate.address || chosenCandidate.vicinity || foodData.restaurant_address;
      foodData.restaurant_confidence = impliedConfidence;
      foodData.restaurant_reasoning = parsed.restaurant_reasoning || `Selected ${chosenCandidate.name} from nearby candidates based on the image and metadata.`;
    } else if (parsed.restaurant_name) {
      foodData.restaurant_name = parsed.restaurant_name;
      foodData.restaurant_address = parsed.restaurant_address || foodData.restaurant_address;
      foodData.restaurant_confidence = parseNumber(parsed.restaurant_confidence) || (foodData.restaurant_confidence || 0.6);
      foodData.restaurant_reasoning = parsed.restaurant_reasoning || null;
    }

    if (deterministicRestaurant) {
      foodData.restaurant_name = lockedRestaurantName;
      foodData.restaurant_address = lockedRestaurantAddress;
      foodData.restaurant_confidence = 1;
      foodData.restaurant_reasoning = foodData.restaurant_reasoning || 'Restaurant pre-selected deterministically from nearby_food_places.';
      foodData.deterministic_restaurant = true;
    }

    const enforcedDescription = ensureRestaurantInDescription(finalParsed.description, foodData.restaurant_name, locationString, timestamp);
    finalParsed.description = enforcedDescription;
    foodData.description = enforcedDescription;

    let nutrition = parsed.nutrition_info || null;
    let nutrition_conf = parseNumber(parsed.nutrition_confidence) || 0.0;
    if (!nutrition && (foodData.restaurant_name || foodData.dish_name)) {
      try {
        const searchResult = await fetchDishNutrition({ restaurantName: foodData.restaurant_name, dishName: foodData.dish_name });
        if (searchResult) {
          nutrition = searchResult;
          nutrition_conf = 0.85;
          logger.info('[LangGraph] food_metadata_agent: Nutrition lookup success');
        } else {
          logger.info('[LangGraph] food_metadata_agent: Nutrition lookup returned no structured data; asking model for estimate');
          const estimatePrompt = `Estimate nutrition for ${foodData.dish_name || 'the dish'} as a typical single serving. Return JSON: {"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number, "notes":"..."}`;
          const estimateResp = await openai.chat.completions.create({
            model: configuredModel,
            messages: [ { role: 'system', content: 'You are a nutrition estimator. Provide best-effort numeric nutrition information.' }, { role: 'user', content: estimatePrompt } ],
            max_tokens: 256,
            response_format: { type: 'json_object' },
          });
          try {
            const estRaw = estimateResp?.choices?.[0]?.message?.content || '{}';
            const estParsed = JSON.parse(estRaw);
            nutrition = {
              calories: parseNumber(estParsed.calories) || null,
              protein_g: parseNumber(estParsed.protein_g) || null,
              carbs_g: parseNumber(estParsed.carbs_g) || null,
              fat_g: parseNumber(estParsed.fat_g) || null,
              notes: estParsed.notes || 'Estimated values',
            };
            nutrition_conf = 0.4;
          } catch (err) {
            logger.warn('[LangGraph] food_metadata_agent: Nutrition estimate parsing failed', err && err.message ? err.message : err);
          }
        }
      } catch (err) {
        logger.warn('[LangGraph] food_metadata_agent: Nutrition search failed', err && err.message ? err.message : err);
      }
    }

    const poi = { ...(state.poiAnalysis || {}), food: { ...(state.poiAnalysis?.food || {}), ...foodData, nutrition_info: nutrition, nutrition_confidence: nutrition_conf } };
    let bestCandidateObj = state.best_restaurant_candidate || null;
    if (chosenCandidate && impliedConfidence >= 0.5) {
      bestCandidateObj = { ...chosenCandidate, matchScore: null, keywordMatches: [] };
    }

    const { usage, model } = extractUsageFromResponse(response);
    debugUsage = accumulateDebugUsage(debugUsage, {
      step: 'food_metadata_agent',
      model: model || configuredModel,
      usage,
      durationMs: 0,
      notes: 'Food metadata LLM call',
      request: { systemPrompt, userPrompt },
      response: parsed,
      prompt: userPrompt,
    });

    logger.info('[LangGraph] food_metadata_agent: Exit', { photoId: state.filename, dish: parsed.dish_name });
    return { ...state, finalResult: finalParsed, poiAnalysis: poi, best_restaurant_candidate: bestCandidateObj, debugUsage, error: null };
  } catch (err) {
    logger.warn('[LangGraph] food_metadata_agent: Error', err && err.message ? err.message : err);
    return { ...state, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = food_metadata_agent;