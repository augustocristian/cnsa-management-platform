# language: es
@inicio
Característica: Panel de inicio
  Como entrenador del club
  quiero una vista rápida de lo más relevante, la actividad reciente y los avisos
  para empezar la jornada sabiendo qué está pasando

  @smoke
  Esquema del escenario: El panel resume la información relevante del club
    Dado un club con datos de demostración
    Entonces veo el encabezado "<tarjeta>"

    Ejemplos: Información relevante, actividad reciente y avisos
      | tarjeta                            |
      | Acceso rápido                      |
      | Control de cargas semanal del club |
      | Alertas de cargas                  |
      | Próxima sesión                     |
      | Asistencia hoy                     |
      | Comunicaciones recientes           |

  Esquema del escenario: Los accesos rápidos llevan al módulo correspondiente
    Dado un club con datos de demostración
    Cuando pulso "<acceso>"
    Entonces estoy en el módulo "<acceso>"

    Ejemplos:
      | acceso     |
      | Nadadores  |
      | Asistencia |
      | Cargas     |
      | Marcas     |

  Escenario: Un aviso nuevo aparece entre las comunicaciones recientes del panel
    Dado un club con datos de demostración
    Y que estoy en el módulo "Comunicaciones"
    Cuando publico un aviso con los datos:
      | Título        | Cambio de horario del sábado    |
      | Destinatarios | Todo el club                    |
      | Mensaje       | El sábado se entrena a las 9:00 |
    Y abro el módulo "Inicio"
    Entonces veo el texto "Cambio de horario del sábado"

  Escenario: La campana de avisos lleva a las comunicaciones
    Dado un club con datos de demostración
    Cuando pulso la campana de avisos
    Entonces estoy en el módulo "Comunicaciones"
