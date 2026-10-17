# language: es
@uso-individual
Característica: Uso individual de la aplicación
  Como entrenador uso la aplicación yo solo; la app no tiene inicio de sesión ni identidad: solo conecto mi Google Drive.
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
      | Avisos y notas |
      | Configuración  |

  Escenario: No hay roles, selector de rol ni espacios por tipo de usuario
    Entonces no existe el selector para cambiar de rol
    Y no veo el texto "Mi espacio"
    Y no se muestra ninguna identidad de usuario

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
    Y abro la aplicación en otro dispositivo con el mismo Drive
    Y en el otro dispositivo abro el módulo "Nadadores"
    Entonces en el otro dispositivo veo en pantalla a alguien llamado "Itziar"
    Y ningún dispositivo muestra ninguna identidad de usuario

  Escenario: Un cambio hecho en un dispositivo llega al otro con el mismo Drive
    Cuando abro la aplicación en otro dispositivo con el mismo Drive
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
    Y otra persona abre la aplicación con su propio Drive
    Entonces en el otro dispositivo veo el encabezado "Crea tu club"
    Y en el otro dispositivo no veo en pantalla a alguien llamado "Itziar"

  Escenario: Desconectar Drive limpia la caché local del dispositivo
    Cuando desconecto Drive
    Entonces veo el botón "Conectar Google Drive"
    Y el navegador no guarda copias locales de datos del club ni de la sesión
