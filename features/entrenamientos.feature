# language: en
@trainings
Feature: Trainings
  As a coach I want to create and organise training sessions,
  plan them by weeks and check the planned and the completed work

  Background:
    Given a club with demo data
    And I have the "Entrenamientos" module open

  @smoke
  Scenario: Create a training session
    When I create the training session with the data:
      | Título                     | Sesión E2E     |
      | Hora                       | 07:30          |
      | Duración (min)             | 60             |
      | Piscina                    | 25 m           |
      | Grupo                      | Promoción      |
      | Volumen objetivo mín. (m)  | 2000           |
      | Volumen objetivo máx. (m)  | 2600           |
      | Enfoque                    | Técnica        |
    Then the session "Sesión E2E" appears in the weekly calendar
    And the session "Sesión E2E" appears as "Planificado"
    And the session "Sesión E2E" shows "Vol. 2000–2600 m"
    And the session "Sesión E2E" shows "Piscina 25 m"

  Scenario: A minimum volume greater than the maximum is not accepted
    When I press "Nueva sesión"
    And I fill "Título" with "Sesión incoherente"
    And I fill "Volumen objetivo mín. (m)" with "5000"
    And I fill "Volumen objetivo máx. (m)" with "1000"
    And I press "Guardar"
    Then I see the field error "El volumen mínimo no puede superar el máximo"

  Scenario: Edit a planned session
    Given I have created the session "Sesión editable" for the group "Alevín"
    When I edit the session "Sesión editable" with the data:
      | Título | Sesión editada |
      | Hora   | 19:00          |
    Then the session "Sesión editada" appears in the weekly calendar
    And the session "Sesión editable" does not appear in the weekly calendar

  Scenario: Duplicate a session to organise the week
    Given I have created the session "Sesión repetida" for the group "Alevín"
    When I duplicate the session "Sesión repetida"
    Then there are 2 sessions named "Sesión repetida"

  Scenario: Mark a session as done
    Given I have created the session "Sesión a cerrar" for the group "Promoción"
    When I mark the session "Sesión a cerrar" as done
    Then the session "Sesión a cerrar" appears as "Realizado"

  Scenario: Each session offers a single main action and a menu with the rest
    Given I have created the session "Sesión sencilla" for the group "Alevín"
    Then the session "Sesión sencilla" has a single main action "Abrir plan"

  Scenario: Delete a session
    Given I have created the session "Sesión temporal" for the group "Promoción"
    When I delete the session "Sesión temporal"
    Then the session "Sesión temporal" does not appear in the weekly calendar
    And I see the toast "Sesión eliminada"

  Scenario: Undo the deletion of a session
    Given I have created the session "Sesión recuperable" for the group "Alevín"
    When I delete the session "Sesión recuperable"
    And I undo the deletion
    Then the session "Sesión recuperable" appears in the weekly calendar

  Scenario: Check the planned work of the following week
    When I go to the next week
    Then the week shows "Planificado" sessions
    And the planned sessions show their target volume

  Scenario: Check the work done in previous weeks
    When I go to the previous week
    Then the week shows "Realizado" sessions
    When I go back to the current week
    Then the week title shows a date range

  Scenario: See only the sessions of a group
    When I filter the sessions by the group "Alevín"
    Then all the sessions shown are of the group "Alevín"

  Scenario: The session of a group is related to the swimmers of that group
    Given I have created the session "Sesión del grupo master" for the group "Absoluto-Master"
    When I open the "Asistencia" module
    And I select the session "Sesión del grupo master" to take attendance
    Then the list includes 3 swimmers
    And I see someone named "Javier Álvarez" on the screen
