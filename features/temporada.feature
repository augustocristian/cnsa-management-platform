# language: en
@season
Feature: Season planning
  As a coach I want to plan the season in phases and weeks, with planned volume,
  competitions and their follow-up against what was actually trained

  Background:
    Given a club with demo data

  @smoke
  Scenario: See the season with its phases and weeks
    When I open the "Planificación" module
    Then I am in the section "Temporada"
    And I see the heading "Fases"
    And I see 5 phases in the season
    And I see the text "Preparación general"
    And I see the text "Tapering"
    And the weekly summary lists 38 weeks
    And I see the heading "Evolución de cargas y competiciones"
    And the season chart is accessible

  Scenario: The pool planning is still available in its section
    When I open the "Planificación" module
    And I open the section "Piscina"
    Then I am in the section "Piscina"
    And I see the heading "Planificación de la piscina"
    And I see the text "Calle 6"

  Scenario: Add a phase to the season
    When I open the "Planificación" module
    And I press "Añadir fase"
    And I fill "Nombre" with "Puesta a punto"
    And I choose "Tapering" in "Tipo de fase"
    And I fill "Fecha de inicio" with the date 0 days from now
    And I fill "Fecha de fin" with the date 13 days from now
    And I press "Guardar"
    Then I see the text "se solapan con otras fases"
    When I press "Guardar de todos modos"
    Then I see the toast "Fase guardada"
    And I see 6 phases in the season
    And I see the text "Puesta a punto"

  Scenario: Add a competition in a week and see it in the calendar
    When I open the "Planificación" module
    And I add a competition "Final de prueba" with priority "A" for today
    Then the current week marks the competition "Final de prueba"
    When I open the "Calendario" module
    And I press "Agenda"
    Then I see the text "Final de prueba (A)"

  Scenario: Adjust the planned volume of a week
    When I open the "Planificación" module
    And I open week 2 of the season
    And I press "Editar semana"
    And I fill "Volumen previsto" with "12000"
    And I press "Guardar"
    Then I see the toast "Semana guardada"
    And week 2 shows a planned volume of "12.000 m"

  Scenario: Check the planned against the actual of the previous week
    When I open the "Planificación" module
    And I open the week before the current one of the season
    Then the week detail shows "Real en cargas"
    And the week detail shows "Previsto y real por contenido"

  Scenario: The suggestions explain why and allow applying them
    When I open the "Planificación" module
    Then I see the heading "Sugerencias"
    And I see the button "Aplicar"

  Scenario: Deleting a phase can be undone
    When I open the "Planificación" module
    And I press "Editar fase: Tapering"
    And I press "Eliminar"
    Then I see 4 phases in the season
    When I press "Deshacer" in the toast
    Then I see 5 phases in the season

  Scenario: The dialogs validate inline and do not close with incorrect data
    When I open the "Planificación" module
    And I press "Añadir fase"
    And I press "Guardar"
    Then I see the text "Este campo es obligatorio"

  Scenario: The season does not overflow the page horizontally
    When I open the "Planificación" module
    Then I see the heading "Fases"
    And the page does not overflow horizontally
