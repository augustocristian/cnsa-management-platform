# language: es
@planificacion
Característica: Planificación de la piscina
  Como entrenador quiero organizar en qué calles y a qué hora se imparte cada curso,
  detectar conflictos y compartir el horario con los nadadores en modo lectura

  Antecedentes:
    Dado un club en modo local con datos de demostración

  @smoke
  Escenario: La planificación muestra la piscina con sus calles y el panel de conflictos
    Cuando abro el módulo "Planificación"
    Entonces veo el encabezado "Planificación de la piscina"
    Y veo el texto "Calle 6"
    Y veo el texto "Panel de conflictos"

  Escenario: Se puede cambiar a la vista de semana completa
    Dado que estoy en el módulo "Planificación"
    Cuando pulso "Semana completa"
    Entonces veo el texto "Infantil-Junior"

  Escenario: El nadador ve la planificación sólo en lectura
    Dado que entro como "Nadador"
    Cuando abro el módulo "Planificación"
    Entonces veo el texto "Vista de solo lectura."
    Y no veo el texto "Nueva asignación"
    Y no veo el texto "Panel de conflictos"
