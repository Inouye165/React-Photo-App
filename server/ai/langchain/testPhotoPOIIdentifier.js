// Test script for Photo POI Identifier
const { PhotoPOIIdentifierNode } = require('./photoPOIIdentifier.js');
const fs = require('fs');
const path = require('path');

async function testPhotoPOIIdentifier() {
  console.log('Testing Photo POI Identifier...\n');

  const identifier = new PhotoPOIIdentifierNode(process.env.OPENAI_API_KEY);

  // Test cases with different GPS coordinates
  const testCases = [
    {
      name: 'Old Faithful Geyser',
      gps: { lat: 44.4605, lng: -110.8281 },
      description: 'Should identify Old Faithful Geyser'
    },
    {
      name: 'Lake Yellowstone Hotel',
      gps: { lat: 44.5439, lng: -110.4011 },
      description: 'Should identify Lake Yellowstone Hotel Dining Room'
    },
    {
      name: 'Grand Canyon of Yellowstone',
      gps: { lat: 44.7417, lng: -110.4994 },
      description: 'Should identify Grand Canyon of the Yellowstone'
    },
    {
      name: 'Far from Yellowstone (NYC)',
      gps: { lat: 40.7128, lng: -74.0060 },
      description: 'Should return no nearby POIs'
    }
  ];

  // Create a mock image (base64 encoded small JPEG)
  const mockImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64').toString('base64');

  for (const testCase of testCases) {
    console.log(`\n=== Testing: ${testCase.name} ===`);
    console.log(`GPS: ${testCase.gps.lat}, ${testCase.gps.lng}`);
    console.log(testCase.description);

    try {
      const result = await identifier.identifyPOI(
        mockImageData,
        testCase.gps.lat,
        testCase.gps.lng
      );

      console.log('\nResult:');
      console.log(`Scene Type: ${result.scene_type}`);
      console.log(`Scene Description: ${result.scene_description}`);
      console.log(`Search Radius: ${result.search_radius_miles} miles`);
      console.log(`Analysis Confidence: ${result.analysis_confidence}`);

      if (result.best_match) {
        console.log(`\nBest Match: ${result.best_match.name} (${result.best_match.confidence} confidence)`);
      }

      console.log('\nTop POIs:');
      result.poi_list.slice(0, 3).forEach((poi, index) => {
        console.log(`${index + 1}. ${poi.name} - ${poi.distance_miles} miles (${poi.confidence})`);
        console.log(`   Reason: ${poi.relevance_reason}`);
      });

    } catch (error) {
      console.error('Test failed:', error.message);
    }

    console.log('='.repeat(50));
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testPhotoPOIIdentifier().catch(console.error);
}

module.exports = { testPhotoPOIIdentifier };