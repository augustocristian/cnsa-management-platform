# language: es
@asistencia
Característica: Asistencia
  Como entrenador quiero pasar lista desde la piscina, consultar el historial
  y seguir la participación de cada nadador

  Antecedentes:
    Dado un club con datos de demostración
    Y que he creado la sesión "Lista E2E" para el grupo "Promoción"
    Y que estoy en el módulo "Asistencia"

  @smoke
  Escenario: Registrar la asistencia de un nadador con un toque
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Entonces el recuento de asistencia muestra "0 presentes"
    Y el resumen de asistencia indica "0 de 3 marcados"
    Cuando marco como presente a "Martina Suárez"
    Entonces "Martina Suárez" figura como "Presente" en la lista
    Y el recuento de asistencia muestra "1 presentes"
    Y el resumen de asistencia indica "1 de 3 marcados"

  Escenario: Nadie está marcado al abrir la lista y los botones son grandes
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Entonces "Martina Suárez" figura como "Sin marcar" en la lista
    Y cada nadador de la lista tiene botones de Presente y Ausente de al menos 44 píxeles

  Escenario: Tocar de nuevo el mismo estado lo desmarca
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Y marco como presente a "Martina Suárez"
    Y toco de nuevo "presente" en "Martina Suárez"
    Entonces "Martina Suárez" figura como "Sin marcar" en la lista

  Escenario: Se puede deshacer una marca
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Y marco como ausente a "Martina Suárez"
    Y deshago la última acción de asistencia
    Entonces "Martina Suárez" figura como "Sin marcar" en la lista

  Esquema del escenario: Presente y ausente con un toque, justificado desde más opciones
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Y marco como <estado> a "Pelayo García"
    Entonces "Pelayo García" figura como "<etiqueta>" en la lista

    Ejemplos:
      | estado      | etiqueta    |
      | presente    | Presente    |
      | ausente     | Ausente     |
      | justificado | Justificado |

  Escenario: Marcar a todo el grupo como presente
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Y marco a todos los nadadores como presentes
    Entonces el recuento de asistencia muestra "3 presentes"
    Y el recuento de asistencia muestra "0 sin marcar"
    Cuando deshago la última acción de asistencia
    Entonces el recuento de asistencia muestra "0 presentes"

  Escenario: La lista sólo incluye a los nadadores del grupo de la sesión
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Entonces la lista incluye a 3 nadadores

  Escenario: El historial muestra el porcentaje de asistencia de cada nadador
    Cuando consulto el historial de asistencia
    Entonces el historial muestra el porcentaje de asistencia de "Carla Menéndez"

  Escenario: El historial se puede acotar a un grupo
    Cuando consulto el historial de asistencia
    Y filtro el historial por el grupo "Promoción"
    Entonces el historial muestra 3 nadadores

  Escenario: El historial refleja la asistencia recién registrada
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Y marco como justificado a "Lucía Fernández"
    Y consulto el historial de asistencia
    Y despliego el detalle de asistencia de "Lucía Fernández"
    Entonces el detalle indica "Lista E2E"
    Y el detalle indica "Justificado"

  Escenario: La participación de un nadador se consulta en su ficha
    Cuando abro el módulo "Nadadores"
    Y abro la ficha de "Álvaro Rodríguez"
    Entonces la ficha muestra su porcentaje de asistencia
