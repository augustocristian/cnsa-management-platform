# language: es
@planificacion
Característica: Planificación de la piscina
  Como entrenador quiero organizar en qué calles y a qué hora se imparte cada curso,
  detectar conflictos y sugerir una distribución

  Antecedentes:
    Dado un club con datos de demostración

  @smoke
  Escenario: La planificación muestra la piscina con sus calles y el panel de conflictos
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Entonces veo el encabezado "Planificación de la piscina"
    Y veo el texto "Calle 6"
    Y veo el texto "Panel de conflictos"

  Escenario: Se puede cambiar a la vista de semana completa
    Dado que estoy en el módulo "Planificación"
    Y abro el apartado "Piscina"
    Cuando pulso "Semana completa"
    Entonces veo el texto "Infantil-Junior"

  Escenario: La planificación siempre es editable para el único usuario
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Entonces veo el botón "Sugerir distribución"
    Y veo el botón "Nueva asignación"
    Y no veo el texto "Vista de solo lectura."

  Escenario: Las acciones poco frecuentes están en un menú y no ocupan la barra
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Y pulso "Más acciones"
    Entonces la opción "Configurar piscina" está en el menú
    Y la opción "Nueva piscina" está en el menú
    Y la opción "Imprimir" está en el menú
    Cuando elijo la opción "Configurar piscina" del menú
    Entonces veo el texto "Configuración de la piscina"

  Escenario: Los conflictos se muestran como alertas con su recuento
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Entonces veo el texto "Avisos (1)"

  @smoke
  Escenario: La rejilla de calles no desborda la página
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Entonces veo el texto "Calle 6"
    Y la página no se desborda horizontalmente
