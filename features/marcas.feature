# language: es
@marcas
Característica: Marcas
  Como entrenador quiero registrar los resultados de los nadadores,
  ver su evolución individual y su rendimiento en la temporada

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
      | Tiempo (mm:ss.cc) | rapidísimo            |
    Entonces la marca no se registra por tiempo no válido

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

  Escenario: Hay que elegir nadador y prueba para ver la evolución
    Entonces se me pide elegir nadador y prueba para ver la evolución

  Escenario: El rendimiento de la temporada se ve en la ficha del nadador
    Dado que he registrado las marcas de "Iker Pérez Naves" en "50 Espalda":
      | fecha      | tiempo   |
      | 2026-02-01 | 00:41.20 |
      | 2026-05-30 | 00:39.80 |
    Cuando abro el módulo "Nadadores"
    Y abro la ficha de "Iker Pérez"
    Entonces la ficha muestra la mejor marca "00:39.80" en "50 Espalda"
