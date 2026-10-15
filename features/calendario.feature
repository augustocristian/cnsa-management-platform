# language: es
@calendario
Característica: Calendario
  Como miembro del club quiero ver mis entrenamientos en un calendario por mes, semana o agenda,
  llevármelo a mi calendario personal y, si uso Google, mantenerlo sincronizado

  Antecedentes:
    Dado un club en modo local con datos de demostración
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

  Escenario: Sin Google la sincronización no está disponible
    Entonces veo el texto "en modo local no está disponible"
    Y veo el texto "Cómo configurar Google"

  Escenario: El nadador ve sólo los entrenamientos de su grupo
    Cuando cambio al rol "Nadador"
    Y abro el módulo "Calendario"
    Entonces veo el texto "Previsualizar como nadador"
