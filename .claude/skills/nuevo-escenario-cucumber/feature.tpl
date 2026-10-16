# language: en
@<area>
Feature: <Feature title>
  As a coach
  I want <goal>
  so that <benefit>

  # NOTE: step sentences below are illustrative. Copy the exact wording of the existing step definitions
  # (grep -hn "^\(Given\|When\|Then\)(" features/steps/*.js). Quoted values are the app's UI texts.

  Background:
    Given a club with demo data

  @smoke
  Scenario: Open the module and see its initial state
    When I open the "<Menu label>" module
    Then I see the heading "<View title>"

  Scenario: Create an item
    When I open the "<Menu label>" module
    And I press "Nuevo"
    And I fill in "Nombre" with "Ejemplo"
    And I fill in "Fecha" with the date 0 days from now
    And I press "Guardar"
    Then I see the notice "<Saved message>"
    And I see the text "Ejemplo"

  Scenario: Required data is validated next to the field
    When I open the "<Menu label>" module
    And I press "Nuevo"
    And I press "Guardar"
    Then I see the text "obligatorio"

  Scenario Outline: The same check for several values
    When I open the "<Menu label>" module
    Then I see the text "<text>"

    Examples:
      | text      |
      | <value 1> |
      | <value 2> |
