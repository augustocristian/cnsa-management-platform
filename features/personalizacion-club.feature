# language: en
@club
Feature: Club customisation
  As a coach I want the app to show the name, the logo
  and the colours of my club

  Background:
    Given a club with demo data
    And I have the "Configuración" module open

  @smoke
  Scenario: Change the name and the motto of the club
    When I customise the club identity with:
      | Nombre | Club Natación Prueba |
      | Lema   | Siempre adelante     |
    And I save the club identity
    Then the header shows the name "Club Natación Prueba"
    And the header shows the motto "Siempre adelante"
    And the footer mentions "Club Natación Prueba"

  Scenario: Change the primary and the secondary colour
    When I customise the club identity with:
      | Color primario   | #e91e63 |
      | Color secundario | #00796b |
    And I save the club identity
    Then the primary colour of the app is "#e91e63"
    And the secondary colour of the app is "#00796b"

  Scenario: Upload and remove the logo
    When I upload the club logo
    And I save the club identity
    Then the header shows the uploaded logo
    When I remove the club logo
    And I save the club identity
    Then the header shows the default logo

  Scenario: The club identity is kept on reload
    When I customise the club identity with:
      | Nombre         | Club Persistente |
      | Color primario | #6a1b9a          |
    And I save the club identity
    And I reload the app
    Then the header shows the name "Club Persistente"
    And the primary colour of the app is "#6a1b9a"

  Scenario: The settings explain where the data is stored
    Then the settings explain that the data is in the cnl folder in Drive

  Scenario: The settings are organised in cards without repeating the contents catalogue
    Then the settings show "Contenidos de entrenamiento" only once
    And the settings do not mention user accounts

  Scenario: The default logo is visible and the button to choose an image is in Spanish
    Then the logo in the settings is visible
    And the settings offer a button to choose the logo in Spanish
