# language: en
@planning
Feature: Pool planning
  As a coach I want to organise in which lanes and at what time each course is taught,
  detect conflicts and suggest a distribution

  Background:
    Given a club with demo data

  @smoke
  Scenario: The planning shows the pool with its lanes and the conflicts panel
    When I open the "Planificación" module
    And I open the section "Piscina"
    Then I see the heading "Planificación de la piscina"
    And I see the text "Calle 6"
    And I see the text "Panel de conflictos"

  Scenario: It is possible to switch to the full-week view
    Given I have the "Planificación" module open
    And I open the section "Piscina"
    When I press "Semana completa"
    Then I see the text "Infantil-Junior"

  Scenario: The planning is always editable for the only user
    When I open the "Planificación" module
    And I open the section "Piscina"
    Then I see the button "Sugerir distribución"
    And I see the button "Nueva asignación"
    And I do not see the text "Vista de solo lectura."

  Scenario: The infrequent actions are in a menu and do not take up the bar
    When I open the "Planificación" module
    And I open the section "Piscina"
    And I press "Más acciones"
    Then the option "Configurar piscina" is in the menu
    And the option "Nueva piscina" is in the menu
    And the option "Imprimir" is in the menu
    When I choose the option "Configurar piscina" of the menu
    Then I see the text "Configuración de la piscina"

  Scenario: Conflicts are shown as alerts with their count
    When I open the "Planificación" module
    And I open the section "Piscina"
    Then I see the text "Avisos (1)"

  @smoke
  Scenario: The lane grid does not overflow the page
    When I open the "Planificación" module
    And I open the section "Piscina"
    Then I see the text "Calle 6"
    And the page does not overflow horizontally
