# language: es
@asistencia
Característica: Asistencia
  Como entrenador quiero pasar lista desde la piscina, consultar el historial
  y seguir la participación de cada nadador

  Antecedentes:
    Dado un club en modo local con datos de demostración
    Y que he creado la sesión "Lista E2E" para el grupo "Promoción"
    Y que estoy en el módulo "Asistencia"

  @smoke
  Escenario: Registrar la asistencia de un nadador con un toque
    Cuando selecciono la sesión "Lista E2E" para pasar lista
    Entonces el recuento de asistencia muestra "Presentes: 0"
    Cuando marco como presente a "Martina Suárez"
    Entonces "Martina Suárez" figura como "Presente" en la lista
    Y el recuento de asistencia muestra "Presentes: 1"

  Esquema del escenario: La asistencia recorre los estados con toques sucesivos
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
    Entonces el recuento de asistencia muestra "Presentes: 3"
    Y el recuento de asistencia muestra "Sin marcar: 0"

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
