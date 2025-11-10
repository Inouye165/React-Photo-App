// File obsolete: LangChain removed. All code commented out for lint clean.
/*
Lightweight Jest mock for LangChain agents used in server AI integration tests
Returns deterministic, small responses so tests don't call external OpenAI services.

Helper: if tests provide a mocked chainAdapter.runChain, delegate to it so per-test
expectations (which often mock the chainAdapter) are honored.

LangChain agent mock removed. File can be deleted if not used elsewhere.
const routerAgent = {};
const sceneryAgent = {};
const collectibleAgent = {};
module.exports = {};
*/
