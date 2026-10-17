// Port: timers. Implemented in composicion/ over the global setTimeout. Contracts only: no code.
//
// @typedef {object} TimersPort
// @property {(fn: () => void, ms: number, opciones?: {unref?: boolean}) => unknown} programar   unref (default true): must not keep a process alive
// @property {(manejador: unknown) => void} cancelar
export {};
