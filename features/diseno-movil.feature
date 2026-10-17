# language: en
@design
Feature: Mobile-first design
  As a coach who works from the pool I want a simple,
  consistent app adapted to mobile, tablet and desktop

  Background:
    Given a club with demo data

  @smoke @navigation
  Scenario Outline: All the modules are reachable from the menu without errors
    When I press "<module>" in the menu
    Then the "<module>" screen is shown complete and without errors

    Examples:
      | module         |
      | Inicio         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |
      | Configuración  |

  @mobile
  Scenario Outline: No screen overflows horizontally on a phone
    Given I use a phone 375 px wide
    Then the "<module>" screen has no horizontal scroll

    Examples:
      | module         |
      | Inicio         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |

  Scenario Outline: The app adapts to mobile, tablet and desktop
    Given I use a device <width> px wide
    Then the "<module>" screen has no horizontal scroll

    Examples:
      | width | module         |
      | 375   | Inicio         |
      | 375   | Marcas         |
      | 768   | Inicio         |
      | 768   | Nadadores      |
      | 768   | Cargas         |
      | 1280  | Inicio         |
      | 1280  | Entrenamientos |
      | 1280  | Marcas         |

  Scenario Outline: The menu is placed according to the screen size
    Given I use a device <width> px wide
    Then the navigation menu is at the <position>

    Examples:
      | width | position |
      | 375   | bottom   |
      | 768   | bottom   |

  @desktop
  Scenario: On desktop the menu is on the side
    Given I use a device 1280 px wide
    Then the navigation menu is at the side

  @mobile
  Scenario: The menu options can be pressed with the thumb
    Given I use a phone 375 px wide
    Then the menu options are at least 44 px tall

  @mobile
  Scenario: Take attendance from the phone with a single tap per swimmer
    Given I use a phone 375 px wide
    And I have created the session "Lista móvil" for the group "Promoción"
    When I open the "Asistencia" module
    And I select the session "Lista móvil" to take attendance
    And I mark the status present for "Martina Suárez"
    Then the attendance count shows "Presentes: 1"

  Scenario: Forms are easy to fill in because all their fields have a label
    Given I have the "Nadadores" module open
    When I press "Nuevo nadador"
    Then all the fields of the open form have a label

  Scenario Outline: The quick log forms have all their fields labelled
    Given I have the "<module>" module open
    Then all the log fields of the screen have a label

    Examples:
      | module         |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |

  Scenario Outline: Every screen has a clear and consistent title
    Then the "<module>" screen has a title

    Examples:
      | module         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |

  Scenario: The app declares a mobile-friendly viewport
    Then the app declares a mobile-friendly viewport

  @i18n
  Scenario Outline: The language can be changed from the settings menu in the header
    When I change the language to "<language>"
    Then the menu shows "<text>" for the module "Nadadores"
    And the document language is "<code>"

    Examples:
      | language| text      | code   |
      | English | Swimmers  | en     |
      | Italiano| Nuotatori | it     |
      | Español | Nadadores | es     |

  @mobile @navigation
  Scenario: On mobile the bottom bar offers four shortcuts and the More button
    Given I use a phone 375 px wide
    Then the bottom bar shows the shortcuts "Inicio, Entrenos, Asistencia, Calendario, Más"

  @mobile @navigation
  Scenario: The More button opens a sheet with the grouped modules
    Given I use a phone 375 px wide
    When I open the "Más" sheet of the menu
    Then the menu sheet has the group "Personas" with "Nadadores, Grupos"
    And the menu sheet has the group "Entrenamiento" with "Planificación, Cargas, Marcas"
    And the menu sheet has the group "Club" with "Avisos y notas, Configuración, Tutorial"
    And the menu sheet does not offer "Bañador"

  @mobile @navigation
  Scenario: A module chosen in the More sheet is marked in the More button
    Given I use a phone 375 px wide
    When I press "Grupos" in the menu
    Then I am in the "Grupos" module
    And the More button is marked as active

  @desktop @navigation
  Scenario: On desktop the side menu groups the modules with headings
    Given I use a device 1280 px wide
    Then the side menu has the headings "Personas, Entrenamiento, Club"

  @navigation @accessibility
  Scenario: When changing screen the title, the focus and the current menu item are updated
    When I press "Nadadores" in the menu
    Then the document title starts with "Nadadores"
    And the focus is on the heading of the screen
    And the current menu item is "Nadadores"

  @navigation
  Scenario: The footer only appears in Settings
    Then there is no footer
    When I open the "Configuración" module
    Then there is a footer
    When I open the "Nadadores" module
    Then there is no footer

  @navigation
  Scenario: The settings menu gathers language, theme, Drive status and disconnection
    When I open the settings and connection menu
    Then the settings menu offers the language, the theme, the Drive status and the button "Desconectar Drive"
    And the settings menu shows no user identity
