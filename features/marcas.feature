# language: es
@marcas
Característica: Marcas
  Como entrenador quiero registrar los resultados de los nadadores,
  ver su evolución individual y su rendimiento en la temporada,
  y consultarlos según el bañador con el que se lograron

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Marcas"

  @smoke
  Escenario: Registrar el resultado de una prueba
    Cuando registro una marca con los datos:
      | Nadador                | Lucía Fernández Roces |
      | Prueba                 | 100 Libre             |
      | Piscina                | 25 m                  |
      | Tiempo (mm:ss.cc)      | 01:02.45              |
      | Competición            | Trofeo de prueba      |
    Entonces la marca queda registrada
    Y la mejor marca de "Lucía Fernández" en "100 Libre" es "01:02.45"

  Escenario: Se rechaza un tiempo con formato incorrecto
    Cuando registro una marca con los datos:
      | Nadador           | Lucía Fernández Roces |
      | Tiempo (mm:ss.cc) | 17550                 |
    Entonces la marca no se registra por tiempo no válido

  Escenario: El tiempo es obligatorio y se explica junto al campo
    Cuando registro una marca con los datos:
      | Nadador | Lucía Fernández Roces |
    Entonces el formulario pide indicar el tiempo

  Escenario: El tiempo se escribe sólo con cifras y se interpreta en vivo
    Cuando abro el formulario para registrar una marca
    Entonces el tiempo escrito "10245" se interpreta como "01:02.45"

  Escenario: La evolución individual muestra la mejora entre competiciones
    Dado que he registrado las marcas de "Noa Díaz Llano" en "200 Libre":
      | fecha      | tiempo   |
      | 2026-01-10 | 02:40.00 |
      | 2026-03-14 | 02:35.50 |
      | 2026-06-20 | 02:31.10 |
    Cuando consulto la evolución de "Noa Díaz Llano" en la prueba "200 Libre"
    Entonces veo el gráfico de evolución de marcas
    Y la mejor marca de "Noa Díaz" en "200 Libre" es "02:31.10"
    Y el historial señala "02:31.10" como mejor marca
    Y el historial no señala "02:40.00" como mejor marca

  Escenario: El gráfico de evolución se muestra sin elegir nada
    Entonces el gráfico de evolución de marcas se muestra sin elegir nada

  Escenario: El rendimiento de la temporada se ve en la ficha del nadador
    Dado que he registrado las marcas de "Iker Pérez Naves" en "50 Espalda":
      | fecha      | tiempo   |
      | 2026-02-01 | 00:41.20 |
      | 2026-05-30 | 00:39.80 |
    Cuando abro el módulo "Nadadores"
    Y abro la ficha de "Iker Pérez"
    Entonces la ficha muestra la mejor marca "00:39.80" en "50 Espalda"

  Escenario: Cada prueba aparece una sola vez en el filtro y al elegirla se ven sus marcas
    Dado que he registrado las marcas de "Noa Díaz Llano" en "200 Libre":
      | fecha      | tiempo   |
      | 2026-01-10 | 02:40.00 |
    Cuando consulto la evolución de "Noa Díaz Llano" en la prueba "200 Libre"
    Entonces el historial incluye la marca "02:40.00"

  Escenario: El historial se pagina de 50 en 50
    Cuando pido ver más marcas del historial
    Entonces veo el texto "Mostrando"

  Escenario: Filtrar las marcas por bañador de competición cambia la mejor marca
    Dado que he registrado las marcas de "Noa Díaz Llano" en "200 Libre":
      | fecha      | tiempo   | bañador                        |
      | 2026-01-10 | 02:40.00 | Speedo Endurance+              |
      | 2026-03-14 | 02:35.50 | Arena Powerskin Carbon Core FX |
      | 2026-06-20 | 02:38.00 | Speedo Endurance+              |
    Cuando consulto la evolución de "Noa Díaz Llano" en la prueba "200 Libre"
    Entonces el historial señala "02:35.50" como mejor marca
    Y el historial muestra el bañador "Arena Powerskin Carbon Core FX" en la marca "02:35.50"
    Cuando filtro las marcas por "Tipo de bañador" "Bañador de entrenamiento"
    Entonces hay un filtro activo "Bañador de entrenamiento"
    Y el historial no incluye la marca "02:35.50"
    Y el historial señala "02:38.00" como mejor marca
    Y el historial no señala "02:40.00" como mejor marca
    Cuando quito el filtro "Bañador de entrenamiento"
    Y filtro las marcas por "Tipo de bañador" "Bañador técnico"
    Entonces el historial muestra 1 marcas
    Y el historial señala "02:35.50" como mejor marca

  Escenario: Filtrar las marcas por marca y modelo de bañador
    Dado que he registrado las marcas de "Noa Díaz Llano" en "200 Libre":
      | fecha      | tiempo   | bañador                        |
      | 2026-03-14 | 02:35.50 | Arena Powerskin Carbon Core FX |
      | 2026-04-14 | 02:33.00 | Mizuno GX Sonic V              |
    Cuando consulto la evolución de "Noa Díaz Llano" en la prueba "200 Libre"
    Y filtro las marcas por "Marca del bañador" "Arena"
    Entonces el historial muestra 1 marcas
    Y el historial incluye la marca "02:35.50"
    Cuando filtro las marcas por "Modelo" "Powerskin"
    Entonces el historial muestra 1 marcas
