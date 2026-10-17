# language: es
@temporada
Característica: Planificación de temporada
  Como entrenador quiero planificar la temporada en fases y semanas, con volumen previsto,
  competiciones y su seguimiento frente a lo realmente entrenado

  Antecedentes:
    Dado un club con datos de demostración

  @smoke
  Escenario: Ver la temporada con sus fases y semanas
    Cuando abro el módulo "Planificación"
    Entonces estoy en el apartado "Temporada"
    Y veo el encabezado "Fases"
    Y veo 5 fases en la temporada
    Y veo el texto "Preparación general"
    Y veo el texto "Tapering"
    Y el resumen semanal lista 38 semanas
    Y veo el encabezado "Evolución de cargas y competiciones"
    Y el gráfico de la temporada es accesible

  Escenario: La planificación de la piscina sigue disponible en su apartado
    Cuando abro el módulo "Planificación"
    Y abro el apartado "Piscina"
    Entonces estoy en el apartado "Piscina"
    Y veo el encabezado "Planificación de la piscina"
    Y veo el texto "Calle 6"

  Escenario: Añadir una fase a la temporada
    Cuando abro el módulo "Planificación"
    Y pulso "Añadir fase"
    Y relleno "Nombre" con "Puesta a punto"
    Y elijo "Tapering" en "Tipo de fase"
    Y relleno "Fecha de inicio" con la fecha de dentro de 0 días
    Y relleno "Fecha de fin" con la fecha de dentro de 13 días
    Y pulso "Guardar"
    Entonces veo el texto "se solapan con otras fases"
    Cuando pulso "Guardar de todos modos"
    Entonces veo el aviso "Fase guardada"
    Y veo 6 fases en la temporada
    Y veo el texto "Puesta a punto"

  Escenario: Añadir una competición en una semana y verla en el calendario
    Cuando abro el módulo "Planificación"
    Y añado una competición "Final de prueba" de prioridad "A" para hoy
    Entonces la semana actual marca la competición "Final de prueba"
    Cuando abro el módulo "Calendario"
    Y pulso "Agenda"
    Entonces veo el texto "Final de prueba (A)"

  Escenario: Ajustar el volumen previsto de una semana
    Cuando abro el módulo "Planificación"
    Y abro la semana 2 de la temporada
    Y pulso "Editar semana"
    Y relleno "Volumen previsto" con "12000"
    Y pulso "Guardar"
    Entonces veo el aviso "Semana guardada"
    Y la semana 2 muestra un volumen previsto de "12.000 m"

  Escenario: Comprobar el previsto frente al real de la semana anterior
    Cuando abro el módulo "Planificación"
    Y abro la semana anterior a la actual de la temporada
    Entonces el detalle de la semana muestra "Real en cargas"
    Y el detalle de la semana muestra "Previsto y real por contenido"

  Escenario: Las sugerencias explican por qué y permiten aplicarlas
    Cuando abro el módulo "Planificación"
    Entonces veo el encabezado "Sugerencias"
    Y veo el botón "Aplicar"

  Escenario: Eliminar una fase se puede deshacer
    Cuando abro el módulo "Planificación"
    Y pulso "Editar fase: Tapering"
    Y pulso "Eliminar"
    Entonces veo 4 fases en la temporada
    Cuando pulso "Deshacer" en el aviso
    Entonces veo 5 fases en la temporada

  Escenario: Los diálogos validan en línea y no cierran con datos incorrectos
    Cuando abro el módulo "Planificación"
    Y pulso "Añadir fase"
    Y pulso "Guardar"
    Entonces veo el texto "Este campo es obligatorio"

  Escenario: La temporada no desborda horizontalmente la página
    Cuando abro el módulo "Planificación"
    Entonces veo el encabezado "Fases"
    Y la página no se desborda horizontalmente
