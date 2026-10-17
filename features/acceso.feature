# language: es
@acceso
Característica: Acceso con Google y primer arranque
  Como entrenador quiero entrar con mi cuenta de Google y que todo se guarde en la carpeta cnl de mi Drive,
  sin modos de prueba ni datos de ejemplo mezclados con los míos

  # Estos escenarios usan el adaptador de pruebas (js/infrastructure/fakeGoogle.js, activado sólo con
  # localStorage['cnl:test']): no se habla con Google ni hace falta una cuenta real.

  @smoke
  Escenario: Sin conexión con Drive se ofrece conectar Google Drive
    Dado que la aplicación está recién abierta sin sesión
    Entonces veo el encabezado "CNL Plataforma"
    Y veo el botón "Conectar Google Drive"
    Y no veo ningún texto sobre el modo local
    Y no veo el botón "Probar en modo local"
    Y no veo el botón "Probar la demo"
    Y el menú de la aplicación no se muestra
    Y la pantalla de inicio no habla de cuentas ni de iniciar sesión

  @smoke
  Escenario: La pantalla de inicio explica el valor y la privacidad y, con ID de Google, no ofrece la demo
    Dado que la aplicación está recién abierta sin sesión
    Entonces veo el texto "Planifica entrenamientos, pasa lista y controla las cargas de tu club"
    Y veo el texto "Tus datos se guardan en tu propio Google Drive; no se comparte nada con nadie"
    Y no veo el botón "Probar la demo"
    Y la pantalla de inicio no menciona la demo

  Escenario: El selector de idioma son banderas en el pie de la tarjeta, no un desplegable ni lo primero
    Dado que la aplicación está recién abierta sin sesión
    Entonces el selector de idioma de la pantalla de inicio está en el pie de la tarjeta
    Y la pantalla de inicio no tiene ningún desplegable de idioma
    Cuando elijo el idioma "Italiano"
    Entonces veo el botón "Collega Google Drive"

  @smoke
  Escenario: Sin Client ID la aplicación pide la configuración necesaria
    Dado que la aplicación está abierta sin Client ID de Google
    Entonces veo el encabezado "Configuración necesaria"
    Y veo el botón "Probar la demo"
    Y no veo el botón "Conectar Google Drive"
    Y no veo ningún texto sobre el modo local
    Cuando pulso "Abrir el tutorial (5 minutos)"
    Entonces veo el encabezado "Configurar Google en 5 minutos"
    Y no veo ningún texto sobre el modo local

  Escenario: En la configuración necesaria el origen y su botón Copiar van en la misma fila
    Dado que la aplicación está abierta sin Client ID de Google
    Entonces el origen de esta página y su botón Copiar están alineados

  Escenario: El enlace directo de la configuración lleva al paso del ID de cliente
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Ir directamente al paso del ID de cliente"
    Entonces veo el encabezado "Pegar el ID de cliente en la aplicación"

  Escenario: Un ID de cliente con formato incorrecto se rechaza
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando relleno "ID de cliente de Google" con "esto-no-vale"
    Y pulso "Probar y guardar"
    Entonces veo el texto "debe terminar en .apps.googleusercontent.com"

  Escenario: Un ID de cliente válido se prueba, se guarda y lleva al primer arranque
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando relleno "ID de cliente de Google" con "123456-abc.apps.googleusercontent.com"
    Y pulso "Probar y guardar"
    Entonces veo el encabezado "Crea tu club"

  @smoke
  Escenario: Primer arranque: el asistente crea el club vacío en la carpeta cnl de Drive
    Dado que la aplicación está recién abierta sin sesión
    Cuando pulso "Conectar Google Drive"
    Entonces veo el encabezado "Crea tu club"
    Y veo el texto "Paso 1 de 2"
    Cuando pulso "Siguiente"
    Entonces veo el texto "Escribe el nombre del club."
    Cuando relleno "Nombre del club" con "Club Natación Prueba"
    Y relleno "Lema (opcional)" con "Siempre adelante"
    Y pulso "Siguiente"
    Entonces veo el texto "carpeta «cnl» en tu Drive"
    Y la vista previa del club usa el color elegido
    Cuando pulso "Crear mi club"
    Entonces estoy en el módulo "Inicio"
    Y la cabecera muestra el nombre "Club Natación Prueba"
    Y la cabecera muestra el lema "Siempre adelante"
    Y veo el encabezado "Primeros pasos"
    Y Drive contiene el club "Club Natación Prueba"

  Escenario: El club recién creado está vacío, sin datos de ejemplo y con llamadas a la acción
    Dado que la aplicación está recién abierta sin sesión
    Y que he creado el club "Club Vacío" con el asistente
    Cuando abro el módulo "Nadadores"
    Entonces el listado de nadadores está vacío
    Cuando abro el módulo "Inicio"
    Entonces el panel de inicio ofrece los primeros pasos:
      | Crea tus grupos de entrenamiento |
      | Da de alta a tus nadadores       |
      | Define tu piscina y sus calles   |
      | Programa tu primera sesión       |

  Escenario: El asistente permite volver atrás y conserva lo escrito
    Dado que la aplicación está recién abierta sin sesión
    Cuando pulso "Conectar Google Drive"
    Y relleno "Nombre del club" con "Club Atrás"
    Y pulso "Siguiente"
    Y pulso "Atrás"
    Entonces el campo "Nombre del club" contiene "Club Atrás"

  Escenario: Sin ID de Google la demo se ofrece en la configuración necesaria y abre el panel con datos de ejemplo
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Entonces estoy en el módulo "Inicio"
    Y veo el encabezado "Acciones rápidas"

  Escenario: Con un club ya creado no se vuelve a mostrar el asistente
    Dado un club con datos de demostración
    Cuando recargo la aplicación
    Entonces estoy en el módulo "Inicio"
    Y no veo el texto "Crea tu club"

  Escenario: El idioma elegido se guarda en las preferencias de Drive
    Dado que la aplicación está recién abierta sin sesión
    Cuando elijo el idioma "English"
    Y pulso "Connect Google Drive"
    Y relleno "Club name" con "English Club"
    Y pulso "Next"
    Y pulso "Create my club"
    Entonces veo el encabezado "English Club"
    Y las preferencias de Drive guardan "idioma" con el valor "en"
    Cuando recargo la aplicación
    Entonces el idioma del documento es "en"

  Escenario: Desconectar Drive devuelve a la pantalla de inicio
    Dado un club con datos de demostración
    Cuando desconecto Drive
    Entonces veo el botón "Conectar Google Drive"
    Y el menú de la aplicación no se muestra

  Escenario: Si el navegador bloquea la ventana de Google se explica qué hacer
    Dado que la aplicación está abierta y Google rechaza el inicio de sesión con "popup-bloqueado"
    Cuando pulso "Conectar Google Drive"
    Entonces veo el texto "El navegador ha bloqueado la ventana de Google"

  Escenario: Si el correo no es usuario de prueba se explica cómo añadirlo y se muestra el origen
    Dado que la aplicación está abierta y Google rechaza el inicio de sesión con "acceso-denegado"
    Cuando pulso "Conectar Google Drive"
    Entonces veo el texto "debe figurar como usuario de prueba"
    Y veo el texto "Añade tu correo en «Usuarios de prueba»"
    Y veo el origen de esta página para copiarlo

  Escenario: Si el origen no está autorizado se muestra el origen actual para copiarlo
    Dado que la aplicación está abierta y Google rechaza el inicio de sesión con "origen-no-autorizado"
    Cuando pulso "Conectar Google Drive"
    Entonces veo el texto "Este origen no está autorizado"
    Y veo el origen de esta página para copiarlo

  Escenario: Los datos del club viven en el fichero cnl/<Club>.json del Drive
    Dado un club con datos de demostración
    Y que estoy en el módulo "Nadadores"
    Cuando doy de alta al nadador con los datos:
      | Nombre    | Persistido |
      | Apellidos | En Drive   |
    Entonces el fichero del club en Drive contiene al nadador "Persistido"
