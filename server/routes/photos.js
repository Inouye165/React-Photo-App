// Thin compatibility wrapper.
// Loads the TypeScript implementation at runtime.
// This avoids needing Jest/Babel TypeScript parsing just to load the router.
const path = require('path');

if (process.env.NODE_ENV === 'production') {
	throw new Error(
		'Production must run the precompiled server. Run `npm run build` then `npm start` (which runs dist/server.js).'
	);
}

require('ts-node').register({
	transpileOnly: true,
	project: path.join(__dirname, '..', 'tsconfig.json'),
	compilerOptions: {
		module: 'CommonJS',
		allowJs: false,
	},
});

module.exports = require('./photos.ts');

