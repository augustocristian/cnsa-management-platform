# language: es
@comunicaciones
Característica: Comunicaciones
  Como entrenador quiero un espacio para comunicar avisos a todo el club o a un grupo

  Antecedentes:
    Dado un club en modo local con datos de demostración
    Y que estoy en el módulo "Comunicaciones"

  @smoke
  Escenario: Publicar un aviso para todo el club
    Cuando publico un aviso con los datos:
      | Título        | Fiesta de fin de temporada      |
      | Destinatarios | Todo el club                    |
      | Mensaje       | Os esperamos el viernes a las 18h |
    Entonces veo el aviso publicado "Fiesta de fin de temporada"
    Y el aviso "Fiesta de fin de temporada" va dirigido a "Todos"

  Escenario: Publicar un aviso dirigido a un grupo
    Cuando publico un aviso con los datos:
      | Título        | Entrenamiento extra       |
      | Destinatarios | Promoción                 |
      | Mensaje       | Traed gorro y gafas extra |
    Entonces el aviso "Entrenamiento extra" va dirigido a "Promoción"

  Escenario: Filtrar los avisos de un grupo
    Dado que he publicado el aviso "Solo alevines" para "Alevín"
    Y que he publicado el aviso "Para todos" para "Todo el club"
    Cuando filtro los avisos por "Alevín"
    Entonces veo el aviso publicado "Solo alevines"
    Y no veo el aviso publicado "Para todos"

  Escenario: Filtrar sólo los avisos generales
    Dado que he publicado el aviso "Solo alevines" para "Alevín"
    Y que he publicado el aviso "Para todos" para "Todo el club"
    Cuando filtro los avisos por "Sólo generales"
    Entonces veo el aviso publicado "Para todos"
    Y no veo el aviso publicado "Solo alevines"

  Escenario: Eliminar un aviso
    Dado que he publicado el aviso "Aviso erróneo" para "Todo el club"
    Cuando elimino el aviso "Aviso erróneo" y lo confirmo
    Entonces no veo el aviso publicado "Aviso erróneo"

  Escenario: No se publica un aviso sin mensaje
    Cuando relleno "Título" con "Aviso vacío"
    Y pulso "Publicar aviso"
    Entonces no veo el texto "Aviso publicado"
