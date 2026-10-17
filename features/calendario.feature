# language: es
@calendario
Característica: Calendario
  Como entrenador quiero ver mis entrenamientos en un calendario por mes, semana o agenda,
  llevármelo a mi calendario personal y, si uso Google, mantenerlo sincronizado

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Calendario"

  @smoke
  Escenario: Consultar el calendario en sus tres vistas
    Entonces veo el encabezado "Calendario"
    Cuando pulso "Semana"
    Entonces veo el texto "Semana del"
    Cuando pulso "Agenda"
    Y pulso "Mes"
    Entonces veo el texto "Eventos del"

  Escenario: La agenda empieza en hoy y no el día 1 del mes
    Cuando pulso "Agenda"
    Entonces la primera sección de la agenda es la de hoy

  Escenario: Exportar el calendario a un archivo .ics desde un único menú
    Entonces hay un único menú de exportación en la cabecera
    Cuando pulso "Exportar"
    Entonces la opción "Descargar calendario (.ics)" está en el menú
    Y la opción "Añadir a mi calendario" está en el menú
    Cuando elijo la opción "Opciones de exportación" del menú
    Entonces veo el texto "instantánea"

  Escenario: Con la conexión a Drive se puede sincronizar con Google Calendar
    Entonces veo el texto "Sincronizar con Google Calendar"
    Y veo el botón "Sincronizar con Google Calendar"
    Y no veo el texto "no está disponible"

  Escenario: El entrenador filtra el calendario por grupo y por piscina
    Entonces veo el campo "Grupo"
    Y veo el campo "Piscina"
    Y no veo el texto "Previsualizar como nadador"

  @escritorio
  Escenario: La rejilla del mes se recorre con el teclado
    Cuando pulso "Mes"
    Y enfoco el día de hoy de la rejilla del mes
    Y pulso la tecla "ArrowRight"
    Entonces el día seleccionado de la rejilla es el de dentro de 1 día
    Cuando pulso la tecla "ArrowDown"
    Entonces el día seleccionado de la rejilla es el de dentro de 8 días

  Escenario: La página del calendario no se desborda horizontalmente
    Entonces la página no se desborda horizontalmente
    Cuando pulso "Mes"
    Entonces la página no se desborda horizontalmente
