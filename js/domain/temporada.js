// Domain of Season Planning (PURE logic: no DOM, store, network, i18n or clock). Public entry point of the module: the model is in
// temporada-modelo.js (sheets, normalisation, weeks, validations, aggregates, summary) and the rest (suggestions, plan editing tools,
// calendar events, demo data) in temporada-plan.js.
export * from './temporada-modelo.js';
export * from './temporada-plan.js';
