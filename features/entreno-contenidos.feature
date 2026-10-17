# language: en
@training @training-contents
Feature: Several contents per exercise, distribution of metres, totals and percentages
  As a coach I want to put more than one content in the same exercise (for example 75 m of light aerobic and 25 m of sprint),
  distribute the metres by hand or automatically and see how many metres and what percentage of the session belongs to each content and stroke

  Background:
    Given a demo club with the Google session started
    And I have the "Entrenamientos" module open
    When I create the training session with the data:
      | Título | Sesión contenidos |
      | Grupo  | Alevín            |
    And I open the plan of the session "Sesión contenidos"

  @smoke
  Scenario: Add two contents to the same exercise and distribute the metres
    When I put "4" in "Series" of row 1 of set 1
    And I put "100" in "Distancia" of row 1 of set 1
    And I add the content "Aeróbico ligero" to row 1 of set 1
    And I add the content "Aláctico / Sprint" to row 1 of set 1
    Then the content "Aeróbico ligero" of row 1 of set 1 distributes "50 m/rep"
    And the content "Aláctico / Sprint" of row 1 of set 1 distributes "50 m/rep"
    When I set "75" metres per repetition of "Aeróbico ligero" in row 1 of set 1
    Then the content "Aeróbico ligero" of row 1 of set 1 is in mode "Manual"
    And the content "Aláctico / Sprint" of row 1 of set 1 is in mode "Auto"
    And the content "Aláctico / Sprint" of row 1 of set 1 distributes "25 m/rep"
    And the session summary says "Volumen total: 400 m (AeL 300 m · Sprint 100 m)"
    And the content "Aeróbico ligero" weighs "300 m" and "75 %" in the summary
    And the content "Aláctico / Sprint" weighs "100 m" and "25 %" in the summary

  Scenario: Autocomplete the distribution from the exercise text
    When I put "4x100 Crol. 75 AeL-25 Tope" in "Ejercicio" of row 1 of set 1
    And I autocomplete row 1 of set 1 from the text
    Then row 1 of set 1 has "4" in "Series"
    And row 1 of set 1 has "100" in "Distancia"
    And the block distance of row 1 of set 1 is "400"
    And the content "Aeróbico ligero" of row 1 of set 1 distributes "75 m/rep"
    And the content "Aláctico / Sprint" of row 1 of set 1 distributes "25 m/rep"
    And the session summary says "Volumen total: 400 m (AeL 300 m · Sprint 100 m) · Por estilo: Crol 400 m"
    And the stroke "Crol" adds up to "400 m" and "100 %" in the summary

  Scenario: Warn about the unassigned remainder and assign it to a content
    When I put "2" in "Series" of row 1 of set 1
    And I put "100" in "Distancia" of row 1 of set 1
    And I add the content "Piernas" to row 1 of set 1
    And I set "60" metres per repetition of "Piernas" in row 1 of set 1
    Then I see the unassigned remainder "Sin asignar: 40 m por repetición" in row 1 of set 1
    And I see the plan notice "Reparto de contenidos incompleto"
    When I assign the remainder of row 1 of set 1 to "Técnica"
    Then the content "Técnica" of row 1 of set 1 distributes "40 m/rep"
    And there is no unassigned remainder in row 1 of set 1
    And the content "Piernas" weighs "120 m" and "60 %" in the summary
    And the content "Técnica" weighs "80 m" and "40 %" in the summary

  Scenario: The distribution is saved and recovered when the plan is reopened
    When I put "4x100 Crol. 75 AeL-25 Tope" in "Ejercicio" of row 1 of set 1
    And I autocomplete row 1 of set 1 from the text
    And I save the plan
    And I close the plan
    And I open the plan of the session "Sesión contenidos"
    Then the content "Aeróbico ligero" of row 1 of set 1 distributes "75 m/rep"
    And the session summary says "Volumen total: 400 m"

  Scenario: Copy the summary as text
    When I put "4x100 Crol. 75 AeL-25 Tope" in "Ejercicio" of row 1 of set 1
    And I autocomplete row 1 of set 1 from the text
    And I copy the session summary
    Then the clipboard contains "Volumen total: 400 m (AeL 300 m · Sprint 100 m) · Por estilo: Crol 400 m"
    And the clipboard contains "% por contenido: AeL 75 % · Sprint 25 %"

  Scenario: The summary with contents appears in the downloaded PDF
    When I put "4x100 Crol. 75 AeL-25 Tope" in "Ejercicio" of row 1 of set 1
    And I autocomplete row 1 of set 1 from the text
    And I generate the PDF of the open plan
    Then the PDF is valid and has 1 page
    And the PDF contains "75 AeL + 25 Sprint"
    And the PDF contains "RESUMEN DE LA SESIÓN"
    And the PDF contains "Volumen total: 400 m"
    And the PDF contains "Aeróbico ligero"
    And the PDF contains "300 m"
    And the PDF contains "75 %"
    And the PDF contains "POR ESTILO"

  Scenario: Log the loads from the plan without duplicating them
    When I choose the template "Aeróbico"
    And I log the loads from the plan
    Then I see the toast "Cargas registradas"
    When I log the loads from the plan
    Then I see the toast "ya estaban registradas"
