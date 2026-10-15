# CNL Plataforma — Arquitectura (contrato entre módulos)

PWA 100% estática (GitHub Pages), sin build, JavaScript ES modules, sin frameworks.
**Todas las rutas deben ser RELATIVAS** (`./js/app.js`), porque Pages sirve bajo `/cnsa-management-platform/`.
UI en español. Mobile-first.

## Persistencia
- Login con Google (Google Identity Services, token OAuth). Scopes: `https://www.googleapis.com/auth/spreadsheets` + `https://www.googleapis.com/auth/drive.file` + `openid email profile` (sin scopes restringidos).
- Los datos de cada club viven en **una Google Sheet compartida** (una hoja de cálculo por club, **una pestaña por entidad**, fila 1 = cabeceras de `schema.js`). Al crear el club, la Sheets API v4 crea la hoja con todas las pestañas/cabeceras y la Drive API (`drive.file`) la mueve a la carpeta `cnl` del propietario.
- **Compartir**: el propietario comparte la hoja desde Drive (o con el botón "Compartir por email" de Configuración, que usa Drive permissions con rol `writer`). Los demás usuarios entran con **Unirse con enlace o ID de hoja** en el selector de club: se valida el acceso (`spreadsheets.get`) y la hoja se guarda en la lista local de clubes (`localStorage['cnl:clubs']`). `drive.listClubs()` devuelve esos clubes conocidos (verificando acceso; 403 = oculto, 404 = se olvida), no lista la carpeta.
- Lectura: `values.batchGet` de todas las pestañas. Escritura: `values.batchUpdate` (RAW) de todas las pestañas + `values.batchClear` de las filas sobrantes; crea pestañas y amplía la cuadrícula si hace falta. Celdas de más de 50.000 caracteres (logo en dataURL) se trocean en la pestaña Club (`logo`, `logo#1`, ...).
- Caché local (localStorage) para uso offline; guardado con debounce (1,5 s), botón "Sincronizar", indicador de estado (`local|sincronizado|pendiente|error|offline`).
- **Cambios de otros usuarios**: polling cada ~30 s (sólo con la pestaña visible) que compara un hash del contenido remoto con el de la última versión conocida (no se usa Drive revisionId porque con `drive.file` una hoja compartida no es accesible por Drive). Si cambió y no hay ediciones locales pendientes, se recarga (evento `{type:'remote'}`). Si hay ediciones pendientes, `sync()` hace una **fusión de tres vías por fila (id)** entre la última versión sincronizada (`base`), lo local y lo remoto (`sheetdata.mergeData`): se parte de lo remoto y se aplican las altas/ediciones/borrados locales. Conflicto en la misma fila: gana lo local. La escritura no es transaccional (sobrescribe y luego limpia la cola).
- Errores: 401 renueva el token (`auth.ensureToken`) y reintenta una vez; 403/404 lanzan errores con mensaje claro (`e.status`); sin red `e.offline = true` y estado `offline`.
- **Roles**: la pestaña Usuarios define roles. El propietario (clave `propietario` de la pestaña Club, que se fija al crear el club) es siempre admin aunque no tenga fila en Usuarios. Sin filas en Usuarios, quien abre es admin.
- Exportar/importar `.xlsx` (`store.exportXlsx/importXlsx`) se mantiene como copia de seguridad.
- El Client ID de Google se configura en `js/config.js` (`GOOGLE_CLIENT_ID`). Sin Client ID, la app funciona en **modo local** (sólo localStorage + importar/exportar .xlsx).

## Pestañas de la hoja / Excel (fila 1 = cabeceras exactas, `id` = string único)
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
- `js/schema.js` — `SHEETS` (nombre->columnas), `CATEGORIAS`, `ROLES`, `newId()`.
- `js/store.js` — datos:
  `await store.init(clubRef)`, `store.list(sheet)`->array, `store.get(sheet,id)`, `store.upsert(sheet,row)`->row (genera id si falta), `store.remove(sheet,id)`, `store.on(fn)` (evento de cambios/estado), `store.status` (`'local'|'sincronizado'|'pendiente'|'error'|'offline'`), `store.sync()`, `store.exportXlsx()`, `store.importXlsx(file)`, `store.club` (objeto config), `store.setClub(obj)`, `store.refresh()` (comprueba cambios remotos), `store.clubRef` (`{name,id,local}`).
- `js/auth.js` — `auth.init()`, `auth.signIn()`, `auth.signOut()`, `auth.user` (`{email,name,picture}`|null), `auth.token()`, `auth.on(fn)`, `auth.role()` (rol del usuario en el club actual; en modo local = `admin`).
- `js/drive.js` — Sheets/Drive REST: `parseSheetId(urlOrId)`, `sheetUrl(id)`, `ensureFolder('cnl')`, `listClubs()`, `createClub(name)`->`{id,name,url,owner}`, `joinClub(urlOrId)`, `forgetClub(id)`, `read(id)`->`{title,tabs}`, `write(id,tabs)`, `shareWithEmail(id,email,role='writer')`.
- `js/sheetdata.js` — puro: `dataToTabs`, `tabsToData`, `hashData`, `mergeData`, `isEmptyData`.
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

## Diseño objetivo (mockup del usuario) — ACTUALIZA el contrato anterior
Aspecto: claro, azul (#1a73e8 aprox.) sobre blanco, tarjetas con bordes redondeados y sombra suave, tipografía limpia (system-ui). Cabecera: logo + nombre del club (grande, azul oscuro) + lema ("Pequeño gran club", azul) | caja "Rol actual: Entrenador" | campana con contador de avisos | botón salir. Lateral izquierdo (escritorio; barra inferior en móvil) con: Inicio, Nadadores, Grupos, Entrenamientos, Asistencia, Cargas, Marcas, Bañador, Comunicaciones, Configuración, y abajo un recuadro "Cambiar a rol" (vista demo de Entrenador/Nadador). Pie: "© 2025 Club Natación Lugones | lema".
Inicio: banner "¡Bienvenido, <Rol>!" con fecha larga y nadador SVG; tarjetas: Acceso rápido (4 atajos), Control de cargas semanal del club (gráfico de líneas SVG: realizado vs objetivo mínimo/máximo, Lun–Dom, metros), Alertas de cargas (zona por encima/por debajo del objetivo), Próxima sesión (día, hora, grupo, piscina, volumen objetivo, enfoque), Asistencia hoy (donut SVG: asistieron/faltaron/sin confirmar), Comunicaciones recientes.
Cambios de esquema:
- Club: + `lema`. Entrenamientos: + `piscina`, `volumenMin`, `volumenMax`, `enfoque`.
- Cargas: + `tipo` (Aeróbico, Velocidad, Piernas, Técnica, Fuerza).
- Nueva hoja **ObjetivosCarga**: id, tipo, minSemanalM, maxSemanalM.
- Nueva hoja **Banador** (entrega de bañador/equipación): id, nadadorId, talla, estado (`pendiente`|`entregado`), fecha, notas.
- Vista nueva `banador`; vista `grupos` (CRUD de Grupos, nadadores por grupo).
- Módulos de vista: inicio, nadadores, grupos, entrenamientos, asistencia, cargas, marcas, banador, comunicaciones, club, mi-espacio.
- `auth.role()` puede sobreescribirse con `auth.setDemoRole(rol)` (sólo vista, para el selector "Cambiar a rol").
- Sin gráficos de librerías externas: SVG propio.
