// Thin compatibility wrapper.
// Loads the TypeScript implementation at runtime.
// This avoids needing Jest/Babel TypeScript parsing just to load the router.
const path = require('path');

require('ts-node').register({
	transpileOnly: true,
	project: path.join(__dirname, '..', 'tsconfig.json'),
	compilerOptions: {
		module: 'CommonJS',
		allowJs: false,
	},
});

module.exports = require('./photos.ts');

