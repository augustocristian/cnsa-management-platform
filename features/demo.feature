# language: es
@demo
Característica: Modo demostración (solo mientras no hay ID de cliente de Google) y conexión con Google Drive
  Como persona que abre la aplicación antes de que se configure Google quiero poder probarla con datos de ejemplo sin conectar
  ningún Drive, y conectar Google Drive cuando haya un ID de cliente y quiera guardar mis datos. La demo solo se ofrece mientras
  no haya ID de cliente de Google (ni en el navegador ni en js/config.js). La aplicación no tiene inicio de sesión: solo pide
  permiso para los archivos que ella misma crea en mi Drive y nunca muestra ni guarda quién soy.

  # El modo demostración guarda todo solo en este navegador (espacio cnl:demo:*) y no toca nunca Google Drive.
  # Sin ID de cliente el adaptador de pruebas se abre con la opción sinClientId; con ID de cliente, es la apertura normal.

  @smoke
  Escenario: Sin ID de cliente de Google se ofrece la demo antes que la configuración
    Dado que la aplicación está abierta sin Client ID de Google
    Entonces veo el encabezado "Configuración necesaria"
    Y veo el botón "Probar la demo"
    Y veo el texto "Datos de ejemplo guardados solo en este dispositivo; no se envía nada a Drive."
    Y la demo es la primera acción de la pantalla
    Y no veo el botón "Conectar Google Drive"
    Y veo el botón "Probar y guardar"
    Y el navegador no guarda ningún dato de la demo

  @smoke
  Escenario: Con ID de cliente de Google no se ofrece la demo
    Dado que la aplicación está recién abierta sin Drive conectado
    Entonces veo el botón "Conectar Google Drive"
    Y no veo el botón "Probar la demo"
    Y la pantalla de inicio no menciona la demo
    Y la pantalla de inicio no habla de cuentas ni de iniciar sesión
    Y el navegador no guarda ningún dato de la demo

  @smoke
  Escenario: La demo muestra datos de ejemplo y un aviso permanente de que no se guarda en Drive
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Entonces estoy en el módulo "Inicio"
    Y el aviso de la demo está visible
    Y veo el texto "Modo demostración: tus datos no se guardan en Drive."
    Y el aviso de la demo ofrece "Configurar Google Drive"
    Y el aviso de la demo ofrece "Salir de la demo"
    Y el aviso de la demo no ofrece "Conectar Google Drive"
    Cuando abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Lucía Fernández"
    Cuando abro el módulo "Calendario"
    Entonces el aviso de la demo está visible
    Y los datos de la demo solo existen en este navegador
    Y Drive no contiene ningún club

  Escenario: Lo que se hace en la demo se conserva al recargar y sigue sin tocar Drive
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Y abro el módulo "Nadadores"
    Y doy de alta al nadador con los datos:
      | Nombre    | Itziar     |
      | Apellidos | De la demo |
    Y recargo la aplicación
    Entonces el aviso de la demo está visible
    Cuando abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Itziar"
    Y Drive no contiene ningún club

  Escenario: Salir de la demo borra sus datos tras confirmar y vuelve a la pantalla de configuración
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Y pulso "Salir de la demo" en el aviso de la demo
    Y confirmo que quiero salir de la demo
    Entonces veo el botón "Probar la demo"
    Y veo el encabezado "Configuración necesaria"
    Y el navegador no guarda ningún dato de la demo
    Cuando recargo la pantalla de inicio
    Entonces veo el botón "Probar la demo"
    Y no se ve el aviso de la demo

  Escenario: Desde la demo se abre la configuración, se puede volver a la demo y no se pierde nada
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Y pulso "Configurar Google Drive" en el aviso de la demo
    Entonces veo el encabezado "Configuración necesaria"
    Y veo el botón "Volver a la demo"
    Y no veo el botón "Probar la demo"
    Y veo el botón "Probar y guardar"
    Y veo el texto "se cierra la demo y se borran sus datos"
    Cuando pulso "Volver a la demo"
    Entonces el aviso de la demo está visible
    Cuando abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Lucía Fernández"

  Escenario: Configurar el ID de cliente desde la demo conecta Drive, cierra la demo y empieza con un club real vacío
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Y pulso "Configurar Google Drive" en el aviso de la demo
    Y relleno "ID de cliente de Google" con "123456-abc.apps.googleusercontent.com"
    Y pulso "Probar y guardar"
    Entonces veo el encabezado "Crea tu club"
    Y Drive está conectado
    Y el navegador no guarda ningún dato de la demo
    Cuando relleno "Nombre del club" con "Club Real"
    Y pulso "Siguiente"
    Y pulso "Crear mi club"
    Entonces no se ve el aviso de la demo
    Cuando abro el módulo "Nadadores"
    Entonces el listado de nadadores está vacío
    Y Drive contiene el club "Club Real"

  Escenario: Si Google rechaza la conexión desde la configuración de la demo, la demo sigue funcionando
    Dado que la aplicación está abierta sin Client ID de Google y Google rechaza la conexión con "popup-cerrado"
    Cuando pulso "Probar la demo"
    Y pulso "Configurar Google Drive" en el aviso de la demo
    Y relleno "ID de cliente de Google" con "123456-abc.apps.googleusercontent.com"
    Y pulso "Probar y guardar"
    Entonces veo el texto "Se cerró la ventana de Google antes de terminar"
    Cuando pulso "Volver a la demo"
    Entonces el aviso de la demo está visible
    Y el aviso de la demo ofrece "Configurar Google Drive"
    Cuando abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Lucía Fernández"

  @smoke
  Escenario: Si se configura un ID de cliente con la demo abierta, la demo se cierra al arrancar con un aviso y se borran sus datos
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Entonces el aviso de la demo está visible
    Cuando se configura un ID de cliente de Google y recargo la aplicación
    Entonces veo el texto "Ya hay un ID de cliente de Google configurado: se cerró la demo. Conecta Google Drive para continuar."
    Y veo el botón "Conectar Google Drive"
    Y no veo el botón "Probar la demo"
    Y no se ve el aviso de la demo
    Y el navegador no guarda ningún dato de la demo
    Cuando recargo la pantalla de inicio
    Entonces no veo el botón "Probar la demo"
    Y la pantalla de inicio no muestra el aviso de demo cerrada

  @smoke
  Escenario: La demo funciona de punta a punta sin Google
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Y abro el módulo "Entrenamientos"
    Y abro el plan de la próxima sesión del grupo "Alevín"
    Y genero el PDF del plan abierto
    Entonces el PDF es válido y tiene 1 página
    Cuando abro el módulo "Configuración"
    Y descargo la copia de seguridad
    Entonces el fichero descargado es una copia de seguridad válida con 12 nadadores
    Cuando recargo la aplicación
    Entonces el aviso de la demo está visible
    Cuando pulso "Salir de la demo" en el aviso de la demo
    Y confirmo que quiero salir de la demo
    Entonces veo el botón "Probar la demo"
    Y el navegador no guarda ningún dato de la demo
    Y Drive no contiene ningún club

  Escenario: No se muestra ninguna identidad de usuario en la demo
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Entonces no se muestra ninguna identidad de usuario

  Escenario: No se muestra ninguna identidad de usuario con Drive conectado
    Dado un club con Drive conectado y datos de demostración
    Entonces no se muestra ninguna identidad de usuario

  Escenario: Con Drive ya conectado no se ofrece la demo
    Dado un club con Drive conectado y datos de demostración
    Entonces no se ve el aviso de la demo
    Y no veo el botón "Probar la demo"
