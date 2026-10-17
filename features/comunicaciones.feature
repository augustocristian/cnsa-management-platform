# language: en
@communications
Feature: Notices and notes
  As a coach I want a space of my own to save notices and notes for the whole club or for a group,
  without the app sending anything to anyone (I can copy the text to pass it on through my usual channel)

  Background:
    Given a club with demo data
    And I have the "Avisos y notas" module open

  @smoke
  Scenario: Save a notice for the whole club
    When I save a notice with the data:
      | Título        | Fiesta de fin de temporada      |
      | Grupo         | Todo el club                    |
      | Texto         | Os esperamos el viernes a las 18h |
    Then I see the saved notice "Fiesta de fin de temporada"
    And the notice "Fiesta de fin de temporada" is addressed to "Todos"

  Scenario: Save a notice for a group
    When I save a notice with the data:
      | Título        | Entrenamiento extra       |
      | Grupo         | Promoción                 |
      | Texto         | Traed gorro y gafas extra |
    Then the notice "Entrenamiento extra" is addressed to "Promoción"

  Scenario: Filter the notices of a group
    Given I have saved the notice "Solo alevines" for "Alevín"
    And I have saved the notice "Para todos" for "Todo el club"
    When I filter the notices by "Alevín"
    Then I see the saved notice "Solo alevines"
    And I do not see the saved notice "Para todos"

  Scenario: Filter only the general notices
    Given I have saved the notice "Solo alevines" for "Alevín"
    And I have saved the notice "Para todos" for "Todo el club"
    When I filter the notices by "Sólo generales"
    Then I see the saved notice "Para todos"
    And I do not see the saved notice "Solo alevines"

  Scenario: Delete a notice
    Given I have saved the notice "Aviso erróneo" for "Todo el club"
    When I delete the notice "Aviso erróneo"
    Then I do not see the saved notice "Aviso erróneo"

  Scenario: Undoing the deletion of a notice brings it back
    Given I have saved the notice "Aviso dudoso" for "Todo el club"
    When I delete the notice "Aviso dudoso"
    And I undo the deletion
    Then I see the saved notice "Aviso dudoso"

  Scenario: A newly saved notice shows its date in relative form
    Given I have saved the notice "Aviso de hoy" for "Todo el club"
    Then the notice "Aviso de hoy" shows the date "hoy"

  Scenario: A notice without text is not saved
    When I fill "Título" with "Aviso vacío"
    And I press "Guardar aviso"
    Then the notices form shows the error "Escribe el texto del aviso"
