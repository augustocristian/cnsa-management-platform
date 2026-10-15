# CNL Plataforma

[![CI y despliegue](https://github.com/augustocristian/cnsa-management-platform/actions/workflows/pages.yml/badge.svg)](https://github.com/augustocristian/cnsa-management-platform/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-1a73e8?logo=github)](https://augustocristian.github.io/cnsa-management-platform/)
[![PWA](https://img.shields.io/badge/PWA-instalable-5a0fc8?logo=pwa&logoColor=white)](https://augustocristian.github.io/cnsa-management-platform/)
[![Dependabot](https://img.shields.io/badge/Dependabot-activado-025e8c?logo=dependabot&logoColor=white)](.github/dependabot.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-f7df1e?logo=javascript&logoColor=black)
![Sin build](https://img.shields.io/badge/build-ninguno-brightgreen)
![Google Drive](https://img.shields.io/badge/persistencia-Google%20Drive%20%2B%20Excel-0f9d58?logo=googledrive&logoColor=white)
![Estado](https://img.shields.io/badge/estado-en%20desarrollo-orange)

**Gestión integral de un club de natación** — nadadores, entrenamientos, asistencia, cargas, marcas, equipación y comunicaciones en una PWA que funciona desde el móvil, en la piscina.

**[Abrir la aplicación](https://augustocristian.github.io/cnsa-management-platform/)**

Pensada inicialmente para el Club Natación Lugones, con identidad visual configurable para poder adaptarse a otros clubes.

## Funcionalidades

| Módulo | Qué permite |
|---|---|
| **Inicio** | Resumen: accesos rápidos, cargas semanales frente a objetivos, alertas, próxima sesión, asistencia de hoy y comunicaciones recientes |
| **Nadadores** | Alta, edición y ficha individual; categorías en orden (de Prebenjamín a Máster) y grupos |
| **Grupos** | Grupos de entrenamiento y sus nadadores |
| **Entrenamientos** | Planificación semanal: piscina, volumen objetivo, enfoque, estado planificado/realizado |
| **Calendario** | Mes / Semana / Agenda personalizados por rol; exportación `.ics` (Apple, Outlook, Google) y sincronización opcional con Google Calendar |
| **Planificación** | Organiza la piscina: varias piscinas con calles, horario por día y capacidad; asigna cursos a calles y horas (semanal o puntual), detecta conflictos (calle, grupo, entrenador, horario, capacidad), sugiere distribución, vista día/semana e impresión |
| **Asistencia** | Pasar lista desde el móvil con un toque; historial y porcentaje por nadador |
| **Cargas** | Metros por tipo (aeróbico, velocidad, piernas, técnica, fuerza), RPE y objetivos mínimo/máximo con alertas |
| **Marcas** | Tiempos mm:ss.cc, mejores marcas y evolución por prueba (25 m / 50 m) |
| **Bañador** | Control de entrega de bañador/equipación por talla y estado |
| **Comunicaciones** | Avisos para todo el club o por grupo |
| **Configuración** | Nombre, lema, logotipo y colores del club; usuarios y roles; importar/exportar Excel |
| **Mi espacio** | Vista personal del nadador con lo que el club habilite |

### Roles
- **Administrador**: todo.
- **Entrenador**: todo salvo configuración del club.
- **Nadador**: su espacio personal y las comunicaciones que le correspondan.

## Calendario

Vista `#/calendario` con **Mes / Semana / Agenda**, código de color por grupo y leyenda. Los eventos son las sesiones de *Entrenamientos* y las asignaciones de calle de la *Planificación de piscina* (las semanales se expanden a fechas concretas con su nº de calle; una sesión concreta del mismo grupo y día manda sobre la asignación).

- **Por rol**: el nadador sólo ve su grupo (vínculo `Usuarios.nadadorId` o email en *Nadadores*); el entrenador, los grupos cuyo `Grupos.entrenador` coincide con su nombre o email (interruptor *Todos los grupos*; si no entrena ninguno, ve todos); el administrador, todo con filtros por grupo y piscina.
- **Exportar `.ics`** (RFC 5545): mes visible, temporada (1 sep - 31 ago) o próximos 90 días, con recordatorio opcional de 30/60 min. Es una **instantánea**: una suscripción por URL en vivo no es posible sin servidor, así que hay que volver a exportar para actualizar (los UID son estables, `<id>@cnl-plataforma`, por lo que reimportar actualiza en lugar de duplicar). La zona horaria del club se guarda en *Club* (clave `zonaHoraria`, por defecto `Europe/Madrid`); el `.ics` incluye un `VTIMEZONE` generado con las transiciones reales del rango.
- **Sincronizar con Google Calendar** (sólo con login Google): consentimiento incremental del scope `calendar.events` al activarlo, upsert idempotente en el calendario principal (eventos marcados con `extendedProperties.private.cnlId`), resumen creados/actualizados/borrados/errores y *Dejar de sincronizar*. Configuración: [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md).

## Persistencia

- **Con Google**: inicio de sesión con Google; los datos de cada club viven en una **Google Sheet compartida** (una pestaña por entidad, creada en la carpeta `cnl` de tu Drive). El propietario la comparte con los demás entrenadores desde Drive y ellos se unen con el enlace o ID de la hoja. Se usan los permisos `spreadsheets` y `drive.file`. Los cambios de otros usuarios se detectan cada ~30 s y se fusionan sin perder los tuyos.
- **Modo local**: sin Client ID de Google la app funciona con datos de ejemplo en el navegador (localStorage), con importación/exportación de `.xlsx`.
- Caché local y sincronización diferida para trabajar sin conexión; `.xlsx` exportable como copia de seguridad.

Configuración del login de Google: [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md).

## Arquitectura

PWA 100 % estática (sin servidor ni build): JavaScript con ES modules, SheetJS para el Excel y SVG propio para los gráficos. Detalle del contrato entre módulos en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
index.html · manifest.webmanifest · sw.js
css/app.css
js/  app.js router.js ui.js store.js auth.js drive.js schema.js config.js
js/domain/ (lógica pura)  js/application/ (servicios)  js/infrastructure/ (APIs externas)
js/views/  inicio nadadores grupos entrenamientos planificacion asistencia cargas marcas banador comunicaciones club mi-espacio
vendor/  xlsx.full.min.js   (generado desde npm)
```

## Desarrollo

```bash
npm install        # instala dependencias y copia SheetJS a vendor/
npm run check      # comprueba la sintaxis de los módulos
python -m http.server 8080   # o cualquier servidor estático
```

Abre `http://localhost:8080` y pulsa **Probar en modo local**.

## Pruebas

| Nivel | Comando | Qué cubre |
|---|---|---|
| Unitarias | `npm run test:unit` | Lógica de módulos (store, drive, auth...) con `node --test` y jsdom |
| Integración | `npm run test:integration` | Vistas y store trabajando juntos sobre jsdom |
| E2E (Cucumber) | `npm run test:e2e` | Especificaciones en Gherkin español (`features/*.feature`) ejecutadas con Playwright/Chromium en escritorio y después en móvil (Pixel 5, `VIEWPORT=movil`) |

Las pruebas E2E levantan solas el servidor estático en un puerto libre, parten de un navegador limpio en modo local con datos de demostración y fallan si aparecen errores de consola o respuestas 4xx/5xx. Primera vez: `npx playwright install chromium`. Informes en `reports/` (HTML, JUnit y capturas de los fallos). Los escenarios con `@google @pendiente` (Google Sheets, multi club real) están documentados pero excluidos; `npx cucumber-js --tags @smoke` ejecuta sólo los esenciales.

## Despliegue

Cada push a `main` ejecuta [el workflow](.github/workflows/pages.yml) (`npm ci`, comprobación y despliegue en GitHub Pages). Requiere activar *Settings > Pages > Source: GitHub Actions*.

## Dependencias

Gestionadas con npm y actualizadas semanalmente por [Dependabot](.github/dependabot.yml) (npm y GitHub Actions).

## Estado del proyecto

Primera versión funcional. Pendiente: probar el flujo completo con Google en producción, permisos más finos y refinar el diseño por módulo.
