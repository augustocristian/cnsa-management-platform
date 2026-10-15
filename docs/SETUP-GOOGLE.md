# Configurar el login con Google y Drive

Sin Client ID la app funciona en **modo local** (datos en el navegador, importar/exportar .xlsx). Para guardar en Google Drive sigue estos pasos.

## 1. Crear el proyecto
1. Entra en <https://console.cloud.google.com/> con tu cuenta de Google.
2. Arriba, pulsa el selector de proyectos y elige **Proyecto nuevo**. Nómbralo, por ejemplo, `CNL Plataforma`, y créalo.

## 2. Activar la Drive API
1. Menú **APIs y servicios > Biblioteca**.
2. Busca **Google Drive API** y pulsa **Habilitar**.

## 3. Pantalla de consentimiento OAuth
1. Menú **APIs y servicios > Pantalla de consentimiento de OAuth** (o **Google Auth Platform**).
2. Tipo de usuario: **Externo**. Rellena nombre de la app, correo de soporte y correo de contacto.
3. En **Permisos (scopes)** añade: `openid`, `email`, `profile` y `https://www.googleapis.com/auth/drive.file`. Este último sólo da acceso a los ficheros que crea la propia app.
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
- Tras iniciar sesión se crea (si no existe) la carpeta `cnl` en tu Drive y, dentro, un fichero `NombreClub.xlsx` por club.
- Cada club es un fichero distinto: el aislamiento lo dan los permisos de Drive. Para que otro entrenador vea un club, comparte el fichero desde Drive.
- Con el scope `drive.file` la app sólo ve los ficheros que ella misma creó o que el usuario abrió con ella.
- Los cambios se guardan en caché local y se suben a Drive automáticamente (con unos segundos de espera) o con el botón Sincronizar.

## Problemas frecuentes
- **Error `origin_mismatch`**: el origen no está en la lista del paso 4 (comprueba `https`, sin barra final).
- **Acceso bloqueado / app no verificada**: añade tu correo como usuario de prueba (paso 3) o publica la app.
- **El popup no se abre**: el navegador lo bloquea; permite ventanas emergentes para el sitio.
