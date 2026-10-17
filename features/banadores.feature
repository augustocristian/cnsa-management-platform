# language: en
@swimsuits
Feature: Swimsuit catalogue
  As a coach I want to maintain the club's swimsuit catalogue (training and technical competition suits)
  so that I can state which one each time was achieved with and filter times by type, brand and model

  Background:
    Given a club with demo data
    And I open the swimsuit catalogue

  @smoke
  Scenario: The catalogue shows the swimsuits grouped by type
    Then the catalogue group "Entrenamiento" includes "Speedo Endurance+"
    And the catalogue group "Competición (bañadores técnicos)" includes "Arena Powerskin Carbon Core FX"
    And the catalogue group "Competición (bañadores técnicos)" includes "Mizuno GX Sonic V"

  @smoke
  Scenario: Register a technical competition swimsuit
    When I save a swimsuit with the data:
      | Tipo   | Bañador técnico (competición) |
      | Marca  | TYR                           |
      | Modelo | Venzo Genesis                 |
    Then I see the swimsuit "TYR Venzo Genesis" in the catalogue
    And the catalogue group "Competición (bañadores técnicos)" includes "TYR Venzo Genesis"
    And I see the toast "creado"

  Scenario: A technical swimsuit requires brand and model
    When I save a swimsuit with the data:
      | Tipo | Bañador técnico (competición) |
    Then I see the error "La marca es obligatoria en un bañador técnico." in the swimsuit form
    And I see the error "El modelo es obligatorio en un bañador técnico." in the swimsuit form

  Scenario: The same swimsuit is not repeated
    When I save a swimsuit with the data:
      | Tipo   | Bañador técnico (competición) |
      | Marca  | arena                         |
      | Modelo | POWERSKIN carbon core fx      |
    Then I see the error "Ya existe un bañador de este tipo con la misma marca y modelo." in the swimsuit form

  Scenario: Deactivate a swimsuit and undo it
    When I deactivate the swimsuit "Arena Solid"
    Then the swimsuit "Arena Solid" appears as inactive
    When I undo the last toast
    Then the swimsuit "Arena Solid" appears as active

  @smoke
  Scenario: A swimsuit used in times cannot be deleted
    When I try to delete the swimsuit "Arena Powerskin Carbon Core FX"
    Then the in-use swimsuit dialog offers to deactivate it or merge it with another
    When I press "Cancelar"
    Then I see the swimsuit "Arena Powerskin Carbon Core FX" in the catalogue

  Scenario: A swimsuit without times is deleted with an undo option
    When I save a swimsuit with the data:
      | Tipo   | Bañador de entrenamiento |
      | Marca  | Finis                    |
      | Modelo | Hydro                    |
    And I try to delete the swimsuit "Finis Hydro"
    Then I do not see the swimsuit "Finis Hydro" in the catalogue
    When I undo the last toast
    Then I see the swimsuit "Finis Hydro" in the catalogue
