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

👉 **[Abrir la aplicación](https://augustocristian.github.io/cnsa-management-platform/)**

Pensada inicialmente para el Club Natación Lugones, con identidad visual configurable para poder adaptarse a otros clubes.

## Funcionalidades

| Módulo | Qué permite |
|---|---|
| **Inicio** | Resumen: accesos rápidos, cargas semanales frente a objetivos, alertas, próxima sesión, asistencia de hoy y comunicaciones recientes |
| **Nadadores** | Alta, edición y ficha individual; categorías en orden (Prebenjamín → Máster) y grupos |
| **Grupos** | Grupos de entrenamiento y sus nadadores |
| **Entrenamientos** | Planificación semanal: piscina, volumen objetivo, enfoque, estado planificado/realizado |
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

## Persistencia

- **Con Google**: inicio de sesión con Google; los datos de cada club se guardan en un **Excel (.xlsx) dentro de la carpeta `cnl` de tu Google Drive** (una hoja por entidad). Cada club es un fichero distinto, de modo que el aislamiento entre clubes lo dan los permisos de Drive. Usa el permiso `drive.file`: la app solo ve los ficheros que ella crea.
- **Modo local**: sin Client ID de Google la app funciona con datos de ejemplo en el navegador (localStorage), con importación/exportación de `.xlsx`.
- Caché local y sincronización diferida para trabajar sin conexión.

Configuración del login de Google: [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md).

## Arquitectura

PWA 100 % estática (sin servidor ni build): JavaScript con ES modules, SheetJS para el Excel y SVG propio para los gráficos. Detalle del contrato entre módulos en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
index.html · manifest.webmanifest · sw.js
css/app.css
js/  app.js router.js ui.js store.js auth.js drive.js schema.js config.js
js/views/  inicio nadadores grupos entrenamientos asistencia cargas marcas banador comunicaciones club mi-espacio
vendor/  xlsx.full.min.js   (generado desde npm)
```

## Desarrollo

```bash
npm install        # instala dependencias y copia SheetJS a vendor/
npm run check      # comprueba la sintaxis de los módulos
python -m http.server 8080   # o cualquier servidor estático
```

Abre `http://localhost:8080` y pulsa **Probar en modo local**.

## Despliegue

Cada push a `main` ejecuta [el workflow](.github/workflows/pages.yml) (`npm ci`, comprobación y despliegue en GitHub Pages). Requiere activar *Settings → Pages → Source: GitHub Actions*.

## Dependencias

Gestionadas con npm y actualizadas semanalmente por [Dependabot](.github/dependabot.yml) (npm y GitHub Actions).

## Estado del proyecto

Primera versión funcional. Pendiente: probar el flujo completo con Google en producción, permisos más finos y refinar el diseño por módulo.
