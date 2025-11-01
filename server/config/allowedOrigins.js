const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://10.0.0.126:5173'
];

function getAllowedOrigins() {
  const origins = new Set(DEFAULT_ORIGINS);
  const envOrigin = process.env.CLIENT_ORIGIN;
  if (envOrigin) {
    origins.add(envOrigin.trim());
  }
  if (process.env.CLIENT_ORIGINS) {
    process.env.CLIENT_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => origins.add(value));
  }
  return Array.from(origins);
}

module.exports = {
  getAllowedOrigins
};
