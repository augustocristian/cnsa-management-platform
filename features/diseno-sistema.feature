# language: en
@design
Feature: Design system
  As a coach I want an accessible app, with dark mode and toasts that let me undo
  to work safely from the phone, at the pool or in the office

  Background:
    Given a club with demo data

  @smoke @accessibility
  Scenario: The skip link leads to the content without changing the route
    When I press Tab once from the start of the page
    Then the focus is on the link "Saltar al contenido"
    And the skip link is visible
    When I activate the skip link with Enter
    Then the focus is on the main content
    And the route is still "#/inicio"

  @accessibility
  Scenario: The keyboard focus is always visible
    When I Tab through the first 8 interactive elements
    Then every focused element shows a visible outline of at least 2 px

  @theme @smoke
  Scenario: Dark mode is applied, saved and survives a reload
    When I choose the theme "Oscuro"
    Then the app uses dark mode
    And the local preferences store the theme "dark"
    And the Drive preferences end up storing the theme "dark"
    When I reload the app
    Then the app uses dark mode
    And the theme selector shows "Oscuro"

  @theme
  Scenario: Dark mode is applied before the first paint
    When I choose the theme "Oscuro"
    And I reload the app watching the paint order
    Then the dark theme was applied before painting the app

  @theme
  Scenario: The automatic theme follows the system and the forced one ignores it
    Given the operating system prefers dark mode
    When I choose the theme "Automático"
    Then the app uses dark mode
    When I choose the theme "Claro"
    Then the app uses light mode
    When I choose the theme "Automático"
    Then the app uses dark mode

  @theme
  Scenario: The screen title, the club name and the menu are readable in dark and in light
    When I choose the theme "Oscuro"
    And I open the "Nadadores" module
    Then the title, the club name and the menu have a contrast of at least 4.5
    When I choose the theme "Claro"
    Then the title, the club name and the menu have a contrast of at least 4.5

  @theme @desktop
  Scenario: A very light club colour still leaves the menu readable
    Given I have the "Configuración" module open
    When I customise the club identity with:
      | Color primario | #ffd600 |
    And I save the club identity
    And I open the "Inicio" module
    Then the primary colour of the app is "#ffd600"
    And the text on the club colour is "#111111"
    And the active menu option has a contrast of at least 4.5

  @toasts
  Scenario: A toast with Undo allows reverting the action
    When the toast "Nadador eliminado" is shown with the Undo action
    Then the toast "Nadador eliminado" is accessible with role "status"
    And the toast has the button "Deshacer"
    When I press the button "Deshacer" of the toast
    Then the undo action ran once
    And the toast "Nadador eliminado" disappears

  @toasts
  Scenario: Error toasts are announced as an alert and do not disappear with the mouse over them
    When an error toast "No se pudo guardar" is shown
    Then the toast "No se pudo guardar" is accessible with role "alert"
    When I hover over the toast "No se pudo guardar"
    And 7 seconds pass
    Then the toast "No se pudo guardar" is still visible

  @sheet
  Scenario: A sheet traps the focus, blocks the background page and returns the focus when closing
    When I open a test sheet from the button "Nuevo nadador"
    Then the focus is inside the sheet
    And the background page is inert and does not scroll
    When I press Tab 12 times
    Then the focus stays inside the sheet
    When I press Escape
    Then the sheet closes
    And the focus returns to the button "Nuevo nadador"
    And the background page is active again

  @sheet @mobile
  Scenario: On the phone the sheet rises from the bottom
    Given I use a phone 375 px wide
    When I open a test sheet from the button "Nuevo nadador"
    Then the sheet is anchored to the bottom edge of the screen

  @sheet
  Scenario: Deleting asks for confirmation with the focus on Cancel
    When I open a destructive confirmation dialog
    Then the focus is on the button "Cancelar"
    And the destructive button is called "Eliminar"

