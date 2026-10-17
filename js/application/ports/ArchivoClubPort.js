// Port: where the club file (cnl/<Club>.json) lives. Implemented by infrastructure/drive.js (Google Drive) and
// infrastructure/demoStorage.js (demo mode, browser only). Contracts only: no code.
//
// @typedef {object} ArchivoClubPort
// @property {(id: string) => Promise<{rev: string, version?: number|null, modifiedTime?: string, name?: string}>} meta   cheap metadata request
// @property {(id: string) => Promise<{doc: object, rev: string, version?: number|null}>} read   the club document (see domain/sheetdata.js)
// @property {(id: string, doc: object) => Promise<{rev: string, version?: number|null}>} write   overwrites the content
// @property {(id: string, nombre: string) => Promise<{version?: number}|undefined>} renameClub
// @property {(nombre: string, doc: object, opciones?: {etiqueta?: string}) => Promise<unknown>} backupClub   copy in cnl/backups
// @property {(nombre: string, opciones?: {todos?: boolean}) => Promise<Array<{id: string, name: string}>>} listarBackups   most recent first
// @property {(id: string) => Promise<object|null>} revisionPrevia   revision before the latest one (concurrency recovery)
// @property {(id: string) => Promise<object>} leerFichero   a backup file by id
// @property {() => Promise<string>} ensureFolder
// @property {(nombre: string, carpetaId: string) => Promise<{id: string}|null>} findFile
// @property {(id: string) => Promise<unknown>} eliminarDefinitivo
// @property {(id: string) => Promise<number>} borrarRevisionesAntiguas
// Errors carry `status`, `code`, `offline` (no network), `retryAfterMs`; unreadable JSON has code 'fichero-danado'.
export {};
