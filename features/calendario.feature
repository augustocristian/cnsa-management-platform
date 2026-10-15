# language: es
@calendario
Característica: Calendario
  Como miembro del club quiero ver mis entrenamientos en un calendario por mes, semana o agenda,
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

  Escenario: Exportar el calendario a un archivo .ics
    Entonces veo el texto "Descargar calendario (.ics)"
    Y veo el texto "Añadir a mi calendario"
    Y veo el texto "instantánea"

  Escenario: Con la sesión de Google se puede sincronizar con Google Calendar
    Entonces veo el texto "Sincronizar con Google Calendar"
    Y veo el botón "Sincronizar con Google Calendar"
    Y no veo el texto "no está disponible"

  Escenario: El entrenador filtra el calendario por grupo y por piscina
    Entonces veo el texto "Grupo"
    Y veo el texto "Piscina"
    Y no veo el texto "Previsualizar como nadador"
