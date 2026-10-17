# language: en
@demo
Feature: Demo mode (only while there is no Google client ID) and connection with Google Drive
  As a person opening the app before Google is configured I want to be able to try it with sample data without connecting
  any Drive, and connect Google Drive when there is a client ID and I want to save my data. The demo is only offered while
  there is no Google client ID (neither in the browser nor in js/infrastructure/config.js). The app has no sign-in: it only asks for
  permission over the files it creates itself in my Drive and never shows or stores who I am.

  # Demo mode stores everything only in this browser (cnl:demo:* space) and never touches Google Drive.
  # Without a client ID the test adapter opens with the sinClientId option; with a client ID, it is the normal opening.

  @smoke
  Scenario: Without a Google client ID the demo is offered before the configuration
    Given the app is open without a Google Client ID
    Then I see the heading "Configuración necesaria"
    And I see the button "Probar la demo"
    And I see the text "Datos de ejemplo guardados solo en este dispositivo; no se envía nada a Drive."
    And the demo is the first action of the screen
    And I do not see the button "Conectar Google Drive"
    And I see the button "Probar y guardar"
    And the browser stores no demo data

  @smoke
  Scenario: With a Google client ID the demo is not offered
    Given the app has just been opened without Drive connected
    Then I see the button "Conectar Google Drive"
    And I do not see the button "Probar la demo"
    And the start screen does not mention the demo
    And the start screen does not mention accounts or signing in
    And the browser stores no demo data

  @smoke
  Scenario: The demo shows sample data and a permanent notice that nothing is saved in Drive
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    Then I am in the "Inicio" module
    And the demo notice is visible
    And I see the text "Modo demostración: tus datos no se guardan en Drive."
    And the demo notice offers "Configurar Google Drive"
    And the demo notice offers "Salir de la demo"
    And the demo notice does not offer "Conectar Google Drive"
    When I open the "Nadadores" module
    Then I see someone named "Lucía Fernández" on the screen
    When I open the "Calendario" module
    Then the demo notice is visible
    And the demo data only exists in this browser
    And Drive contains no club

  Scenario: What is done in the demo is kept on reload and still does not touch Drive
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I open the "Nadadores" module
    And I register the swimmer with the data:
      | Nombre    | Itziar     |
      | Apellidos | De la demo |
    And I reload the app
    Then the demo notice is visible
    When I open the "Nadadores" module
    Then I see someone named "Itziar" on the screen
    And Drive contains no club

  Scenario: Leaving the demo deletes its data after confirming and returns to the configuration screen
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I press "Salir de la demo" in the demo notice
    And I confirm that I want to leave the demo
    Then I see the button "Probar la demo"
    And I see the heading "Configuración necesaria"
    And the browser stores no demo data
    When I reload the start screen
    Then I see the button "Probar la demo"
    And the demo notice is not visible

  Scenario: From the demo the configuration is opened, one can go back to the demo and nothing is lost
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I press "Configurar Google Drive" in the demo notice
    Then I see the heading "Configuración necesaria"
    And I see the button "Volver a la demo"
    And I do not see the button "Probar la demo"
    And I see the button "Probar y guardar"
    And I see the text "se cierra la demo y se borran sus datos"
    When I press "Volver a la demo"
    Then the demo notice is visible
    When I open the "Nadadores" module
    Then I see someone named "Lucía Fernández" on the screen

  Scenario: Configuring the client ID from the demo connects Drive, closes the demo and starts with a real empty club
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I press "Configurar Google Drive" in the demo notice
    And I fill "ID de cliente de Google" with "123456-abc.apps.googleusercontent.com"
    And I press "Probar y guardar"
    Then I see the heading "Crea tu club"
    And Drive is connected
    And the browser stores no demo data
    When I fill "Nombre del club" with "Club Real"
    And I press "Siguiente"
    And I press "Crear mi club"
    Then the demo notice is not visible
    When I open the "Nadadores" module
    Then the swimmers list is empty
    And Drive contains the club "Club Real"

  Scenario: If Google rejects the connection from the demo configuration, the demo keeps working
    Given the app is open without a Google Client ID and Google rejects the connection with "popup-cerrado"
    When I press "Probar la demo"
    And I press "Configurar Google Drive" in the demo notice
    And I fill "ID de cliente de Google" with "123456-abc.apps.googleusercontent.com"
    And I press "Probar y guardar"
    Then I see the text "Se cerró la ventana de Google antes de terminar"
    When I press "Volver a la demo"
    Then the demo notice is visible
    And the demo notice offers "Configurar Google Drive"
    When I open the "Nadadores" module
    Then I see someone named "Lucía Fernández" on the screen

  @smoke
  Scenario: If a client ID is configured with the demo open, the demo closes on startup with a notice and its data is deleted
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    Then the demo notice is visible
    When a Google client ID is configured and I reload the app
    Then I see the text "Ya hay un ID de cliente de Google configurado: se cerró la demo. Conecta Google Drive para continuar."
    And I see the button "Conectar Google Drive"
    And I do not see the button "Probar la demo"
    And the demo notice is not visible
    And the browser stores no demo data
    When I reload the start screen
    Then I do not see the button "Probar la demo"
    And the start screen does not show the closed-demo notice

  @smoke
  Scenario: The demo works end to end without Google
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I open the "Entrenamientos" module
    And I open the plan of the next session of the group "Alevín"
    And I generate the PDF of the open plan
    Then the PDF is valid and has 1 page
    When I open the "Configuración" module
    And I download the backup
    Then the downloaded file is a valid backup with 12 swimmers
    When I reload the app
    Then the demo notice is visible
    When I press "Salir de la demo" in the demo notice
    And I confirm that I want to leave the demo
    Then I see the button "Probar la demo"
    And the browser stores no demo data
    And Drive contains no club

  Scenario: No user identity is shown in the demo
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    Then no user identity is shown

  Scenario: No user identity is shown with Drive connected
    Given a club with Drive connected and demo data
    Then no user identity is shown

  Scenario: With Drive already connected the demo is not offered
    Given a club with Drive connected and demo data
    Then the demo notice is not visible
    And I do not see the button "Probar la demo"
