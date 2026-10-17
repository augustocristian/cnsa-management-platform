# language: en
@times
Feature: Times
  As a coach I want to log the results of the swimmers,
  see their individual evolution and their performance in the season,
  and check them according to the swimsuit with which they were achieved

  Background:
    Given a club with demo data
    And I have the "Marcas" module open

  @smoke
  Scenario: Log the result of an event
    When I log a time with the data:
      | Nadador                | Lucía Fernández Roces |
      | Prueba                 | 100 Libre             |
      | Piscina                | 25 m                  |
      | Tiempo (mm:ss.cc)      | 01:02.45              |
      | Competición            | Trofeo de prueba      |
    Then the time is logged
    And the best time of "Lucía Fernández" in "100 Libre" is "01:02.45"

  Scenario: A time with an incorrect format is rejected
    When I log a time with the data:
      | Nadador           | Lucía Fernández Roces |
      | Tiempo (mm:ss.cc) | 17550                 |
    Then the time is not logged because it is invalid

  Scenario: The time is required and is explained next to the field
    When I log a time with the data:
      | Nadador | Lucía Fernández Roces |
    Then the form asks for the time

  Scenario: The time is typed with digits only and interpreted live
    When I open the form to log a time
    Then the typed time "10245" is interpreted as "01:02.45"

  Scenario: The individual evolution shows the improvement between competitions
    Given I have logged the times of "Noa Díaz Llano" in "200 Libre":
      | date       | time     |
      | 2026-01-10 | 02:40.00 |
      | 2026-03-14 | 02:35.50 |
      | 2026-06-20 | 02:31.10 |
    When I check the evolution of "Noa Díaz Llano" in the event "200 Libre"
    Then I see the time evolution chart
    And the best time of "Noa Díaz" in "200 Libre" is "02:31.10"
    And the history marks "02:31.10" as the best time
    And the history does not mark "02:40.00" as the best time

  Scenario: The evolution chart is shown without choosing anything
    Then the time evolution chart is shown without choosing anything

  Scenario: The performance of the season is seen in the swimmer profile
    Given I have logged the times of "Iker Pérez Naves" in "50 Espalda":
      | date       | time     |
      | 2026-02-01 | 00:41.20 |
      | 2026-05-30 | 00:39.80 |
    When I open the "Nadadores" module
    And I open the profile of "Iker Pérez"
    Then the profile shows the best time "00:39.80" in "50 Espalda"

  Scenario: Each event appears only once in the filter and choosing it shows its times
    Given I have logged the times of "Noa Díaz Llano" in "200 Libre":
      | date       | time     |
      | 2026-01-10 | 02:40.00 |
    When I check the evolution of "Noa Díaz Llano" in the event "200 Libre"
    Then the history includes the time "02:40.00"

  Scenario: The history is paginated 50 by 50
    When I ask to see more times from the history
    Then I see the text "Mostrando"

  Scenario: Filtering the times by competition swimsuit changes the best time
    Given I have logged the times of "Noa Díaz Llano" in "200 Libre":
      | date       | time     | swimsuit                       |
      | 2026-01-10 | 02:40.00 | Speedo Endurance+              |
      | 2026-03-14 | 02:35.50 | Arena Powerskin Carbon Core FX |
      | 2026-06-20 | 02:38.00 | Speedo Endurance+              |
    When I check the evolution of "Noa Díaz Llano" in the event "200 Libre"
    Then the history marks "02:35.50" as the best time
    And the history shows the swimsuit "Arena Powerskin Carbon Core FX" in the time "02:35.50"
    When I filter the times by "Tipo de bañador" "Bañador de entrenamiento"
    Then there is an active filter "Bañador de entrenamiento"
    And the history does not include the time "02:35.50"
    And the history marks "02:38.00" as the best time
    And the history does not mark "02:40.00" as the best time
    When I remove the filter "Bañador de entrenamiento"
    And I filter the times by "Tipo de bañador" "Bañador técnico"
    Then the history shows 1 times
    And the history marks "02:35.50" as the best time

  Scenario: Filter the times by swimsuit brand and model
    Given I have logged the times of "Noa Díaz Llano" in "200 Libre":
      | date       | time     | swimsuit                       |
      | 2026-03-14 | 02:35.50 | Arena Powerskin Carbon Core FX |
      | 2026-04-14 | 02:33.00 | Mizuno GX Sonic V              |
    When I check the evolution of "Noa Díaz Llano" in the event "200 Libre"
    And I filter the times by "Marca del bañador" "Arena"
    Then the history shows 1 times
    And the history includes the time "02:35.50"
    When I filter the times by "Modelo" "Powerskin"
    Then the history shows 1 times
