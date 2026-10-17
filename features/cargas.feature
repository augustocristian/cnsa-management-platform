# language: en
@loads
Feature: Training loads
  As a coach I want to log the loads of each athlete with the club's training contents
  (predefined or custom), see their evolution and compare them with the weekly targets

  Background:
    Given a club with demo data
    And I have the "Cargas" module open

  @smoke
  Scenario: Log a training load
    When I log a load with the data:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Técnica               |
      | Metros    | 3250                  |
      | RPE       | 6                     |
      | Minutos   | 75                    |
    Then the load of 3250 metres of "Lucía Fernández" appears in the week loads

  Scenario: Log metres that are not a multiple of 50 and see the row highlighted
    When I log a load with the data:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Técnica               |
      | Metros    | 1234                  |
    Then the load of 1234 metres of "Lucía Fernández" appears in the week loads
    And the newly logged load appears highlighted

  Scenario: A load without metres is not logged and the error is explained next to the field
    When I open the form to log a load
    And I fill "Nadador" with "Lucía Fernández Roces"
    And I press "Registrar"
    Then I see the error in the field "Metros": "Indica los metros"
    And I do not see the text "Carga registrada"

  Scenario: Undo the deletion of a load
    Given I have logged a load of 2400 metres for "Noa Díaz Llano"
    When I delete the load of 2400 metres of "Noa Díaz"
    Then the load of 2400 metres of "Noa Díaz" does not appear in the week loads
    When I undo the last deletion
    Then the load of 2400 metres of "Noa Díaz" appears in the week loads

  Scenario: Loads are related to the athlete who performed them
    Given I have logged a load of 2400 metres for "Noa Díaz Llano"
    When I check the loads of "Noa Díaz Llano"
    Then all the listed loads are of "Noa Díaz Llano"
    And the load of 2400 metres of "Noa Díaz" appears in the week loads

  Scenario: See the evolution of the loads
    Then I see the evolution of the loads by type and by day
    When I go to the previous loads week
    Then I see the evolution of the loads by type and by day

  Scenario: Alert when the load exceeds the weekly target
    Given I have logged a load of 3000 metres for "Noa Díaz Llano"
    When I set the weekly target of "Aeróbico medio / Umbral anaeróbico" between 0 and 100 metres
    Then I see the alert "Aeróbico medio / Umbral anaeróbico: por encima del objetivo"
    And I see the toast "Objetivos guardados"

  Scenario: No alerts when the loads are within the targets
    When I leave every training content without a weekly target
    Then I see the text "Sin alertas"

  Scenario: Link a load to the training session in which it was performed
    When I log a load with the data:
      | Nadador   | Lucía Fernández Roces     |
      | Contenido | Técnica                   |
      | Sesión    | Promoción - Series mixtas |
      | Metros    | 2000                      |
    Then the load of 2000 metres of "Lucía Fernández" appears linked to the session "Promoción - Series mixtas"

  Scenario: See the predefined catalogue of training contents
    When I open the training contents manager
    Then I see the predefined contents:
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
    And the content "Aeróbico ligero" shows the description "Esfuerzo suave"
    And the content "Aláctico / Sprint" shows the description "Velocidad máxima en distancias cortas"
    And the content "Piernas" cannot be deleted

  Scenario: Add a custom content and log a load with it
    When I open the training contents manager
    And I save a training content with the data:
      | Nombre      | Aguas abiertas                |
      | Descripción | Nado en mar con boyas y oleaje |
    Then I see the toast "Contenido «Aguas abiertas» creado"
    And the content "Aguas abiertas" appears as custom
    When I log a load with the data:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Aguas abiertas        |
      | Metros    | 1800                  |
    Then the load of 1800 metres of "Lucía Fernández" appears in the week loads

  Scenario: A content cannot be created with a name that already exists
    When I open the training contents manager
    And I save a training content with the data:
      | Nombre | AEROBICO ligero |
    Then I see the error "Ya existe un contenido con ese nombre"

  Scenario: A deactivated content is no longer offered when logging loads
    When I open the training contents manager
    And I deactivate the content "Brazos"
    Then the content selector does not offer "Brazos"
    When I activate the content "Brazos"
    Then the content selector offers "Brazos"

  Scenario: A content that already has loads logged cannot be deleted
    When I open the training contents manager
    And I save a training content with the data:
      | Nombre | Temporal |
    And I log a load with the data:
      | Nadador   | Lucía Fernández Roces |
      | Contenido | Temporal              |
      | Metros    | 900                   |
    And I try to delete the content "Temporal"
    Then I see the text "no se puede eliminar"
