# language: en
@calendar
Feature: Calendar
  As a coach I want to see my trainings in a calendar by month, week or agenda,
  take it to my personal calendar and, if I use Google, keep it synchronised

  Background:
    Given a club with demo data
    And I have the "Calendario" module open

  @smoke
  Scenario: Check the calendar in its three views
    Then I see the heading "Calendario"
    When I press "Semana"
    Then I see the text "Semana del"
    When I press "Agenda"
    And I press "Mes"
    Then I see the text "Eventos del"

  Scenario: The agenda starts today and not on the 1st of the month
    When I press "Agenda"
    Then the first section of the agenda is today

  Scenario: Export the calendar to an .ics file from a single menu
    Then there is a single export menu in the header
    When I press "Exportar"
    Then the option "Descargar calendario (.ics)" is in the menu
    And the option "Añadir a mi calendario" is in the menu
    When I choose the option "Opciones de exportación" of the menu
    Then I see the text "instantánea"

  Scenario: With the Drive connection it can be synchronised with Google Calendar
    Then I see the text "Sincronizar con Google Calendar"
    And I see the button "Sincronizar con Google Calendar"
    And I do not see the text "no está disponible"

  Scenario: The coach filters the calendar by group and by pool
    Then I see the field "Grupo"
    And I see the field "Piscina"
    And I do not see the text "Previsualizar como nadador"

  @desktop
  Scenario: The month grid is navigated with the keyboard
    When I press "Mes"
    And I focus today in the month grid
    And I press the key "ArrowRight"
    Then the selected day of the grid is the one 1 day from now
    When I press the key "ArrowDown"
    Then the selected day of the grid is the one 8 days from now

  Scenario: The calendar page does not overflow horizontally
    Then the page does not overflow horizontally
    When I press "Mes"
    Then the page does not overflow horizontally
