# language: en
@attendance
Feature: Attendance
  As a coach I want to take attendance from the pool, check the history
  and follow the participation of each swimmer

  Background:
    Given a club with demo data
    And I have created the session "Lista E2E" for the group "Promoción"
    And I have the "Asistencia" module open

  @smoke
  Scenario: Record the attendance of a swimmer with one tap
    When I select the session "Lista E2E" to take attendance
    Then the attendance count shows "0 presentes"
    And the attendance summary says "0 de 3 marcados"
    When I mark the status present for "Martina Suárez"
    Then "Martina Suárez" appears as "Presente" in the list
    And the attendance count shows "1 presentes"
    And the attendance summary says "1 de 3 marcados"

  Scenario: Nobody is marked when the list opens and the buttons are large
    When I select the session "Lista E2E" to take attendance
    Then "Martina Suárez" appears as "Sin marcar" in the list
    And every swimmer in the list has Present and Absent buttons of at least 44 pixels

  Scenario: Tapping the same status again unmarks it
    When I select the session "Lista E2E" to take attendance
    And I mark the status present for "Martina Suárez"
    And I tap "presente" again for "Martina Suárez"
    Then "Martina Suárez" appears as "Sin marcar" in the list

  Scenario: A mark can be undone
    When I select the session "Lista E2E" to take attendance
    And I mark the status absent for "Martina Suárez"
    And I undo the last attendance action
    Then "Martina Suárez" appears as "Sin marcar" in the list

  Scenario Outline: Present and absent with one tap, excused from more options
    When I select the session "Lista E2E" to take attendance
    And I mark the status <status> for "Pelayo García"
    Then "Pelayo García" appears as "<label>" in the list

    Examples:
      | status      | label       |
      | present     | Presente    |
      | absent      | Ausente     |
      | excused     | Justificado |

  Scenario: Mark the whole group as present
    When I select the session "Lista E2E" to take attendance
    And I mark all the swimmers as present
    Then the attendance count shows "3 presentes"
    And the attendance count shows "0 sin marcar"
    When I undo the last attendance action
    Then the attendance count shows "0 presentes"

  Scenario: The list only includes the swimmers of the session group
    When I select the session "Lista E2E" to take attendance
    Then the list includes 3 swimmers

  Scenario: The history shows the attendance percentage of each swimmer
    When I open the attendance history
    Then the history shows the attendance percentage of "Carla Menéndez"

  Scenario: The history can be narrowed to a group
    When I open the attendance history
    And I filter the history by the group "Promoción"
    Then the history shows 3 swimmers

  Scenario: The history reflects the attendance just recorded
    When I select the session "Lista E2E" to take attendance
    And I mark the status excused for "Lucía Fernández"
    And I open the attendance history
    And I expand the attendance detail of "Lucía Fernández"
    Then the detail says "Lista E2E"
    And the detail says "Justificado"

  Scenario: The participation of a swimmer is checked in their profile
    When I open the "Nadadores" module
    And I open the profile of "Álvaro Rodríguez"
    Then the profile shows its attendance percentage
