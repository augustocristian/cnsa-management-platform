# language: en
@pwa
Feature: PWA, local cache and offline operation
  As a coach I want to install the app and keep working even if
  the pool has no coverage, without losing data

  Background:
    Given a club with demo data

  @smoke
  Scenario: The app is installable
    Then the app manifest is valid
    And all the manifest icons can be downloaded
    And the service worker is active

  @smoke
  Scenario: The club starts with demo data
    When I open the "Nadadores" module
    Then the club sample data is loaded

  Scenario: The data persists when reloading the app
    Given I have the "Nadadores" module open
    When I register the swimmer with the data:
      | Nombre    | Persistente |
      | Apellidos | Recarga     |
    And I reload the app
    And I open the "Nadadores" module
    Then the swimmers list includes "Persistente Recarga"

  Scenario: Sessions and attendance are kept when reloading
    Given I have created the session "Sesión persistente" for the group "Promoción"
    When I reload the app
    And I open the "Entrenamientos" module
    Then the session "Sesión persistente" appears in the weekly calendar

  Scenario: Offline the app keeps working with its data
    When I go offline
    Then the app is still available with its data

  Scenario: The data lives in the club file inside the cnl folder of Drive
    Given I have the "Nadadores" module open
    When I register the swimmer with the data:
      | Nombre    | Compartido |
      | Apellidos | En Drive   |
    Then the club file in Drive contains the swimmer "Compartido"

  Scenario: Changes made offline are uploaded to Drive when the network returns
    Given I have the "Nadadores" module open
    When I go offline
    And I register the swimmer with the data:
      | Nombre    | Sin red   |
      | Apellidos | Pendiente |
    Then the sync indicator shows "Sin conexión"
    And the club file in Drive does not contain the swimmer "Sin red"
    When I recover the connection
    Then the club file in Drive contains the swimmer "Sin red"

  @navigation
  Scenario: Offline a notice is shown under the header that disappears when the network returns
    When I go offline
    Then I see the offline banner
    When I recover the connection
    Then the offline banner disappears
