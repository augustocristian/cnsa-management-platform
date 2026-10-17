// Port: browser window/tab events the club store reacts to. Implemented in composicion/ (window, document).
// Contracts only: no code.
//
// @typedef {object} VentanaPort
// @property {(manejadores: {
//   volverLaRed: () => void,                                  the browser is online again
//   cerrando: () => void,                                     pagehide: flush what is pending
//   oculta: () => void,                                       the tab became hidden
//   otraPestana: (cambio: {clave: string, valor: string}) => void   another tab saved the local cache (storage event)
// }) => void} enlazar   idempotent per window
// @property {() => boolean} oculta   is the tab hidden right now? (polling only runs while visible)
// @typedef {object} RedPort
// @property {() => boolean} enLinea   navigator.onLine
export {};
