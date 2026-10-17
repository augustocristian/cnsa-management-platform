# language: en
@access
Feature: Access with Google and first start
  As a coach I want to sign in with my Google account and have everything saved in the cnl folder of my Drive,
  with no test modes or sample data mixed with mine

  # These scenarios use the test adapter (js/infrastructure/fakeGoogle.js, enabled only with
  # localStorage['cnl:test']): there is no contact with Google and no real account is needed.

  @smoke
  Scenario: Without a Drive connection, connecting Google Drive is offered
    Given the app has just been opened without a session
    Then I see the heading "CNL Plataforma"
    And I see the button "Conectar Google Drive"
    And I see no text about local mode
    And I do not see the button "Probar en modo local"
    And I do not see the button "Probar la demo"
    And the app menu is not shown
    And the start screen does not mention accounts or signing in

  @smoke
  Scenario: The start screen explains the value and the privacy and, with a Google ID, does not offer the demo
    Given the app has just been opened without a session
    Then I see the text "Planifica entrenamientos, pasa lista y controla las cargas de tu club"
    And I see the text "Tus datos se guardan en tu propio Google Drive; no se comparte nada con nadie"
    And I do not see the button "Probar la demo"
    And the start screen does not mention the demo

  Scenario: The language selector is flags in the card footer, not a dropdown nor the first thing
    Given the app has just been opened without a session
    Then the language selector of the start screen is in the card footer
    And the start screen has no language dropdown
    When I choose the language "Italiano"
    Then I see the button "Collega Google Drive"

  @smoke
  Scenario: Without a Client ID the app asks for the required configuration
    Given the app is open without a Google Client ID
    Then I see the heading "Configuración necesaria"
    And I see the button "Probar la demo"
    And I do not see the button "Conectar Google Drive"
    And I see no text about local mode
    When I press "Abrir el tutorial (5 minutos)"
    Then I see the heading "Configurar Google en 5 minutos"
    And I see no text about local mode

  Scenario: In the required configuration the origin and its Copy button are on the same row
    Given the app is open without a Google Client ID
    Then the origin of this page and its Copy button are aligned

  Scenario: The direct link of the configuration leads to the client ID step
    Given the app is open without a Google Client ID
    When I press "Ir directamente al paso del ID de cliente"
    Then I see the heading "Pegar el ID de cliente en la aplicación"

  Scenario: A client ID with an incorrect format is rejected
    Given the app is open without a Google Client ID
    When I fill "ID de cliente de Google" with "esto-no-vale"
    And I press "Probar y guardar"
    Then I see the text "debe terminar en .apps.googleusercontent.com"

  Scenario: A valid client ID is tested, saved and leads to the first start
    Given the app is open without a Google Client ID
    When I fill "ID de cliente de Google" with "123456-abc.apps.googleusercontent.com"
    And I press "Probar y guardar"
    Then I see the heading "Crea tu club"

  @smoke
  Scenario: First start: the wizard creates the empty club in the cnl folder of Drive
    Given the app has just been opened without a session
    When I press "Conectar Google Drive"
    Then I see the heading "Crea tu club"
    And I see the text "Paso 1 de 2"
    When I press "Siguiente"
    Then I see the text "Escribe el nombre del club."
    When I fill "Nombre del club" with "Club Natación Prueba"
    And I fill "Lema (opcional)" with "Siempre adelante"
    And I press "Siguiente"
    Then I see the text "carpeta «cnl» en tu Drive"
    And the club preview uses the chosen colour
    When I press "Crear mi club"
    Then I am in the "Inicio" module
    And the header shows the name "Club Natación Prueba"
    And the header shows the motto "Siempre adelante"
    And I see the heading "Primeros pasos"
    And Drive contains the club "Club Natación Prueba"

  Scenario: The newly created club is empty, with no sample data and with calls to action
    Given the app has just been opened without a session
    And I have created the club "Club Vacío" with the wizard
    When I open the "Nadadores" module
    Then the swimmers list is empty
    When I open the "Inicio" module
    Then the home panel offers the first steps:
      | Crea tus grupos de entrenamiento |
      | Da de alta a tus nadadores       |
      | Define tu piscina y sus calles   |
      | Programa tu primera sesión       |

  Scenario: The wizard allows going back and keeps what was typed
    Given the app has just been opened without a session
    When I press "Conectar Google Drive"
    And I fill "Nombre del club" with "Club Atrás"
    And I press "Siguiente"
    And I press "Atrás"
    Then the field "Nombre del club" contains "Club Atrás"

  Scenario: Without a Google ID the demo is offered in the required configuration and opens the panel with sample data
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    Then I am in the "Inicio" module
    And I see the heading "Acciones rápidas"

  Scenario: With an already created club the wizard is not shown again
    Given a club with demo data
    When I reload the app
    Then I am in the "Inicio" module
    And I do not see the text "Crea tu club"

  Scenario: The chosen language is saved in the Drive preferences
    Given the app has just been opened without a session
    When I choose the language "English"
    And I press "Connect Google Drive"
    And I fill "Club name" with "English Club"
    And I press "Next"
    And I press "Create my club"
    Then I see the heading "English Club"
    And the Drive preferences store "idioma" with the value "en"
    When I reload the app
    Then the document language is "en"

  Scenario: Disconnecting Drive returns to the start screen
    Given a club with demo data
    When I disconnect Drive
    Then I see the button "Conectar Google Drive"
    And the app menu is not shown

  Scenario: If the browser blocks the Google window, what to do is explained
    Given the app is open and Google rejects the login with "popup-bloqueado"
    When I press "Conectar Google Drive"
    Then I see the text "El navegador ha bloqueado la ventana de Google"

  Scenario: If the e-mail is not a test user, how to add it is explained and the origin is shown
    Given the app is open and Google rejects the login with "acceso-denegado"
    When I press "Conectar Google Drive"
    Then I see the text "debe figurar como usuario de prueba"
    And I see the text "Añade tu correo en «Usuarios de prueba»"
    And I see the origin of this page to copy it

  Scenario: If the origin is not authorised, the current origin is shown to copy it
    Given the app is open and Google rejects the login with "origen-no-autorizado"
    When I press "Conectar Google Drive"
    Then I see the text "Este origen no está autorizado"
    And I see the origin of this page to copy it

  Scenario: The club data lives in the file cnl/<Club>.json of the Drive
    Given a club with demo data
    And I have the "Nadadores" module open
    When I register the swimmer with the data:
      | Nombre    | Persistido |
      | Apellidos | En Drive   |
    Then the club file in Drive contains the swimmer "Persistido"
