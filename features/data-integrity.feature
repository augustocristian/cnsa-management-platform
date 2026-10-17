# language: en
Feature: Data integrity and personal data protection
  As the coach of a club
  I want my data neither to be lost nor to stay on someone else's device
  So that I can trust the app with my swimmers' data

  Scenario: Disconnecting Drive leaves no copy of the data on the device
    Given a demo club is open
    And the club file in Drive contains the swimmer "Lucía"
    When I disconnect Drive
    Then the screen offers the button "Conectar Google Drive"
    And the browser holds no local club or session copies

  Scenario: Disconnecting Drive with unsynced changes warns and allows discarding or cancelling
    Given a demo club is open
    And the club file in Drive contains the swimmer "Lucía"
    And Drive rejects writes
    When I change the club motto to "Lema sin subir"
    And I disconnect Drive
    Then the screen shows the text "Hay cambios sin subir a Drive"
    And the screen offers the button "Descargar copia (.xlsx)"
    When I press the button "Cancelar"
    Then I am in the "Configuración" module
    When I disconnect Drive
    Then the screen shows the text "Hay cambios sin subir a Drive"
    When I press the button "Descartar y desconectar"
    Then the screen offers the button "Conectar Google Drive"
    And the browser holds no local club or session copies

  Scenario: A damaged file in Drive is not overwritten: restoring the local copy is offered
    Given a demo club is open
    And the club file in Drive contains the swimmer "Lucía"
    When the club file in Drive gets damaged and the page reloads
    Then the screen shows the text "Fichero dañado"
    And the screen offers the button "Restaurar último backup"
    When I press the button "Restaurar copia local"
    And I press the confirmation button "Aceptar"
    Then the app shell opens
    And the club file in Drive contains the swimmer "Lucía"

  Scenario: A club whose name and motto are not text still opens
    Given a demo club is open
    And the club file in Drive contains the swimmer "Lucía"
    When another device saves the club with the name 12345 and a non-text motto
    And I reload the app
    Then the club name in the header is "12345"

  Scenario: An expired Drive connection is announced and reconnected with one click
    Given a demo club is open
    When the Drive connection expires
    Then the screen shows the text "La conexión con Drive ha caducado"
    When I press "Reconectar" in the notices bar
    Then the screen does not show the text "La conexión con Drive ha caducado"

  Scenario: The privacy notice appears the first time and does not come back
    Given a demo club is open
    Then the screen shows the text "Los datos de tus nadadores (incluidos menores) se guardan únicamente en tu Google Drive"
    When I press "Entendido" in the notices bar
    Then the screen does not show the text "Eres el responsable del tratamiento"
    And Drive preferences store the privacy acceptance
    When I reload the app
    Then the screen does not show the text "Eres el responsable del tratamiento"

  Scenario: Deleting a swimmer and all their data also removes them from the Drive file
    Given a demo club is open
    And the club file in Drive contains the swimmer "Lucía"
    When I open the "Nadadores" module
    And I open the profile of the swimmer "Lucía"
    And I press the button "Eliminar nadador y todos sus datos"
    And I press the confirmation button "Eliminar nadador y todos sus datos"
    Then the club file in Drive no longer contains the swimmer "Lucía"
    And the club file in Drive still holds the other swimmers

  Scenario: Settings remind the data protection rights
    Given a demo club is open
    When I open the "Configuración" module
    Then the screen shows the text "Protección de datos (RGPD)"
    And the screen shows the text "Administrar versiones"
