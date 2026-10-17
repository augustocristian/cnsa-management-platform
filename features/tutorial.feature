# language: en
@tutorial
Feature: Google setup tutorial
  As the person who publishes the app I want a 6-step guide to set up Google only once;
  everybody else just connects their Google Drive

  Background:
    Given the app is open without a Google Client ID
    And I press "Abrir el tutorial (5 minutos)"

  @smoke
  Scenario: The tutorial has 6 steps with touch controls
    Then I see the heading "Configurar Google en 5 minutos"
    And I see 6 numbered steps of at least 44 pixels
    And the tutorial does not inject styles into the page

  Scenario: The values to copy have accessible buttons
    When I press "Paso 4 de 6"
    Then each Copy button says which value it copies

  Scenario: The last step explains the individual use and the demo
    When I press "Paso 6 de 6"
    Then I see the text "Probar la demo"
    And I see the text "uso individual"
    And the page does not overflow horizontally
