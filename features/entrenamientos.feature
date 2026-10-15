# language: es
@entrenamientos
Característica: Entrenamientos
  Como entrenador quiero crear y organizar las sesiones de entrenamiento,
  planificarlas por semanas y consultar el trabajo previsto y el realizado

  Antecedentes:
    Dado un club en modo local con datos de demostración
    Y que estoy en el módulo "Entrenamientos"

  @smoke
  Escenario: Crear una sesión de entrenamiento
    Cuando creo la sesión de entrenamiento con los datos:
      | Título                     | Sesión E2E     |
      | Hora                       | 07:30          |
      | Duración (min)             | 60             |
      | Piscina                    | 25 m           |
      | Grupo                      | Promoción      |
      | Volumen objetivo mín. (m)  | 2000           |
      | Volumen objetivo máx. (m)  | 2600           |
      | Enfoque                    | Técnica        |
    Entonces la sesión "Sesión E2E" aparece en el calendario semanal
    Y la sesión "Sesión E2E" figura como "Planificado"
    Y la sesión "Sesión E2E" muestra "Vol. 2000–2600 m"
    Y la sesión "Sesión E2E" muestra "Piscina 25 m"

  Escenario: No se admite un volumen mínimo superior al máximo
    Cuando pulso "Nueva sesión"
    Y relleno "Título" con "Sesión incoherente"
    Y relleno "Volumen objetivo mín. (m)" con "5000"
    Y relleno "Volumen objetivo máx. (m)" con "1000"
    Y pulso "Guardar"
    Entonces veo el aviso "El volumen mínimo no puede superar el máximo"

  Escenario: Editar una sesión planificada
    Dado que he creado la sesión "Sesión editable" para el grupo "Alevín"
    Cuando edito la sesión "Sesión editable" con los datos:
      | Título | Sesión editada |
      | Hora   | 19:00          |
    Entonces la sesión "Sesión editada" aparece en el calendario semanal
    Y la sesión "Sesión editable" no aparece en el calendario semanal

  Escenario: Duplicar una sesión para organizar la semana
    Dado que he creado la sesión "Sesión repetida" para el grupo "Alevín"
    Cuando duplico la sesión "Sesión repetida"
    Entonces hay 2 sesiones llamadas "Sesión repetida"

  Escenario: Marcar una sesión como realizada
    Dado que he creado la sesión "Sesión a cerrar" para el grupo "Promoción"
    Cuando marco la sesión "Sesión a cerrar" como realizada
    Entonces la sesión "Sesión a cerrar" figura como "Realizado"

  Escenario: Eliminar una sesión
    Dado que he creado la sesión "Sesión temporal" para el grupo "Promoción"
    Cuando elimino la sesión "Sesión temporal" y lo confirmo
    Entonces la sesión "Sesión temporal" no aparece en el calendario semanal

  Escenario: Consultar el trabajo previsto de la semana siguiente
    Cuando paso a la semana siguiente
    Entonces la semana muestra sesiones "Planificado"
    Y las sesiones previstas indican su volumen objetivo

  Escenario: Consultar el trabajo realizado en semanas anteriores
    Cuando paso a la semana anterior
    Entonces la semana muestra sesiones "Realizado"
    Cuando vuelvo a la semana actual
    Entonces el título de la semana muestra un intervalo de fechas

  Escenario: Ver sólo las sesiones de un grupo
    Cuando filtro las sesiones por el grupo "Alevín"
    Entonces todas las sesiones mostradas son del grupo "Alevín"

  Escenario: La sesión de un grupo se relaciona con los nadadores de ese grupo
    Dado que he creado la sesión "Sesión del grupo máster" para el grupo "Absoluto-Máster"
    Cuando abro el módulo "Asistencia"
    Y selecciono la sesión "Sesión del grupo máster" para pasar lista
    Entonces la lista incluye a 3 nadadores
    Y veo en pantalla a alguien llamado "Javier Álvarez"
