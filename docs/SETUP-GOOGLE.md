# Configurar el login con Google, Sheets y Drive

Sin Client ID la app funciona en **modo local** (datos en el navegador, importar/exportar .xlsx). Para guardar en una Google Sheet compartida sigue estos pasos.

## 1. Crear el proyecto
1. Entra en <https://console.cloud.google.com/> con tu cuenta de Google.
2. Arriba, pulsa el selector de proyectos y elige **Proyecto nuevo**. Nómbralo, por ejemplo, `CNL Plataforma`, y créalo.

## 2. Activar las APIs
1. Menú **APIs y servicios > Biblioteca**.
2. Busca **Google Sheets API** y pulsa **Habilitar**.
3. Busca **Google Drive API** y pulsa **Habilitar** (carpeta `cnl` y compartir por email).

## 3. Pantalla de consentimiento OAuth
1. Menú **APIs y servicios > Pantalla de consentimiento de OAuth** (o **Google Auth Platform**).
2. Tipo de usuario: **Externo**. Rellena nombre de la app, correo de soporte y correo de contacto.
3. En **Permisos (scopes)** añade: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/spreadsheets` y `https://www.googleapis.com/auth/drive.file`. Ninguno es un scope restringido; `drive.file` sólo da acceso a los ficheros que crea o abre la propia app.
4. Mientras la app esté en modo **Pruebas**, añade en **Usuarios de prueba** los correos que vayan a entrar (admin, entrenadores). Para abrirla a cualquiera, pulsa **Publicar aplicación**.

## 4. Crear el ID de cliente OAuth
1. Menú **APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. En **Orígenes autorizados de JavaScript** añade:
   - `https://augustocristian.github.io`
   - (para pruebas locales) `http://localhost:8000` o el puerto que uses
4. No hace falta ninguna URI de redireccionamiento (se usa el flujo de token de Google Identity Services).
5. Pulsa **Crear** y copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).

## 5. Configurar la app
Edita `js/config.js` y pega el ID:

```js
export const GOOGLE_CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';
```

Sube el cambio a GitHub Pages. El Client ID no es secreto, puede estar en el repositorio.

## 6. Cómo funciona
- Al crear un club se crea una **Google Sheet** con una pestaña por entidad (Club, Usuarios, Nadadores, ...; fila 1 = cabeceras) y se guarda en la carpeta `cnl` de tu Drive.
- **Compartir el club**: abre la hoja en Google Drive > **Compartir** y añade el correo de cada entrenador como **Editor** (o usa *Configuración > Compartir > Compartir por email*, que lo hace por ti). Envíales el enlace (o el ID de la hoja, la parte entre `/d/` y `/edit`).
- **Unirse**: la otra persona inicia sesión, en el selector de club escribe el enlace o ID en *Unirse con enlace o ID de hoja* y pulsa **Unirse**. El club queda guardado en su dispositivo.
- Los roles los define la pestaña **Usuarios** (se edita en *Configuración*). El propietario (quien creó el club) es siempre administrador.
- Los cambios se guardan en caché local y se suben a la hoja automáticamente (unos segundos de espera) o con el botón Sincronizar. Cada ~30 s la app comprueba si otra persona ha cambiado la hoja y fusiona los cambios sin perder los tuyos pendientes.
- No edites a mano las cabeceras de la fila 1 ni borres pestañas; sí puedes ver los datos desde Google Sheets. El .xlsx exportado sirve de copia de seguridad.

## Problemas frecuentes
- **Error 403 al abrir o guardar**: la hoja no está compartida contigo como Editor, o falta activar Google Sheets API / Drive API en el proyecto.
- **Error 404 al unirse**: el enlace o ID es incorrecto, o la hoja no se ha compartido con tu cuenta.
- **Error `origin_mismatch`**: el origen no está en la lista del paso 4 (comprueba `https`, sin barra final).
- **Acceso bloqueado / app no verificada**: añade tu correo como usuario de prueba (paso 3) o publica la app.
- **El popup no se abre**: el navegador lo bloquea; permite ventanas emergentes para el sitio.
