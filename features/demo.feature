# language: es
@demo
Característica: Modo demostración y conexión con Google Drive
  Como persona que abre la aplicación por primera vez quiero poder probarla con datos de ejemplo sin conectar mi Drive,
  y conectar Google Drive cuando quiera guardar mis datos. La aplicación no tiene inicio de sesión: solo pide permiso
  para los archivos que ella misma crea en mi Drive y nunca muestra ni guarda quién soy.

  # El modo demostración guarda todo solo en este navegador (espacio cnl:demo:*) y no toca nunca Google Drive.

  @smoke
  Escenario: La primera vez se ofrece conectar Google Drive o probar la demo
    Dado que la aplicación está recién abierta sin Drive conectado
    Entonces veo el botón "Conectar Google Drive"
    Y veo el botón "Probar la demo"
    Y la pantalla de inicio no habla de cuentas ni de iniciar sesión
    Y el navegador no guarda ningún dato de la demo

  @smoke
  Escenario: La demo muestra datos de ejemplo y un aviso permanente de que no se guarda en Drive
    Dado que la aplicación está recién abierta sin Drive conectado
    Cuando pulso "Probar la demo"
    Entonces estoy en el módulo "Inicio"
    Y el aviso de la demo está visible
    Y veo el texto "Modo demostración: tus datos no se guardan en Drive."
    Y veo el texto "Conectar Google Drive"
    Y veo el texto "Salir de la demo"
    Cuando abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Lucía Fernández"
    Cuando abro el módulo "Calendario"
    Entonces el aviso de la demo está visible
    Y los datos de la demo solo existen en este navegador
    Y Drive no contiene ningún club

  Escenario: Lo que se hace en la demo se conserva al recargar y sigue sin tocar Drive
    Dado que la aplicación está recién abierta sin Drive conectado
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

  Escenario: Salir de la demo borra sus datos tras confirmar
    Dado que la aplicación está recién abierta sin Drive conectado
    Cuando pulso "Probar la demo"
    Y pulso "Salir de la demo" en el aviso de la demo
    Y confirmo que quiero salir de la demo
    Entonces veo el botón "Probar la demo"
    Y el navegador no guarda ningún dato de la demo
    Cuando recargo la pantalla de inicio
    Entonces veo el botón "Probar la demo"
    Y no se ve el aviso de la demo

  Escenario: Conectar Google Drive desde la demo empieza con un club real vacío
    Dado que la aplicación está recién abierta sin Drive conectado
    Cuando pulso "Probar la demo"
    Y pulso "Conectar Google Drive" en el aviso de la demo
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

  Escenario: Si Google rechaza la conexión desde la demo, la demo sigue funcionando
    Dado que la aplicación está abierta y Google rechaza la conexión con "popup-cerrado"
    Cuando pulso "Probar la demo"
    Y pulso "Conectar Google Drive" en el aviso de la demo
    Entonces el aviso de la demo está visible
    Cuando abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Lucía Fernández"

  Escenario: No se muestra ninguna identidad de usuario en la demo
    Dado que la aplicación está recién abierta sin Drive conectado
    Cuando pulso "Probar la demo"
    Entonces no se muestra ninguna identidad de usuario

  Escenario: No se muestra ninguna identidad de usuario con Drive conectado
    Dado un club con Drive conectado y datos de demostración
    Entonces no se muestra ninguna identidad de usuario

  Escenario: Con Drive ya conectado no se ofrece la demo
    Dado un club con Drive conectado y datos de demostración
    Entonces no se ve el aviso de la demo
    Y no veo el botón "Probar la demo"
