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

    Ejemplos: Hoy, asistencia, alertas, acciones, cargas, avisos y temporada
      | tarjeta                        |
      | Hoy                            |
      | Asistencia hoy                 |
      | Alertas de cargas              |
      | Acciones rápidas               |
      | Carga semanal del club         |
      | Avisos recientes               |
      | Próximo evento de la temporada |

  @smoke
  Escenario: El banner resume el día con el nombre del club
    Dado un club con datos de demostración
    Entonces el banner del panel muestra el nombre del club "Club Natación Lugones"
    Y el banner del panel resume las sesiones de hoy

  Esquema del escenario: Las acciones rápidas llevan directamente a la tarea
    Dado un club con datos de demostración
    Cuando pulso la acción rápida "<acción>"
    Entonces estoy en el módulo "<módulo>"

    Ejemplos:
      | acción           | módulo         |
      | Pasar lista      | Asistencia     |
      | Registrar carga  | Cargas         |
      | Nueva marca      | Marcas         |
      | Nuevo aviso      | Avisos y notas |

  @escritorio
  Escenario: En escritorio las tarjetas llenan cada fila sin huecos
    Dado un club con datos de demostración
    Entonces las tarjetas del panel llenan cada fila sin huecos

  Escenario: El panel no se desborda en horizontal y el gráfico semanal es legible y accesible
    Dado un club con datos de demostración
    Entonces el panel no tiene desplazamiento horizontal
    Y los textos del gráfico semanal miden al menos 11 píxeles
    Y el gráfico semanal tiene una tabla como alternativa

  Escenario: Las alertas de cargas usan el componente de alerta con icono
    Dado un club con datos de demostración
    Entonces cada alerta de cargas del panel tiene icono y texto

  Escenario: Un aviso nuevo aparece entre los avisos recientes del panel
    Dado un club con datos de demostración
    Y que estoy en el módulo "Avisos y notas"
    Cuando guardo un aviso con los datos:
      | Título        | Cambio de horario del sábado    |
      | Grupo         | Todo el club                    |
      | Texto         | El sábado se entrena a las 9:00 |
    Y abro el módulo "Inicio"
    Entonces veo el texto "Cambio de horario del sábado"

  Escenario: La campana de avisos lleva a los avisos y notas
    Dado un club con datos de demostración
    Cuando pulso la campana de avisos
    Entonces estoy en el módulo "Avisos y notas"

  @smoke
  Escenario: Un club vacío ofrece una acción en cada tarjeta y los primeros pasos
    Dado un club vacío con la sesión de Google iniciada
    Entonces veo el encabezado "Primeros pasos"
    Y la tarjeta "Hoy" ofrece "Programar una sesión"
    Y la tarjeta "Asistencia hoy" ofrece "Abrir asistencia"
    Y la tarjeta "Alertas de cargas" ofrece "Definir objetivos"
    Y la tarjeta "Carga semanal del club" ofrece "Registrar carga"
    Y la tarjeta "Avisos recientes" ofrece "Escribir un aviso"
    Y la tarjeta "Próximo evento de la temporada" ofrece "Planificar la temporada"

  Escenario: Los primeros pasos se pueden ocultar y no vuelven a aparecer
    Dado un club vacío con la sesión de Google iniciada
    Entonces veo el encabezado "Primeros pasos"
    Cuando oculto los primeros pasos
    Entonces no veo el texto "Primeros pasos"
    Cuando recargo la aplicación
    Entonces no veo el texto "Primeros pasos"
