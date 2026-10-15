# CNL Plataforma — Arquitectura (contrato entre módulos)

PWA 100% estática (GitHub Pages), sin build, JavaScript ES modules, sin frameworks.
**Todas las rutas deben ser RELATIVAS** (`./js/app.js`), porque Pages sirve bajo `/cnsa-management-platform/`.
UI en español. Mobile-first.

## Persistencia
- Login con Google (Google Identity Services, token OAuth, scope `https://www.googleapis.com/auth/drive.file openid email profile`).
- Los datos de cada club viven en **un Excel (.xlsx) dentro de una carpeta `cnl` en el Google Drive del usuario** (`cnl/<NombreClub>.xlsx`). Una hoja por entidad.
- Caché local (localStorage/IndexedDB) para uso offline; se sincroniza con Drive (guardado con debounce, botón "Sincronizar", indicador de estado).
- Multi-club = un fichero por club en `cnl`; aislamiento = permisos de Drive. Selector de club tras login.
- El Client ID de Google se configura en `js/config.js` (`GOOGLE_CLIENT_ID`). Sin Client ID, la app funciona en **modo local** (sólo localStorage + importar/exportar .xlsx) para poder probar.

## Hojas del Excel (fila 1 = cabeceras exactas, `id` = string único)
| Hoja | Columnas |
|---|---|
| Club | clave, valor  (nombre, logo(dataURL), colorPrimario, colorSecundario) |
| Usuarios | id, email, nombre, rol (`admin`\|`entrenador`\|`nadador`), nadadorId |
| Nadadores | id, nombre, apellidos, fechaNacimiento, sexo, categoria, grupoId, email, telefono, tutor, licencia, notas, activo |
| Grupos | id, nombre, categoria, entrenador |
| Entrenamientos | id, fecha, hora, duracionMin, grupoId, titulo, descripcion, estado (`planificado`\|`realizado`) |
| Asistencia | id, entrenamientoId, nadadorId, estado (`presente`\|`ausente`\|`justificado`), nota |
| Cargas | id, entrenamientoId, nadadorId, fecha, metros, rpe, minutos, notas |
| Marcas | id, nadadorId, fecha, prueba, piscina (`25`\|`50`), tiempoMs, competicion, notas |
| Comunicaciones | id, fecha, titulo, texto, grupoId (vacío = todos), autor |

Categorías en orden: Prebenjamín, Benjamín, Alevín, Infantil, Junior, Absoluto, Máster.

## Módulos (cada agente es dueño SÓLO de sus ficheros)
- `js/config.js` — `export const GOOGLE_CLIENT_ID = ''; export const APP_VERSION`.
- `js/schema.js` — `SHEETS` (nombre→columnas), `CATEGORIAS`, `ROLES`, `newId()`.
- `js/store.js` — datos:
  `await store.init(clubRef)`, `store.list(sheet)`→array, `store.get(sheet,id)`, `store.upsert(sheet,row)`→row (genera id si falta), `store.remove(sheet,id)`, `store.on(fn)` (evento de cambios/estado), `store.status` (`'local'|'sincronizado'|'pendiente'|'error'|'offline'`), `store.sync()`, `store.exportXlsx()`, `store.importXlsx(file)`, `store.club` (objeto config), `store.setClub(obj)`.
- `js/auth.js` — `auth.init()`, `auth.signIn()`, `auth.signOut()`, `auth.user` (`{email,name,picture}`|null), `auth.token()`, `auth.on(fn)`, `auth.role()` (rol del usuario en el club actual; en modo local = `admin`).
- `js/drive.js` — Drive REST: `ensureFolder('cnl')`, `listClubs()`, `createClub(name)`, `download(fileId)`, `upload(fileId, blob)`.
- `js/ui.js` — helpers: `h(tag, attrs, ...children)`, `modal({title, body, actions})`, `toast(msg)`, `confirmDialog(msg)`, `formFields(def, values)`, `fmtDate`, `fmtTime(ms)` (mm:ss.cc), `parseTime(str)`.
- `js/router.js` — hash router `#/nadadores`, `#/nadadores/<id>`; `registerRoute(name, loader)`.
- `js/app.js` — arranque, login/selector de club, shell (barra inferior móvil, lateral en escritorio), tema por club (CSS vars `--c-primary`, `--c-secondary`), permisos de menú por rol.
- `js/views/<modulo>.js` — `export async function render(container, params, ctx)` donde `ctx = {store, auth, ui}`. Módulos: `inicio`, `nadadores`, `entrenamientos`, `asistencia`, `cargas`, `marcas`, `comunicaciones`, `club` (ajustes/identidad/usuarios), `mi-espacio` (rol nadador).
- `css/app.css`, `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`.
- `vendor/xlsx.full.min.js` — SheetJS vendorizado (global `XLSX`), cargado con `<script>` en index.html y cacheado por el SW.

## Permisos
admin: todo. entrenador: todo excepto usuarios/club. nadador: sólo `mi-espacio` (sus datos filtrados por `nadadorId`) + comunicaciones de su grupo.

## Reglas
- No tocar ficheros de otros agentes. No ejecutar comandos git (commitea el orquestador).
- Código sencillo y comentado lo mínimo. Escapar siempre texto de usuario (usar `h()`/textContent, nunca innerHTML con datos).
