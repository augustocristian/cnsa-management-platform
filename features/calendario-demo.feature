# language: en
@calendar
Feature: Calendar in demo mode
  The demo does not connect to Google: the sync is explained instead of being greyed out for no reason

  Scenario: In demo mode the Google Calendar sync is disabled and explained
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I open the "Calendario" module
    Then the Google Calendar sync is disabled and explained
    And I see the text "El modo demo guarda los datos solo en este navegador"
