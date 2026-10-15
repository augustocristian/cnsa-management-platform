# CNL Plataforma

[![CI y despliegue](https://github.com/augustocristian/cnsa-management-platform/actions/workflows/pages.yml/badge.svg)](https://github.com/augustocristian/cnsa-management-platform/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-1a73e8?logo=github)](https://augustocristian.github.io/cnsa-management-platform/)
[![PWA](https://img.shields.io/badge/PWA-instalable-5a0fc8?logo=pwa&logoColor=white)](https://augustocristian.github.io/cnsa-management-platform/)
[![Dependabot](https://img.shields.io/badge/Dependabot-activado-025e8c?logo=dependabot&logoColor=white)](.github/dependabot.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-f7df1e?logo=javascript&logoColor=black)
![Sin build](https://img.shields.io/badge/build-ninguno-brightgreen)
![Google Drive](https://img.shields.io/badge/persistencia-Google%20Drive-0f9d58?logo=googledrive&logoColor=white)
![Estado](https://img.shields.io/badge/estado-en%20desarrollo-orange)

**Gestión integral de un club de natación** — nadadores, entrenamientos, asistencia, cargas, marcas, equipación y comunicaciones en una PWA que funciona desde el móvil, en la piscina.

**[Abrir la aplicación](https://augustocristian.github.io/cnsa-management-platform/)**

App de **uso individual**: entras con tu cuenta de Google y **todo se guarda en la carpeta `cnl` de tu propio Google Drive** (sin servidor, sin base de datos y sin modos de prueba). Pensada inicialmente para el Club Natación Lugones, con identidad visual configurable para poder adaptarse a otros clubes.

## Funcionalidades

| Módulo | Qué permite |
|---|---|
| **Inicio** | Resumen: accesos rápidos, cargas semanales frente a objetivos, alertas, próxima sesión, asistencia de hoy y comunicaciones recientes |
| **Nadadores** | Alta, edición y ficha individual; categorías en orden (de Prebenjamín a Máster) y grupos |
| **Grupos** | Grupos de entrenamiento y sus nadadores |
| **Entrenamientos** | Planificación semanal: piscina, volumen objetivo, enfoque, estado planificado/realizado. **Plan de entreno detallado** por sets (tiempo, objetivo, bloques, series, distancia, salida, ejercicio, material, notas) con totales en vivo, plantillas y copia desde otras sesiones, y **PDF de entreno** (A4 apaisado) de una sesión o de toda la semana: descargar, vista previa, imprimir y guardar en `cnl/entrenos` de Drive |
| **Calendario** | Mes / Semana / Agenda con filtros por grupo y piscina; exportación `.ics` (Apple, Outlook, Google) y sincronización opcional con Google Calendar |
| **Planificación** | Organiza la piscina: varias piscinas con calles, horario por día y capacidad; asigna cursos a calles y horas (semanal o puntual), detecta conflictos (calle, grupo, entrenador, horario, capacidad), sugiere distribución, vista día/semana e impresión |
| **Asistencia** | Pasar lista desde el móvil con un toque; historial y porcentaje por nadador |
| **Cargas** | Metros por contenido de entrenamiento (catálogo predefinido de intensidades y trabajo específico, más los que añadas), sesión opcional, RPE y objetivos mínimo/máximo con alertas |
| **Marcas** | Tiempos mm:ss.cc, mejores marcas y evolución por prueba (25 m / 50 m) |
| **Bañador** | Control de entrega de bañador/equipación por talla y estado |
| **Comunicaciones** | Avisos para todo el club o por grupo |
| **Configuración** | Nombre, lema, logotipo y colores del club; dónde se guardan los datos en Drive; copia de seguridad en Excel (exportar, importar y guardar en `cnl/`); preferencias; cambiar de club |

### Primer arranque

1. **Configuración necesaria**: si la copia de la app no tiene Client ID de Google (constante `BUILTIN_CLIENT_ID` de `js/config.js`), se muestra esta pantalla con un enlace al tutorial de 5 minutos y un campo para probar un ID (queda guardado sólo en ese navegador hasta fijarlo en `js/config.js`). Es una tarea del propietario de la app, una sola vez.
2. **Iniciar sesión con Google**: único camino de acceso. Errores típicos (ventana bloqueada, correo que no es usuario de prueba, origen no autorizado, API de Drive no activada) se explican en pantalla.
3. **Asistente de club** (sólo la primera vez): dos pasos (nombre y lema; colores y zona horaria) que crean el fichero del club dentro de `cnl/`. El club nace **vacío**: sin datos de ejemplo, con una tarjeta de *Primeros pasos* y estados vacíos con llamadas a la acción.

Uso individual: quien inicia sesión es el entrenador y tiene todos los permisos. No hay usuarios, roles, hojas compartidas ni "unirse con enlace"; sí puedes tener **varios clubes** (varios ficheros en `cnl/`) y cambiar entre ellos desde *Configuración*.

## Calendario

Vista `#/calendario` con **Mes / Semana / Agenda**, código de color por grupo y leyenda. Los eventos son las sesiones de *Entrenamientos* y las asignaciones de calle de la *Planificación de piscina* (las semanales se expanden a fechas concretas con su nº de calle; una sesión concreta del mismo grupo y día manda sobre la asignación).

- **Filtros**: el entrenador lo ve todo y puede filtrar por grupo y por piscina; la vista elegida, la ventana de sincronización y el recordatorio se guardan en sus preferencias de Drive.
- **Exportar `.ics`** (RFC 5545): mes visible, temporada (1 sep - 31 ago) o próximos 90 días, con recordatorio opcional de 30/60 min. Es una **instantánea**: una suscripción por URL en vivo no es posible sin servidor, así que hay que volver a exportar para actualizar (los UID son estables, `<id>@cnl-plataforma`, por lo que reimportar actualiza en lugar de duplicar). La zona horaria del club se guarda en *Club* (clave `zonaHoraria`, por defecto `Europe/Madrid`); el `.ics` incluye un `VTIMEZONE` generado con las transiciones reales del rango.
- **Sincronizar con Google Calendar** (con tu sesión de Google): consentimiento incremental del scope `calendar.events` al activarlo, upsert idempotente en el calendario principal (eventos marcados con `extendedProperties.private.cnlId`), resumen creados/actualizados/borrados/errores y *Dejar de sincronizar*. Configuración: [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md).

## Persistencia: Google Drive

Todo vive en la carpeta **`cnl`** de tu Google Drive, con **un único permiso**: `drive.file` (la app sólo ve los ficheros que ella misma crea; no es un permiso sensible y no requiere verificación de Google). No se usa la API de Google Sheets.

| Dónde | Qué guarda |
|---|---|
| `cnl/<Club>.json` | Todos los datos y la configuración del club: identidad, lema, colores, logotipo, zona horaria, nadadores, grupos, entrenamientos, asistencia, cargas, marcas, catálogo de contenidos, piscinas... Uno por club. |
| `cnl/preferencias.json` | Tus preferencias: idioma, último club abierto, progreso del tutorial, vista y recordatorio del calendario y mapa de sincronización con Google Calendar. Con versión de esquema y fusión por clave. |
| `cnl/entrenos/` | PDFs de entrenamientos guardados desde la app. |
| `cnl/<Club>.xlsx` | Copia de seguridad opcional en Excel (*Configuración > Guardar copia Excel en Drive*). |
| localStorage | Sólo **caché y espejo** (arranque rápido y uso sin conexión, con cola de cambios pendientes). Nunca es la fuente de verdad. Aparte: el Client ID de pruebas del propietario y el aviso de instalación descartado (preferencias de este dispositivo). |

Tabla completa "Dónde vive cada dato" en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Los cambios se guardan con *debounce* y fusión por fila (`id`) si otro dispositivo modificó el fichero (se detecta con `md5Checksum`/`modifiedTime`); sin red quedan en una cola y se suben al volver. Si ya tenías una carpeta `cnl` hecha a mano, la app crea y usa la suya (con `drive.file` no ve la otra): puedes mover o compartir lo tuyo desde Drive.

Configuración de Google (5 minutos, una sola vez): [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md).

## Arquitectura

PWA 100 % estática (sin servidor ni build): JavaScript con ES modules, SheetJS para el Excel y SVG propio para los gráficos. Detalle del contrato entre módulos en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
index.html · manifest.webmanifest · sw.js
css/app.css
js/  app.js router.js ui.js store.js auth.js drive.js preferencias.js schema.js config.js
js/domain/ (lógica pura)  js/application/ (servicios)  js/infrastructure/ (APIs externas; fakeGoogle.js = herramienta de pruebas)
js/views/  acceso (login, asistente, configuración necesaria) inicio nadadores grupos entrenamientos planificacion asistencia cargas marcas banador comunicaciones club
vendor/  xlsx.full.min.js  jspdf.umd.min.js  jspdf.plugin.autotable.min.js   (generados desde npm; jsPDF se carga de forma diferida sólo al pedir un PDF)
```

## Desarrollo

```bash
npm install        # instala dependencias y copia SheetJS a vendor/
npm run check      # comprueba la sintaxis de los módulos
python -m http.server 8080   # o cualquier servidor estático
```

Para iniciar sesión hace falta un Client ID de Google ([docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md)): pégalo en `js/config.js` (`BUILTIN_CLIENT_ID`) o en la pantalla *Configuración necesaria*, y añade `http://localhost:8080` a los orígenes autorizados. Sin Google real, la herramienta de pruebas (abajo) arranca la app con una sesión y un Drive simulados.

## Pruebas

| Nivel | Comando | Qué cubre |
|---|---|---|
| Unitarias | `npm run test:unit` | Lógica de módulos (store, drive, auth, preferencias, asistente...) con `node --test` y jsdom |
| Integración | `npm run test:integration` | Vistas y store trabajando juntos sobre jsdom |
| E2E (Cucumber) | `npm run test:e2e` | Especificaciones en Gherkin español (`features/*.feature`) ejecutadas con Playwright/Chromium en escritorio y después en móvil (Pixel 5, `VIEWPORT=movil`) |

**Pruebas sin Google real.** `js/infrastructure/fakeGoogle.js` es un adaptador en memoria que implementa las mismas interfaces que `auth.js` y `drive.js` (sesión simulada, carpeta `cnl`, fichero del club, `preferencias.json`, subida de ficheros) y datos de demostración vía `store.seedDemo`. Es una **herramienta de pruebas**, invisible para el usuario: sólo se carga con `localStorage['cnl:test'] = '1'` (o `window.__CNL_TEST__`). Opciones (JSON en `localStorage['cnl:test:opts']` u objeto en `__CNL_TEST__`): `sesion` (arranca con sesión iniciada), `demo` (club con datos de demostración), `sinClientId` (pantalla *Configuración necesaria*), `usuario`, `errorLogin` y `fallos` (errores forzados). `window.__CNL_FAKE__` permite inspeccionar el Drive simulado (`clubs()`, `prefs()`, `archivos()`). Los tests unitarios e integración lo instalan con `instalarFakeGoogle({auth, drive, opciones})` (ver `tests/helpers/app.js`); los e2e con los pasos `Dado un club con datos de demostración` o `Dado que la aplicación está recién abierta sin sesión`.

Las pruebas E2E levantan solas el servidor estático en un puerto libre, parten de un navegador limpio con sesión y Drive simulados (club con datos de demostración o vacío según el escenario) y fallan si aparecen errores de consola o respuestas 4xx/5xx. Primera vez: `npx playwright install chromium`. Informes en `reports/` (HTML, JUnit y capturas de los fallos). Los escenarios con `@google @pendiente` (requieren una cuenta real de Google) están documentados pero excluidos; `npx cucumber-js --tags @smoke` ejecuta sólo los esenciales.

## Despliegue

Cada push a `main` ejecuta [el workflow](.github/workflows/pages.yml) (`npm ci`, comprobación y despliegue en GitHub Pages). Requiere activar *Settings > Pages > Source: GitHub Actions*.

## Dependencias

Gestionadas con npm y actualizadas semanalmente por [Dependabot](.github/dependabot.yml) (npm y GitHub Actions).

## Estado del proyecto

Primera versión funcional. Pendiente: probar el flujo completo con una cuenta real de Google en producción y refinar el diseño por módulo.
