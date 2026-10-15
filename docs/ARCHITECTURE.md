# CNL Plataforma — Arquitectura (contrato entre módulos)

PWA 100% estática (GitHub Pages), sin build, JavaScript ES modules, sin frameworks.
**Todas las rutas deben ser RELATIVAS** (`./js/app.js`), porque Pages sirve bajo `/cnsa-management-platform/`.
UI en español. Mobile-first.

## Persistencia (Google Drive, scope único `drive.file`)
App de **uso individual**: no hay servidor, base de datos, usuarios, roles ni compartición. Todo vive en la carpeta `cnl` del Drive del usuario.
- **Login** con Google Identity Services (token OAuth). Scopes: `https://www.googleapis.com/auth/drive.file` + `openid email profile`. Es el único permiso de datos: la app sólo ve los ficheros que ella misma crea; no es sensible ni requiere verificación de Google. **No se usa la API de Sheets.** Sólo hay que activar Drive API (y Calendar API si se sincroniza el calendario; su scope `calendar.events` es incremental y no forma parte de `SCOPES`).
- **Client ID**: constante `BUILTIN_CLIENT_ID` de `js/config.js` (la fija el propietario una vez). Si está vacía, `app.js` muestra *Configuración necesaria* (tutorial + campo para probar un ID, que queda sólo en `localStorage['cnl:clientId']`). No puede vivir en Drive: hace falta antes de iniciar sesión.
- **Flujo de arranque** (`app.js`): sin Client ID -> *Configuración necesaria*; sin sesión -> login; con sesión -> `preferencias.conectar` + `drive.listClubs()` -> 0 clubes: asistente de club (`views/acceso.js` + `application/asistenteClub.js`, club vacío); 1 club o el `ultimoClub`: se abre; varios: selector -> shell. Sin conexión se usan la caché y la lista de clubes espejo de las preferencias.
- **Fichero del club** `cnl/<NombreClub>.json`: `{ version: 1, club: {clave: valor}, hojas: { Nadadores: [fila...], ... } }` (secciones y columnas de `schema.js`, `sheetdata.dataToDoc/docToData`). Marcado con `appProperties.cnl='club'` para listarlo (`drive.listClubs`); se renombra al cambiar el nombre del club.
- **Concurrencia (otro dispositivo)**: la revisión es `md5Checksum` (o `modifiedTime`). `store.refresh` (polling ~30 s, pestaña visible) compara `drive.meta(id).rev` con la última conocida y, si cambió y no hay ediciones locales, recarga. `store.sync` (debounce 1,5 s, botón *Sincronizar*, evento `online`) comprueba `meta` antes de escribir y, si hay cambios locales y remotos, hace **fusión de tres vías por fila (`id`)** entre `base` (última versión sincronizada), lo local y lo remoto (`sheetdata.mergeData`; conflicto en la misma fila: gana lo local). La escritura sobrescribe el contenido (PATCH `uploadType=media`).
- **Caché local** (`localStorage['cnl:club:<id>']`) como espejo con la marca `dirty` y la `base`: cola de cambios pendientes sin conexión. Estados de `store.status`: `sincronizado|pendiente|error|offline`.
- **Preferencias** `cnl/preferencias.json` (`{version, valores, marcas}`; `domain/preferencias.js` puro, `application/preferenciasService.js` con caché `localStorage['cnl:prefs']`, debounce, cola offline y fusión por clave con marca de tiempo; instancia única en `js/preferencias.js`). Claves: `idioma`, `ultimoClub`, `clubes` (espejo de la lista), `tutorial`, `calendario.vista|ventanaDias|alarmaMin`, `calSync.<clave>` (mapa de sincronización con Google Calendar). Una versión futura del fichero no se degrada ni pierde claves desconocidas. El idioma se sincroniza en cuanto hay sesión (lo elegido antes del login gana por marca de tiempo).
- **Errores de Google** (`domain/erroresGoogle.js`, `views/acceso.js#errorGoogle`): popup bloqueado/cerrado, correo que no es usuario de prueba, origen no autorizado (se muestra el origen actual para copiarlo), API de Drive desactivada (con enlace de activación), 401 (renueva el token una vez), 403/404/429 y sin red (`e.offline`). Cerrar sesión **revoca** los tokens y limpia cachés (conserva las de datos con cambios sin subir).
- **Carpeta `cnl` previa**: con `drive.file` la app no ve una carpeta `cnl` hecha a mano; `drive.ensureFolder` busca la suya y, si no existe, la crea (una sola, la más antigua si hubiera varias). La UI y el tutorial lo explican.
- **PDFs** en `cnl/entrenos/` (`drive.ensureFolderPath(['entrenos'])` + `drive.upload`) y copias `.xlsx` en `cnl/` (`store.guardarXlsxEnDrive`). Exportar/importar `.xlsx` (`store.exportXlsx/importXlsx`) sigue siendo la copia de seguridad.

### Dónde vive cada dato
| Dato | Fuente de verdad | Espejo local |
|---|---|---|
| Identidad del club (nombre, lema, colores, logotipo), zona horaria (`Club.zonaHoraria`) | `cnl/<Club>.json` > `club` | `cnl:club:<id>` (caché + cola de pendientes) |
| Nadadores, grupos, entrenamientos y su plan (`EntrenoLineas`), asistencia, cargas, marcas, comunicaciones, bañador | `cnl/<Club>.json` > `hojas` | `cnl:club:<id>` |
| Catálogo de contenidos (`TiposCarga`) y objetivos semanales, piscinas y asignaciones de calle | `cnl/<Club>.json` > `hojas` | `cnl:club:<id>` |
| Idioma | `cnl/preferencias.json` > `idioma` | `cnl:prefs` y `cnl:lang` (arranque síncrono) |
| Último club abierto y lista de clubes | `cnl/preferencias.json` > `ultimoClub`, `clubes` (los clubes se listan además desde Drive) | `cnl:prefs` |
| Progreso del tutorial | `cnl/preferencias.json` > `tutorial` | `cnl:prefs` |
| Vista, ventana y recordatorio del calendario | `cnl/preferencias.json` > `calendario.*` | `cnl:prefs` |
| Mapa de sincronización con Google Calendar (por club y cuenta) | `cnl/preferencias.json` > `calSync.*` | `cnl:prefs` |
| PDFs de entrenos / copias Excel | `cnl/entrenos/`, `cnl/<Club>.xlsx` | (no se guardan localmente) |
| Client ID de Google | `js/config.js` (`BUILTIN_CLIENT_ID`) o, para pruebas del propietario, `localStorage['cnl:clientId']` | no puede vivir en Drive (hace falta antes del login) |
| Sesión (usuario y token) | token en `sessionStorage['cnl:token']`; perfil en `localStorage['cnl:user']` (permite abrir la caché sin conexión) | — |
| Aviso de instalación descartado | preferencia de dispositivo `localStorage['cnl:install-dismissed']` | — |

localStorage **nunca** es la fuente de verdad de configuración: sólo caché/espejo.

### Herramienta de pruebas: `js/infrastructure/fakeGoogle.js`
Adaptador en memoria que sustituye a `auth` y `drive` (mismas interfaces: sesión simulada, `ensureFolder`, `listClubs`, `createClub`, `meta/read/write`, `leerPreferencias/guardarPreferencias`, `upload`, `findFile`...). Se activa **sólo** con `localStorage['cnl:test']='1'` o `window.__CNL_TEST__` (`app.js` lo importa dinámicamente; en producción no se descarga). Opciones: `sesion`, `demo` (siembra `store.seedDemo` una vez), `sinClientId`, `usuario`, `errorLogin`, `fallos`. Espeja su estado en `localStorage['cnl:test:drive']` para sobrevivir a recargas y expone `window.__CNL_FAKE__` (`clubs()`, `prefs()`, `archivos()`, `editarClubExterno`, `desinstalar()`). Lo usan `tests/helpers/app.js`, los tests unitarios y los pasos de Cucumber.

## Secciones del fichero del club = pestañas del Excel exportable (fila 1 = cabeceras exactas, `id` = string único)
En `cnl/<Club>.json` la sección `club` es el objeto de la fila *Club* (clave/valor) y cada entidad es un array en `hojas`; el Excel exportable usa las mismas columnas.
| Hoja | Columnas |
|---|---|
| Club | clave, valor  (nombre, lema, logo(dataURL), colorPrimario, colorSecundario, zonaHoraria) |
| Nadadores | id, nombre, apellidos, fechaNacimiento, sexo, categoria, grupoId, email, telefono, tutor, licencia, notas, activo |
| Grupos | id, nombre, categoria, entrenador |
| Entrenamientos | id, fecha, hora, duracionMin, grupoId, titulo, descripcion, estado (`planificado`\|`realizado`), piscina, volumenMin, volumenMax, enfoque, tipoSesion, materialDia, notasGenerales |
| EntrenoLineas | id, entrenamientoId, set, orden, tiempoMin, objetivo, bloque, series, distancia, salida, ejercicio, material, notas (plan detallado de la sesión: una fila por línea, agrupadas por `set`) |
| Asistencia | id, entrenamientoId, nadadorId, estado (`presente`\|`ausente`\|`justificado`), nota |
| Cargas | id, entrenamientoId (sesión opcional), nadadorId, fecha, metros, rpe, minutos, tipo (= nombre del contenido), notas |
| TiposCarga | id, nombre, descripcion, color (`#rrggbb`), categoria (`intensidad`|`especifico`|`personalizado`), orden, activo, predefinido, minSemanalM, maxSemanalM (objetivos por nadador, opcionales) |
| ObjetivosCarga | LEGADO (id, tipo, minSemanalM, maxSemanalM): se migra a TiposCarga y la fila se elimina |
| Marcas | id, nadadorId, fecha, prueba, piscina (`25`\|`50`), tiempoMs, competicion, notas |
| Comunicaciones | id, fecha, titulo, texto, grupoId (vacío = todos), autor |
| Piscinas | id, nombre, longitudM (`25`\|`50`), numCalles, intervaloMin (`15`\|`30`), maxPorCalle, horario (JSON por día: `{"1":{"abre":"07:00","cierra":"22:00"},...,"7":null}`; 1=lunes, `null`=cerrado) |
| AsignacionesCalle | id, piscinaId, dia (1-7), fecha (vacía = semanal; con valor = excepción puntual, el día se deriva de la fecha), horaInicio, horaFin (`HH:MM`), calleDesde, calleHasta, grupoId, entrenadorId (nombre del entrenador), notas |

Categorías en orden: Prebenjamín, Benjamín, Alevín, Infantil, Junior, Absoluto, Máster.

## Módulos (cada agente es dueño SÓLO de sus ficheros)
- `js/config.js` — `GOOGLE_CLIENT_ID` (binding vivo: `BUILTIN_CLIENT_ID` o `localStorage['cnl:clientId']`), `setClientId(v)`, `isValidClientId(v)`, `SCOPES` (sólo `drive.file` + `openid email profile`), `CALENDAR_SCOPE`, `DRIVE_FOLDER='cnl'`, `PREFS_FILE`, `APP_VERSION`.
- `js/schema.js` — `SHEETS` (nombre->columnas; sin hoja de usuarios), `CATEGORIAS`, `newId()`. No hay `ROLES`.
- `js/store.js` — datos:
  `await store.init(clubRef)`, `store.list(sheet)`->array, `store.get(sheet,id)`, `store.upsert(sheet,row)`->row (genera id si falta), `store.remove(sheet,id)`, `store.on(fn)` (evento de cambios/estado), `store.status` (`'sincronizado'|'pendiente'|'error'|'offline'`), `store.sync()`, `store.exportXlsx()`, `store.importXlsx(file)`, `store.club` (objeto config), `store.setClub(obj)`, `store.refresh()` (comprueba cambios remotos), `store.clubRef` (`{name,id}`), `store.guardarXlsxEnDrive()`. `store.init` exige `{id,name}` (fichero del club en Drive): no existe el modo local.
- `js/auth.js` — `auth.init()`, `auth.signIn({clientId?})` (errores con `code` de `domain/erroresGoogle.js` y `origin`), `auth.signOut()` (revoca tokens), `auth.user` (`{email,name,picture}`|null), `auth.enabled` (hay Client ID), `auth.token()`, `auth.ensureToken()` (renovación silenciosa), `auth.tokenForScope(scope)`, `auth.on(fn)`. `auth.role()` es un resto de compatibilidad: devuelve siempre `'entrenador'` (todos los permisos).
- `js/drive.js` — Drive API v3 (`drive.file`): `ensureFolder(name, parentId)`, `ensureFolderPath(['entrenos'])`, `findFile`, `upload({name,mimeType,body,parentId,id,appProperties})`, `renameFile`, `deleteFile`, `listClubs()`, `createClub(name)`->`{id,name,url,rev}`, `renameClub`, `meta(id)`->`{rev,modifiedTime,name}`, `read(id)`->`{doc,rev,name}`, `write(id,doc)`->`{rev}`, `leerPreferencias()/guardarPreferencias(obj)`, `preferencias` (puerto `{leer, escribir}`), `fileUrl/folderUrl`, `reset()`. Errores con `status`, `code` (`api-desactivada` con `enlace`, `sin-permiso`, `sesion-caducada`, `limite`, `no-encontrado`, `sin-conexion`) y `offline`.
- `js/sheetdata.js` — puro: `dataToDoc`, `docToData`, `hashData`, `mergeData`, `isEmptyData`.
- `js/preferencias.js` + `js/application/preferenciasService.js` + `js/domain/preferencias.js` — preferencias del usuario (ver Persistencia): `preferencias.get(clave, def)`, `set(clave, valor)`, `conectar({remoto, email})`, `desconectar()`, `flush()`, `sincronizar()`, `volverLaRed()`, `on(fn)`, `estado`, `pendientes`, `comoAlmacenamiento(prefijo)`.
- `js/application/asistenteClub.js` + `js/views/acceso.js` — asistente de primer arranque, login, *Configuración necesaria*, selector de club y ayuda de errores de Google.
- `js/ui.js` — helpers: `h(tag, attrs, ...children)`, `modal({title, body, actions})`, `toast(msg)`, `confirmDialog(msg)`, `formFields(def, values)`, `fmtDate`, `fmtTime(ms)` (mm:ss.cc), `parseTime(str)`.
- `js/router.js` — hash router `#/nadadores`, `#/nadadores/<id>`; `registerRoute(name, loader)`.
- `js/app.js` — arranque (Configuración necesaria / login / asistente / selector), shell (barra inferior móvil, lateral en escritorio), tema por club (CSS vars `--c-primary`, `--c-secondary`), enlace idioma <-> preferencias. Sin roles: todos los módulos disponibles.
- `js/views/<modulo>.js` — `export async function render(container, params, ctx)` donde `ctx = {store, auth, ui}`. Módulos: `inicio`, `nadadores`, `entrenamientos`, `asistencia`, `cargas`, `marcas`, `comunicaciones`, `club` (identidad, dónde se guardan los datos, copias Excel, preferencias, cambiar de club).
- `css/app.css`, `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`.
- `vendor/xlsx.full.min.js` — SheetJS vendorizado (global `XLSX`), cargado con `<script>` en index.html y cacheado por el SW.
- `vendor/jspdf.umd.min.js` y `vendor/jspdf.plugin.autotable.min.js` — jsPDF + jspdf-autotable (dependencias npm de producción copiadas por `scripts/vendor.mjs`; Dependabot las actualiza y el CI comprueba que `vendor/` está sincronizado). **No** se cargan en `index.html`: `js/infrastructure/pdfEntreno.js` las inyecta con `<script>` la primera vez que se pide un PDF y el SW las precachea.

## Calendario (arquitectura en capas)
- `js/domain/calendario.js` — **puro** (sin DOM, red ni storage): fechas, fuentes de eventos (`FUENTES_EVENTOS`, extensible con `registrarFuente`; hoy sesiones de Entrenamientos y `AsignacionesCalle` expandidas por semana), filtros por grupo y piscina (`filtrarEventos`), colores, generación iCalendar (`generarICS`, `escaparTexto`, `plegarLinea`, `generarVTimezone`), cuerpo de evento de Google (`aEventoGoogle`) y `diffSync`.
- `js/application/calendarioService.js` — `crearCalendarioService({store, auth, storage, cliente, ahora, etq})`: junta store y dominio; exporta y sincroniza (el mapa de sincronización va a las preferencias de Drive). Todo inyectable.
- `js/infrastructure/googleCalendar.js` — `crearClienteGoogleCalendar({fetch, getToken, sleep})`: insertar/actualizar/borrar/listarGestionados con reintentos (429, 403 de cuota, 5xx, red; `Retry-After`), renovación de token ante 401 y errores con `code` (`auth|permisos|api-desactivada|limite|no-existe|red|servidor`).
- `js/views/calendario.js` — sólo presenta (`ctx.cal` permite inyectar servicio/descarga en pruebas).
- **Zona horaria**: `Club.zonaHoraria` (IANA, por defecto `Europe/Madrid`). El `.ics` usa `DTSTART;TZID=` + `VTIMEZONE` generado con `Intl` (transiciones reales del rango, sin RRULE; sin base de datos tz). Los eventos sin hora son de día completo.
- **Google**: `auth.tokenForScope(CALENDAR_SCOPE)` (consentimiento incremental, token en memoria; `CALENDAR_SCOPE` fuera de `SCOPES`). Calendario principal + `extendedProperties.private.cnlId/cnlClub`; mapa por club y cuenta en `cnl/preferencias.json` (`calSync.*`); sólo se borran los eventos futuros desaparecidos (lo pasado se conserva).

## Planificación de la piscina (arquitectura en capas)
- `js/domain/planificacion.js` — **puro** (sin DOM, store, fetch ni i18n): normalización, `validarPiscina`, solapes, `detectarConflictos(datos, {huecos})` y `conflictosDe(candidata, datos)` (devuelven `{tipo, severidad: error|aviso|info, asignaciones, params}`; los textos se traducen en la vista con `plan.c.<tipo>`), rejilla (`rangoDia`, `franjas`, `niveles`, `delDia`, `ocupacion`), `ajustarAlReducir` (recorte al bajar el nº de calles) y `sugerirDistribucion` (determinista: grupos por nº de nadadores, primera hora/calles libres sin errores).
- `js/application/planificacionService.js` — `crearPlanificacionService(repo, {puedeEditar})`: el repositorio (`list/get/upsert/remove`, p. ej. el store) se inyecta. Bloquea guardar con errores, exige `forzar` para avisos, escribe sólo si `puedeEditar()` (si no, lanza `sin-permiso`).
- `js/views/planificacion.js` — sólo presenta (rejilla calles x franjas, semana completa, formularios, panel de conflictos, sugerencia, impresión por `@media print`). Estilos propios con prefijo `pl-`. Nadador: sólo lectura (su grupo si se puede identificar).
- Reglas: errores = calle solapada, mismo grupo o entrenador a la vez, calle fuera de rango, fuera de horario, hora inválida, sin grupo; avisos = capacidad por calle excedida, sin entrenador; info = huecos libres. Los datos guardados (hojas `Piscinas`, `AsignacionesCalle`) son neutros/en español.

## Plan de entreno detallado y PDF (arquitectura en capas)
- `js/domain/entreno.js` — **puro** (sin DOM, store, fetch ni i18n): números tolerantes (`num`), salidas (`parsearSalida`: ciclo `C/1'10"` y descanso `d/15"`, con forma canónica), cálculo (`distanciaBloque` = series x distancia; `agruparSets` → Dist. Set; `totales` → min y m de la sesión; `resumen`), validación (`validarLinea`, `validarSesion`: series/distancia/tiempo numéricos = error; salida no reconocida, volumen objetivo, duración y diferencia con la carga registrada (`cargaRegistrada`, tolerancia 10 %) = aviso), edición del borrador (`anadirSet/Fila`, `quitar*`, `mover*`, `duplicarSet/Fila`, `renumerar`), `duplicarSesion`, plantillas (`PLANTILLAS`, `lineasDePlantilla`), `planDemo`, `sugerencias` (autocompletar) y nombres de fichero (`Alevin-2026-10-15-jueves.pdf`).
- `js/application/entrenoService.js` — `crearEntrenoService(repo, {puedeEditar, genId, club})`: repositorio inyectado. `guardarPlan` (sustituye las líneas; los errores impiden guardar, los avisos no), `eliminarSesion` (borra también el plan), `duplicarSesion`, `copiarPlan`, `planDesdeSesion/Plantilla`, `sugerencias`, `ficha`/`fichasSemana` (datos para el PDF; admiten un borrador sin guardar). Sin permiso lanza `sin-permiso`.
- `js/infrastructure/pdfEntreno.js` — `generarPdfEntreno(fichas, {t, locale, lib})`: A4 apaisado, cabecera con colores y logo del club (texto claro u oscuro según el contraste), tabla jspdf-autotable con sets separados por línea gruesa, Dist. Set en la última fila de cada set, fila TOTALES, cabeceras repetidas y varias páginas si hace falta (el tamaño de letra baja hasta que cabe en una), pie con club, fecha de generación y página. Los textos salen de `js/locales/entreno.{es,en,it}.js`. La librería se carga de forma diferida (`cargarLibreria`; `usarLibreria` para pruebas). `js/infrastructure/driveEntrenos.js` guarda el PDF en `cnl/entrenos` con `drive.ensureFolderPath/findFile/upload` (si ya existe lo actualiza).
- `js/views/entreno-editor.js` (editor por sets, móvil primero, totales en vivo, plantillas, copia de otra sesión, vista de sólo lectura), `js/views/entreno-acciones.js` (descargar, vista previa, imprimir, Drive) y botones en `js/views/entrenamientos.js`.

## Cargas y contenidos de entrenamiento (arquitectura en capas)
- `js/domain/cargas.js` — **puro** (sin DOM, store ni i18n): catálogo predefinido (`CATALOGO_PREDEFINIDO`, 10 contenidos con id estable `tc-<clave>`), `normalizarNombre` (sin tildes/mayúsculas/espacios), `validarTipo`, siembra (`sembrarCatalogo`), migración (`migrarHeredados`, `prepararCatalogo`), agregados semanales (`agregarSemana`: media por nadador con carga, por contenido y por día) y evaluación de objetivos (`evaluarObjetivo`, `evaluarSemana`).
- `js/application/cargasService.js` — `crearCargasService(repo, {puedeEditar, generarId})`: repositorio inyectado. Crear/editar/activar/mover/borrar/fusionar contenidos, `registrarCarga` (valida nadador, fecha, metros, RPE, minutos, contenido activo y sesión opcional), `semana()`. Sin permiso lanza `sin-permiso`.
- `js/views/cargas-contenidos.js` — gestor "Contenidos de entrenamiento" (usado en Cargas y Configuración) y utilidades de presentación (`chip`, `fmtM`). `js/views/cargas.js`, `inicio.js`, `nadadores.js` y `mi-espacio.js` sólo presentan.
- **Decisiones**: `Cargas.tipo` guarda el NOMBRE del contenido (valor en español, compatible con datos antiguos); la comparación es por nombre normalizado y renombrar un contenido personalizado actualiza sus cargas. Los predefinidos se pueden desactivar/editar (descripción, color, objetivos) pero no borrar ni renombrar; un contenido con cargas no se borra (se desactiva o se fusiona con otro). Las claves de i18n son `tc.<clave>.nombre|desc`; los personalizados se muestran tal cual.
- **Siembra y migración** (`store.ensureCatalog`, al abrir/sincronizar/importar/vaciar): añade los predefinidos que falten (por id, sin duplicar ni pisar ediciones); los tipos antiguos de Cargas/ObjetivosCarga que no coinciden con el catálogo (Aeróbico, Velocidad, Fuerza...) pasan a contenidos personalizados "heredados" con su nombre original (Piernas y Técnica coinciden con los predefinidos); los objetivos de ObjetivosCarga pasan a minSemanalM/maxSemanalM del contenido (sin pisar uno ya definido) y esas filas se eliminan. Las cargas no se reescriben.
- **Criterio de objetivos** (Cargas e Inicio): metros medios por nadador con carga esa semana (o del nadador elegido) frente al objetivo por nadador.

## Permisos
Usuario único: quien inicia sesión es el entrenador y tiene todos los permisos. No hay roles, ni hoja `Usuarios`, ni compartir/unirse a hojas, ni vista *Mi espacio*. (`auth.role()` queda como compatibilidad y devuelve siempre `'entrenador'`.)

## Reglas
- No tocar ficheros de otros agentes. No ejecutar comandos git (commitea el orquestador).
- Código sencillo y comentado lo mínimo. Escapar siempre texto de usuario (usar `h()`/textContent, nunca innerHTML con datos).

## Diseño objetivo (mockup del usuario) — ACTUALIZA el contrato anterior
Aspecto: claro, azul (#1a73e8 aprox.) sobre blanco, tarjetas con bordes redondeados y sombra suave, tipografía limpia (system-ui). Cabecera: logo + nombre del club (grande, azul oscuro) + lema ("Pequeño gran club", azul) | caja con la cuenta de Google (sesión) | campana con contador de avisos | botón salir. Lateral izquierdo (escritorio; barra inferior en móvil) con: Inicio, Nadadores, Grupos, Entrenamientos, Asistencia, Cargas, Marcas, Bañador, Comunicaciones, Configuración. Pie: "© 2025 Club Natación Lugones | lema".
Inicio: banner "¡Bienvenido, Entrenador!" con fecha larga y nadador SVG; tarjetas: Acceso rápido (4 atajos), Control de cargas semanal del club (gráfico de líneas SVG: realizado vs objetivo mínimo/máximo, Lun–Dom, metros), Alertas de cargas (zona por encima/por debajo del objetivo), Próxima sesión (día, hora, grupo, piscina, volumen objetivo, enfoque), Asistencia hoy (donut SVG: asistieron/faltaron/sin confirmar), Comunicaciones recientes.
Cambios de esquema:
- Club: + `lema`. Entrenamientos: + `piscina`, `volumenMin`, `volumenMax`, `enfoque`.
- Cargas: + `tipo` (Aeróbico, Velocidad, Piernas, Técnica, Fuerza).
- Nueva hoja **ObjetivosCarga**: id, tipo, minSemanalM, maxSemanalM.
- Nueva hoja **Banador** (entrega de bañador/equipación): id, nadadorId, talla, estado (`pendiente`|`entregado`), fecha, notas.
- Vista nueva `banador`; vista `grupos` (CRUD de Grupos, nadadores por grupo).
- Módulos de vista: inicio, nadadores, grupos, entrenamientos, asistencia, cargas, marcas, banador, comunicaciones, club.
- Sin gráficos de librerías externas: SVG propio.
