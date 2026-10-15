# Configurar el inicio de sesión con Google (5 minutos, una sola vez)

La aplicación **necesita** un ID de cliente de Google: sirve para iniciar sesión y guardar tus datos en tu propio Drive. No hay modo local ni datos fuera de tu cuenta. Lo hace **una sola vez quien publica la app**; después, quien la use sólo verá el botón *Iniciar sesión con Google*.

Todo se guarda en la carpeta `cnl` de tu Drive con **un único permiso, `drive.file`** (la app sólo accede a los ficheros que ella misma crea). Ese permiso **no es sensible**, no requiere verificación de Google y **no hace falta activar la API de Google Sheets**: sólo la de Drive.

El tutorial interactivo de la propia app (menú *Tutorial*, o el enlace de la pantalla *Configuración necesaria*) recorre estos mismos pasos con botones de copiar.

## 1. Crear el proyecto
1. Entra en <https://console.cloud.google.com/> con tu cuenta de Google.
2. Selector de proyectos > **Proyecto nuevo**. Nómbralo, por ejemplo, `CNL Plataforma`, y créalo.

## 2. Activar la API de Google Drive
1. Abre <https://console.cloud.google.com/apis/library/drive.googleapis.com> y pulsa **Habilitar**.
2. *(Sólo si vas a sincronizar con Google Calendar)* Habilita también **Google Calendar API**.

## 3. Pantalla de consentimiento OAuth
1. Menú **APIs y servicios > Pantalla de consentimiento de OAuth** (o **Google Auth Platform**).
2. Tipo de usuario: **Externo**. Rellena nombre de la app, correo de soporte y correo de contacto.
3. En **Permisos (scopes)** añade sólo `https://www.googleapis.com/auth/drive.file` (los de perfil básico `openid`, `email` y `profile` ya van incluidos). Si vas a usar la sincronización con Google Calendar, el permiso `https://www.googleapis.com/auth/calendar.events` se pide **sólo al pulsar *Sincronizar con Google Calendar***, no al iniciar sesión.
4. En **Usuarios de prueba** añade **tu correo de Google** (mientras la app esté en modo *Pruebas* sólo entran esas cuentas). Si prefieres no depender de la lista, pulsa **Publicar aplicación**: con `drive.file` no hace falta la verificación de Google.

## 4. Crear el ID de cliente OAuth
1. **APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. En **Orígenes autorizados de JavaScript** añade:
   - `https://augustocristian.github.io` (GitHub Pages)
   - (para desarrollo) `http://localhost:8080` o el puerto que uses
4. No hace falta ninguna URI de redireccionamiento (se usa el flujo de token de Google Identity Services).
5. Pulsa **Crear** y copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).

## 5. Pegar el ID en la aplicación
Edita `js/config.js` y pégalo entre las comillas de `BUILTIN_CLIENT_ID`:

```js
const BUILTIN_CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';
```

Sube el cambio a GitHub Pages. El Client ID no es secreto, puede estar en el repositorio.

Para probarlo **antes** de publicar, abre la app: mientras la constante esté vacía verás *Configuración necesaria*, con un campo para pegar el ID y **Probar y guardar** (abre el inicio de sesión de Google; si funciona, el ID queda guardado sólo en ese navegador en `localStorage['cnl:clientId']`). Esa pantalla también muestra el **origen actual** de la página (cópialo en el paso 4 si Google dice `origin_mismatch`).

## 6. Cómo funciona
- La primera vez, un asistente de dos pasos crea tu club **vacío** (sin datos de ejemplo) en `cnl/<NombreClub>.json`.
- En la carpeta `cnl` de tu Drive hay: `<Club>.json` (todos los datos y la configuración del club, uno por club), `preferencias.json` (idioma, último club, progreso del tutorial, vista y recordatorio del calendario, mapa de sincronización con Google Calendar), `entrenos/` (PDFs de entrenamientos) y, si la creas, la copia `<Club>.xlsx`.
- **Carpeta `cnl` previa**: con `drive.file` la app no puede ver carpetas ni ficheros que no creó ella. Si ya tenías una carpeta `cnl` hecha a mano, la app crea (y reutiliza) la suya; puedes mover o compartir lo tuyo desde Drive. No se duplica: si la carpeta de la app ya existe, la reutiliza.
- Los cambios se guardan automáticamente (unos segundos de espera), con caché local para trabajar sin conexión y una cola de cambios pendientes que se sube al volver la red. Si editas desde otro dispositivo, la app detecta el cambio (`md5Checksum`/`modifiedTime`) y fusiona por fila sin perder lo tuyo.
- **Copia de seguridad**: *Configuración* permite exportar/importar `.xlsx` y guardar una copia en `cnl/`.
- *Salir* cierra la sesión y **revoca** el permiso concedido a la app.

## Problemas frecuentes
- **«Acceso bloqueado» / «aplicación no verificada» / `access_denied`**: tu correo no está en **Usuarios de prueba** (paso 3.4), o la app está en *Pruebas*. Añádelo (la app te enlaza a la pantalla de consentimiento) o publica la aplicación.
- **`origin_mismatch` / «origen no autorizado»**: el origen desde el que abres la app no está en el paso 4.3 (comprueba `https`, el puerto y que no lleve barra final). La app muestra el origen actual para copiarlo.
- **El popup no se abre / se cierra solo**: el navegador lo bloquea; permite las ventanas emergentes del sitio y vuelve a pulsar el botón.
- **«La API de Google Drive no está activada»** (error 403 `accessNotConfigured`): habilítala en el paso 2; la app muestra el enlace directo de activación.
- **«Google ha denegado el acceso a tu Drive»** (403): cierra sesión y vuelve a entrar aceptando el permiso de archivos.
- **La sesión caduca**: en modo *Pruebas* Google puede cerrarla a los 7 días; vuelve a iniciar sesión (los datos no se pierden).

## 7. Sincronizar con Google Calendar (opcional)
- Requiere la **Google Calendar API** habilitada (paso 2) y el scope `calendar.events`. En modo *Pruebas* tu correo debe estar en *Usuarios de prueba*; Google mostrará el aviso de app no verificada hasta que se publique y verifique (este scope sí es sensible).
- Al pulsar **Sincronizar con Google Calendar** en *Calendario*, Google pide el permiso adicional (consentimiento incremental). Los eventos se crean en el **calendario principal** marcados con una propiedad privada (`cnlId`, `cnlClub`).
- **Dejar de sincronizar** elimina de Google Calendar los eventos creados por la app. El mapa de sincronización se guarda en tus preferencias de Drive (`cnl/preferencias.json`); si se pierde, la app reencuentra los eventos por su marca y no los duplica.
- Error *API has not been used / is disabled*: habilita Google Calendar API. Error 403 de permisos: vuelve a pulsar el botón y acepta el acceso a eventos.
