# language: es
@cargas
Característica: Cargas de entrenamiento
  Como entrenador quiero registrar las cargas de cada deportista con los contenidos de entrenamiento
  del club (predefinidos o propios), ver su evolución y compararlas con los objetivos semanales

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Cargas"

  @smoke
  Escenario: Registrar una carga de entrenamiento
    Cuando registro una carga con los datos:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Técnica               |
      | Metros    | 3250                  |
      | RPE       | 6                     |
      | Minutos   | 75                    |
    Entonces la carga de 3250 metros de "Lucía Fernández" aparece en las cargas de la semana

  Escenario: Registrar metros que no son múltiplo de 50 y ver la fila resaltada
    Cuando registro una carga con los datos:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Técnica               |
      | Metros    | 1234                  |
    Entonces la carga de 1234 metros de "Lucía Fernández" aparece en las cargas de la semana
    Y la carga recién registrada aparece resaltada

  Escenario: No se registra una carga sin metros y el error se explica junto al campo
    Cuando abro el formulario para registrar una carga
    Y relleno "Nadador" con "Lucía Fernández Roces"
    Y pulso "Registrar"
    Entonces veo el error en el campo "Metros": "Indica los metros"
    Y no veo el texto "Carga registrada"

  Escenario: Deshacer el borrado de una carga
    Dado que he registrado una carga de 2400 metros para "Noa Díaz Llano"
    Cuando elimino la carga de 2400 metros de "Noa Díaz"
    Entonces la carga de 2400 metros de "Noa Díaz" no aparece en las cargas de la semana
    Cuando deshago el último borrado
    Entonces la carga de 2400 metros de "Noa Díaz" aparece en las cargas de la semana

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
    Cuando fijo el objetivo semanal de "Aeróbico medio / Umbral anaeróbico" entre 0 y 100 metros
    Entonces veo la alerta "Aeróbico medio / Umbral anaeróbico: por encima del objetivo"
    Y veo el aviso "Objetivos guardados"

  Escenario: Sin alertas cuando las cargas están dentro de los objetivos
    Cuando dejo sin objetivo semanal todos los contenidos de entrenamiento
    Entonces veo el texto "Sin alertas"

  Escenario: Relacionar una carga con la sesión de entrenamiento en la que se realizó
    Cuando registro una carga con los datos:
      | Nadador   | Lucía Fernández Roces     |
      | Contenido | Técnica                   |
      | Sesión    | Promoción - Series mixtas |
      | Metros    | 2000                      |
    Entonces la carga de 2000 metros de "Lucía Fernández" aparece vinculada a la sesión "Promoción - Series mixtas"

  Escenario: Ver el catálogo predefinido de contenidos de entrenamiento
    Cuando abro el gestor de contenidos de entrenamiento
    Entonces veo los contenidos predefinidos:
      | Aeróbico ligero                       |
      | Aeróbico medio / Umbral anaeróbico    |
      | Aeróbico intenso / Potencia aeróbica  |
      | Anaeróbico / Tolerancia al lactato    |
      | Aláctico / Sprint                     |
      | Piernas                               |
      | Brazos                                |
      | Técnica                               |
      | Salidas                               |
      | Virajes/volteos                       |
    Y el contenido "Aeróbico ligero" muestra la descripción "Esfuerzo suave"
    Y el contenido "Aláctico / Sprint" muestra la descripción "Velocidad máxima en distancias cortas"
    Y el contenido "Piernas" no se puede eliminar

  Escenario: Añadir un contenido manual y registrar una carga con él
    Cuando abro el gestor de contenidos de entrenamiento
    Y guardo un contenido de entrenamiento con los datos:
      | Nombre      | Aguas abiertas                |
      | Descripción | Nado en mar con boyas y oleaje |
    Entonces veo el aviso "Contenido «Aguas abiertas» creado"
    Y el contenido "Aguas abiertas" aparece como personalizado
    Cuando registro una carga con los datos:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Aguas abiertas        |
      | Metros    | 1800                  |
    Entonces la carga de 1800 metros de "Lucía Fernández" aparece en las cargas de la semana

  Escenario: No se puede crear un contenido con un nombre que ya existe
    Cuando abro el gestor de contenidos de entrenamiento
    Y guardo un contenido de entrenamiento con los datos:
      | Nombre | AEROBICO ligero |
    Entonces veo el error "Ya existe un contenido con ese nombre"

  Escenario: Un contenido desactivado deja de ofrecerse al registrar cargas
    Cuando abro el gestor de contenidos de entrenamiento
    Y desactivo el contenido "Brazos"
    Entonces el selector de contenido no ofrece "Brazos"
    Cuando activo el contenido "Brazos"
    Entonces el selector de contenido ofrece "Brazos"

  Escenario: No se puede eliminar un contenido que ya tiene cargas registradas
    Cuando abro el gestor de contenidos de entrenamiento
    Y guardo un contenido de entrenamiento con los datos:
      | Nombre | Temporal |
    Y registro una carga con los datos:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Temporal              |
      | Metros    | 900                   |
    Y intento eliminar el contenido "Temporal"
    Entonces veo el texto "no se puede eliminar"
