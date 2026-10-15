# language: es
@cargas
Característica: Cargas de entrenamiento
  Como entrenador quiero registrar las cargas de cada deportista, ver su evolución
  y compararlas con los objetivos semanales

  Antecedentes:
    Dado un club en modo local con datos de demostración
    Y que estoy en el módulo "Cargas"

  @smoke
  Escenario: Registrar una carga de entrenamiento
    Cuando registro una carga con los datos:
      | Nadador | Lucía Fernández Roces |
      | Tipo    | Técnica               |
      | Metros  | 3250                  |
      | RPE     | 6                     |
      | Minutos | 75                    |
    Entonces la carga de 3250 metros de "Lucía Fernández" aparece en las cargas de la semana

  Escenario: No se registra una carga sin metros
    Cuando relleno "Nadador" con "Lucía Fernández Roces"
    Y pulso "Registrar"
    Entonces no veo el texto "Carga registrada"

  Escenario: Las cargas se relacionan con el deportista que las realizó
    Dado que he registrado una carga de 2400 metros para "Noa Díaz Llano"
    Cuando consulto las cargas de "Noa Díaz Llano"
    Entonces todas las cargas listadas son de "Noa Díaz Llano"
    Y la carga de 2400 metros de "Noa Díaz" aparece en las cargas de la semana

  Escenario: Ver la evolución de las cargas
    Entonces veo la evolución de las cargas por tipo y por día
    Cuando paso a la semana anterior de cargas
    Entonces veo la evolución de las cargas por tipo y por día

  Escenario: Alerta cuando la carga supera el objetivo semanal
    Dado que he registrado una carga de 3000 metros para "Noa Díaz Llano"
    Cuando fijo el objetivo semanal de "Aeróbico" entre 0 y 100 metros
    Entonces veo la alerta "Aeróbico: por encima del objetivo"

  Escenario: Sin alertas cuando las cargas están dentro de los objetivos
    Cuando dejo sin objetivo semanal todos los tipos de carga
    Entonces veo el texto "Sin alertas"

  @pendiente
  Escenario: Relacionar una carga con la sesión de entrenamiento en la que se realizó
    # Los datos demo traen cargas con sesión, pero el formulario aún no permite elegirla.
    Cuando registro una carga con los datos:
      | Nadador | Lucía Fernández Roces |
      | Sesión  | Promoción - Series mixtas |
      | Metros  | 2000                  |
    Entonces la carga aparece vinculada a la sesión "Promoción - Series mixtas"
