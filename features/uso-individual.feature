# language: en
@single-user
Feature: Individual use of the app
  As a coach I use the app on my own; the app has no sign-in and no identity: I just connect my Google Drive.
  My data is saved in my own Drive (cnl folder) only so that it persists and I have it on all my devices.
  There are no roles, no data sharing and no other users: swimmers and groups are records that I manage.

  Background:
    Given a club with demo data

  @smoke
  Scenario Outline: The menu offers all the modules
    Then the menu shows the module "<module>"

    Examples:
      | module         |
      | Inicio         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Calendario     |
      | Planificación  |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |
      | Configuración  |

  Scenario: There are no roles, role selector or spaces per type of user
    Then there is no role selector
    And I do not see the text "Mi espacio"
    And no user identity is shown

  Scenario: The management screens always allow editing
    When I open the "Nadadores" module
    Then I see the button "Nuevo nadador"
    When I open the "Avisos y notas" module
    Then I see the button "Guardar aviso"
    When I open the "Planificación" module
    And I open the section "Piscina"
    Then I see the button "Sugerir distribución"

  Scenario: The settings offer no users, roles or sharing
    When I try to open the "Configuración" module directly
    Then I am in the "Configuración" module
    And the settings offer no users, roles or sharing of the sheet

  Scenario: The data is saved in the person's own Drive
    When I open the "Nadadores" module
    And I register the swimmer with the data:
      | Nombre    | Itziar   |
      | Apellidos | En Drive |
    Then the club file in Drive contains the swimmer "Itziar"

  Scenario: When opening the app on another device the same data is seen
    When I open the "Nadadores" module
    And I register the swimmer with the data:
      | Nombre    | Itziar    |
      | Apellidos | Dos Móvil |
    And the club file in Drive contains the swimmer "Itziar"
    And I open the app on another device with the same Drive
    And on the other device I open the "Nadadores" module
    Then on the other device I see someone named "Itziar" on the screen
    And no device shows any user identity

  Scenario: A change made on one device reaches the other with the same Drive
    When I open the app on another device with the same Drive
    And on the other device I open the "Nadadores" module
    And on the other device I register the swimmer "Itziar" "Desde el móvil"
    And I go back to the first device and open it again
    And I open the "Nadadores" module
    Then I see someone named "Itziar" on the screen

  Scenario: Each person sees only their own data
    When I open the "Nadadores" module
    And I register the swimmer with the data:
      | Nombre    | Itziar  |
      | Apellidos | Privado |
    And the club file in Drive contains the swimmer "Itziar"
    And another person opens the app with their own Drive
    Then on the other device I see the heading "Crea tu club"
    And on the other device I do not see someone named "Itziar" on the screen

  Scenario: Disconnecting Drive clears the local cache of the device
    When I disconnect Drive
    Then I see the button "Conectar Google Drive"
    And the browser holds no local club or session copies
