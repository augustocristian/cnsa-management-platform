# language: es
@comunicaciones
Característica: Avisos y notas
  Como entrenador quiero un espacio propio para guardar avisos y notas de todo el club o de un grupo,
  sin que la aplicación envíe nada a nadie (puedo copiar el texto para pasarlo por mi canal habitual)

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Avisos y notas"

  @smoke
  Escenario: Guardar un aviso para todo el club
    Cuando guardo un aviso con los datos:
      | Título        | Fiesta de fin de temporada      |
      | Grupo         | Todo el club                    |
      | Texto         | Os esperamos el viernes a las 18h |
    Entonces veo el aviso guardado "Fiesta de fin de temporada"
    Y el aviso "Fiesta de fin de temporada" va dirigido a "Todos"

  Escenario: Guardar un aviso de un grupo
    Cuando guardo un aviso con los datos:
      | Título        | Entrenamiento extra       |
      | Grupo         | Promoción                 |
      | Texto         | Traed gorro y gafas extra |
    Entonces el aviso "Entrenamiento extra" va dirigido a "Promoción"

  Escenario: Filtrar los avisos de un grupo
    Dado que he guardado el aviso "Solo alevines" para "Alevín"
    Y que he guardado el aviso "Para todos" para "Todo el club"
    Cuando filtro los avisos por "Alevín"
    Entonces veo el aviso guardado "Solo alevines"
    Y no veo el aviso guardado "Para todos"

  Escenario: Filtrar sólo los avisos generales
    Dado que he guardado el aviso "Solo alevines" para "Alevín"
    Y que he guardado el aviso "Para todos" para "Todo el club"
    Cuando filtro los avisos por "Sólo generales"
    Entonces veo el aviso guardado "Para todos"
    Y no veo el aviso guardado "Solo alevines"

  Escenario: Eliminar un aviso
    Dado que he guardado el aviso "Aviso erróneo" para "Todo el club"
    Cuando elimino el aviso "Aviso erróneo" y lo confirmo
    Entonces no veo el aviso guardado "Aviso erróneo"

  Escenario: No se guarda un aviso sin texto
    Cuando relleno "Título" con "Aviso vacío"
    Y pulso "Guardar aviso"
    Entonces no veo el texto "Aviso guardado"
