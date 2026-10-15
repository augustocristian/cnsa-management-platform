# language: es
@usuario-unico
Característica: Un único usuario con todos los permisos
  Como entrenador, único usuario de mi cuenta de Google, quiero ver y hacer todo en la aplicación
  sin roles, sin compartir hojas y sin tener que dar de alta a nadie

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
      | Comunicaciones |
      | Configuración  |

  Escenario: No hay selector de rol ni espacio de nadador
    Entonces no existe el selector para cambiar de rol
    Y no veo el texto "Mi espacio"
    Y mi sesión es la de "entrenador@club.test"

  Escenario: Las pantallas de gestión siempre permiten editar
    Cuando abro el módulo "Nadadores"
    Entonces veo el botón "Nuevo nadador"
    Cuando abro el módulo "Comunicaciones"
    Entonces veo el botón "Publicar aviso"
    Cuando abro el módulo "Planificación"
    Entonces veo el botón "Sugerir distribución"

  Escenario: Escribir la dirección de Configuración abre la configuración
    Cuando intento abrir directamente el módulo "Configuración"
    Entonces estoy en el módulo "Configuración"
    Y la configuración no ofrece usuarios, roles ni compartir la hoja
