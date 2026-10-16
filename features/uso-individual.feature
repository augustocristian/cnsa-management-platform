# language: es
@uso-individual
Característica: Uso individual de la aplicación
  Como entrenador uso la aplicación yo solo, con mi cuenta de Google.
  Mis datos se guardan en mi propio Drive (carpeta cnl) únicamente para que persistan y los tenga en todos mis dispositivos.
  No hay roles, ni compartir datos, ni otros usuarios: los nadadores y los grupos son registros que yo gestiono.

  Antecedentes:
    Dado un club con datos de demostración

  @smoke
  Esquema del escenario: El menú ofrece todos los módulos
    Entonces el menú muestra el módulo "<modulo>"

    Ejemplos:
      | modulo         |
      | Inicio         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Calendario     |
      | Planificación  |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Bañador        |
      | Avisos y notas |
      | Configuración  |

  Escenario: No hay roles, selector de rol ni espacios por tipo de usuario
    Entonces no existe el selector para cambiar de rol
    Y no veo el texto "Mi espacio"
    Y mi sesión es la de "entrenador@club.test"

  Escenario: Las pantallas de gestión siempre permiten editar
    Cuando abro el módulo "Nadadores"
    Entonces veo el botón "Nuevo nadador"
    Cuando abro el módulo "Avisos y notas"
    Entonces veo el botón "Guardar aviso"
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Entonces veo el botón "Sugerir distribución"

  Escenario: La configuración no ofrece usuarios, roles ni compartir
    Cuando intento abrir directamente el módulo "Configuración"
    Entonces estoy en el módulo "Configuración"
    Y la configuración no ofrece usuarios, roles ni compartir la hoja

  Escenario: Los datos se guardan en el Drive de la propia persona
    Cuando abro el módulo "Nadadores"
    Y doy de alta al nadador con los datos:
      | Nombre    | Itziar   |
      | Apellidos | En Drive |
    Entonces el fichero del club en Drive contiene al nadador "Itziar"

  Escenario: Al abrir la aplicación en otro dispositivo se ven los mismos datos
    Cuando abro el módulo "Nadadores"
    Y doy de alta al nadador con los datos:
      | Nombre    | Itziar    |
      | Apellidos | Dos Móvil |
    Y el fichero del club en Drive contiene al nadador "Itziar"
    Y abro la aplicación en otro dispositivo con la misma cuenta de Google
    Y en el otro dispositivo abro el módulo "Nadadores"
    Entonces en el otro dispositivo veo en pantalla a alguien llamado "Itziar"
    Y la sesión del otro dispositivo es la de la misma cuenta

  Escenario: Un cambio hecho en un dispositivo llega al otro con la misma cuenta
    Cuando abro la aplicación en otro dispositivo con la misma cuenta de Google
    Y en el otro dispositivo abro el módulo "Nadadores"
    Y en el otro dispositivo doy de alta al nadador "Itziar" "Desde el móvil"
    Y vuelvo al primer dispositivo y lo abro de nuevo
    Y abro el módulo "Nadadores"
    Entonces veo en pantalla a alguien llamado "Itziar"

  Escenario: Cada persona ve únicamente sus propios datos
    Cuando abro el módulo "Nadadores"
    Y doy de alta al nadador con los datos:
      | Nombre    | Itziar  |
      | Apellidos | Privado |
    Y el fichero del club en Drive contiene al nadador "Itziar"
    Y otra persona abre la aplicación con su propia cuenta de Google
    Entonces en el otro dispositivo veo el encabezado "Crea tu club"
    Y en el otro dispositivo no veo en pantalla a alguien llamado "Itziar"

  Escenario: Cerrar sesión limpia la caché local del dispositivo
    Cuando cierro la sesión
    Entonces veo el botón "Iniciar sesión con Google"
    Y el navegador no guarda copias locales de datos del club ni de la sesión
