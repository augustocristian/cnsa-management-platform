// Port: local mirror of a club (the offline queue of pending changes). Implemented by infrastructure/cache.js
// (localStorage overflowing to IndexedDB). Contracts only: no code.
//
// @typedef {object} CachePort
// @property {(clave: string, objeto: object) => Promise<'ls'|'idb'>} guardar   rejects with code 'cache-llena' when it fits nowhere
// @property {(clave: string) => Promise<object|null>} leer
// @property {(clave: string) => boolean} existe   synchronous: is there a stored copy?
export {};
