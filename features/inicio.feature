# language: en
@home
Feature: Home panel
  As the coach of the club
  I want a quick view of the most relevant things, the recent activity and the notices
  to start the day knowing what is going on

  @smoke
  Scenario Outline: The panel summarises the relevant information of the club
    Given a club with demo data
    Then I see the heading "<card>"

    Examples: Today, attendance, alerts, actions, loads, notices and season
      | card                           |
      | Hoy                            |
      | Asistencia hoy                 |
      | Alertas de cargas              |
      | Acciones rápidas               |
      | Carga semanal del club         |
      | Avisos recientes               |
      | Próximo evento de la temporada |

  @smoke
  Scenario: The banner summarises the day with the club name
    Given a club with demo data
    Then the panel banner shows the club name "Club Natación Lugones"
    And the panel banner summarises the sessions of today

  Scenario Outline: The quick actions lead directly to the task
    Given a club with demo data
    When I press the quick action "<action>"
    Then I am in the "<module>" module

    Examples:
      | action           | module         |
      | Pasar lista      | Asistencia     |
      | Registrar carga  | Cargas         |
      | Nueva marca      | Marcas         |
      | Nuevo aviso      | Avisos y notas |

  @desktop
  Scenario: On desktop the cards fill each row without gaps
    Given a club with demo data
    Then the panel cards fill each row without gaps

  Scenario: The panel does not overflow horizontally and the weekly chart is legible and accessible
    Given a club with demo data
    Then the panel has no horizontal scroll
    And the weekly chart texts are at least 11 pixels
    And the weekly chart has a table as an alternative

  Scenario: The load alerts use the alert component with an icon
    Given a club with demo data
    Then every load alert of the panel has an icon and text

  Scenario: A new notice appears among the recent notices of the panel
    Given a club with demo data
    And I have the "Avisos y notas" module open
    When I save a notice with the data:
      | Título        | Cambio de horario del sábado    |
      | Grupo         | Todo el club                    |
      | Texto         | El sábado se entrena a las 9:00 |
    And I open the "Inicio" module
    Then I see the text "Cambio de horario del sábado"

  Scenario: The notices bell leads to the notices and notes
    Given a club with demo data
    When I press the notices bell
    Then I am in the "Avisos y notas" module

  @smoke
  Scenario: An empty club offers an action in each card and the first steps
    Given the app has just been opened without a session
    And I have created the club "Club Vacío" with the wizard
    Then I see the heading "Primeros pasos"
    And the card "Hoy" offers "Programar una sesión"
    And the card "Asistencia hoy" offers "Abrir asistencia"
    And the card "Alertas de cargas" offers "Definir objetivos"
    And the card "Carga semanal del club" offers "Registrar carga"
    And the card "Avisos recientes" offers "Escribir un aviso"
    And the card "Próximo evento de la temporada" offers "Planificar la temporada"

  Scenario: The first steps can be hidden and do not appear again
    Given the app has just been opened without a session
    And I have created the club "Club Vacío" with the wizard
    Then I see the heading "Primeros pasos"
    When I hide the first steps
    Then I do not see the text "Primeros pasos"
    When I reload the app
    Then I do not see the text "Primeros pasos"
