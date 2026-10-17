# language: en
@training-pdf
Feature: Detailed training plan and training PDF
  As a coach I want to detail each session by sets (warm-up, legs, aerobic, relays, cool-down)
  and generate a one-page PDF to take to the pool, for a session or for the whole week

  Background:
    Given a demo club with the Google session started
    And I have the "Entrenamientos" module open

  @smoke
  Scenario: Download the PDF of a session from the weekly list
    When I generate the PDF of the next session of the group "Alevín"
    Then the PDF of the reference session is downloaded with the name "Alevin-YYYY-MM-DD-weekday.pdf"
    And the PDF is valid and has 1 page
    And the PDF contains "TOTALES"
    And the PDF contains "Calentamiento"
    And the PDF contains "Vuelta a la calma"
    And the PDF contains "Club Natación Lugones"
    And the PDF contains "Página 1 de 1"

  Scenario: The next session comes with a detailed plan grouped by sets with totals
    When I open the plan of the next session of the group "Alevín"
    Then the plan has at least 4 sets
    And the plan total matches the sum of the sets
    And row 1 of set 1 has "Calentamiento" in "Objetivo"

  @smoke @mobile
  Scenario: The plan rows are compact, the keyboard does not open and the bottom bar is always in view
    Given I use a phone 375 px wide
    When I open the plan of the next session of the group "Alevín"
    Then when the plan opens no field has the focus
    And no plan row is taller than 300 px
    And the plan bottom bar shows the total, the main button "Guardar" and the more actions menu
    And the plan bottom bar is inside the screen
    And the plan says "Todo guardado"

  Scenario: The unsaved changes indicator and the saved toast do not cover the bottom bar
    When I open the plan of the next session of the group "Alevín"
    And I put "40" in "Series" of row 1 of set 1
    Then the plan says "Cambios sin guardar"
    When I save the plan
    Then the plan says "Todo guardado"
    And the toast does not cover the plan bottom bar

  Scenario: Browser back with unsaved changes asks for confirmation
    When I open the plan of the next session of the group "Alevín"
    And I put "Cambio temporal" in "Tipo de sesión" of the plan
    And I press the browser back button
    Then I see the confirmation dialog "cambios sin guardar"
    When I cancel the dialog
    Then the plan is still open
    When I press the browser back button
    And I accept the dialog
    Then the plan is closed

  Scenario: The totals update live when editing series and distances
    When I open the plan of the next session of the group "Alevín"
    And I note the current plan total
    And I put "40" in "Series" of row 1 of set 1
    And I put "100" in "Distancia" of row 1 of set 1
    Then the block distance of row 1 of set 1 is "4000"
    And the plan total has changed
    And the plan total matches the sum of the sets

  Scenario: Save the plan and recover it when reopening it
    When I open the plan of the next session of the group "Alevín"
    And I put "Técnica E2E" in "Tipo de sesión" of the plan
    And I put "Cuerda" in "Material" of row 1 of set 1
    And I save the plan
    And I close the plan
    And I open the plan of the reference session
    Then the plan field "Tipo de sesión" is "Técnica E2E"
    And row 1 of set 1 has "Cuerda" in "Material"

  Scenario: Add a set with its rows and see it reflected in the PDF
    When I open the plan of the next session of the group "Alevín"
    And I add a set to the plan
    And I put "Relevos E2E" in "Ejercicio" of row 1 of the last set
    And I put "4" in "Series" of row 1 of the last set
    And I put "25" in "Distancia" of row 1 of the last set
    And I put "d/30\"" in "Salida" of row 1 of the last set
    Then the block distance of row 1 of the last set is "100"
    And the last set adds up to "100 m"
    When I generate the PDF of the open plan
    Then the PDF of the reference session is downloaded with the name "Alevin-YYYY-MM-DD-weekday.pdf"
    And the PDF contains "Relevos E2E"
    And the PDF contains "d/30"

  Scenario: Duplicate a set and remove a row
    When I open the plan of the next session of the group "Alevín"
    And I note the current plan total
    And I duplicate set 1 of the plan
    Then the plan has at least 5 sets
    And the plan total has changed
    When I note the current plan total
    And I remove row 1 of set 2
    Then the plan total has changed

  Scenario: A non-numeric value is flagged and does not allow generating the PDF
    When I open the plan of the next session of the group "Alevín"
    And I put "cuatro" in "Series" of row 1 of set 1
    Then row 1 of set 1 flags an error in "Series"
    And I see the plan notice "deben ser un número entero"
    When I try to generate the PDF of the open plan
    Then no PDF is downloaded
    And I see the toast "Corrige los valores marcados antes de generar el PDF"

  Scenario: The departure is normalised to the format C/1'10"
    When I open the plan of the next session of the group "Alevín"
    And I put "1:10" in "Salida" of row 1 of set 1
    And I leave the field "Salida" of row 1 of set 1
    Then row 1 of set 1 has "C/1'10\"" in "Salida"

  Scenario: Use a training template in a new session
    When I create the training session with the data:
      | Título | Sesión con plantilla |
      | Grupo  | Alevín               |
    And I open the plan of the session "Sesión con plantilla"
    And I choose the template "Velocidad"
    Then the plan has at least 4 sets
    When I save the plan
    And I close the plan
    Then the session "Sesión con plantilla" shows its metres and minutes summary

  Scenario: Copy the plan of another session
    When I create the training session with the data:
      | Título | Sesión copia |
      | Grupo  | Alevín       |
    And I open the plan of the session "Sesión copia"
    And I copy the plan of the first available session
    Then the plan has at least 4 sets

  Scenario: Duplicating a session also copies its plan
    When I duplicate the next session of the group "Alevín"
    Then there are 2 sessions equal to the reference one with a plan summary

  Scenario: Weekly PDF with one page per session
    When I generate the PDF of the week
    Then the PDF "Club-semana-{monday}.pdf" is downloaded
    And the PDF has as many pages as sessions shown in the week
    And the PDF contains "TOTALES"
    And the PDF contains "Página 1 de"

  Scenario: Weekly PDF filtered by group
    When I filter the sessions by the group "Alevín"
    And I generate the PDF of the week
    Then the PDF "Alevin-semana-{monday}.pdf" is downloaded
    And the PDF has as many pages as sessions shown in the week

  @desktop
  Scenario: PDF preview before downloading it
    When I open the plan of the next session of the group "Alevín"
    And I open the PDF preview
    Then I see the PDF preview
    When I close the preview
    Then I do not see the PDF preview

  @mobile
  Scenario: On the phone the preview opens the PDF in another tab
    Given I use a touch device
    When I open the plan of the next session of the group "Alevín"
    And I open the PDF preview on the phone
    Then the PDF opens in another tab and not in a frame of the page

  @desktop
  Scenario: Print the plan PDF
    When I open the plan of the next session of the group "Alevín"
    And I press print in the plan
    Then the PDF printing is prepared

  @mobile
  Scenario: On the phone a single button shares the PDF with the device share menu
    Given I use a touch device
    When I open the plan of the next session of the group "Alevín"
    And my device can share files
    Then the menu offers "Compartir PDF" and not "Descargar PDF"
    When I share the PDF of the open plan
    Then a PDF file whose name starts with "Alevin-YYYY-MM-DD" is shared

  Scenario: An empty plan warns before generating the PDF
    When I create the training session with the data:
      | Título | Sesión sin plan |
      | Grupo  | Alevín          |
    And I open the plan of the session "Sesión sin plan"
    And I try to generate the PDF of the open plan and cancel the warning
    Then no PDF is downloaded
    When I generate the PDF of the open plan confirming the warning
    Then the PDF is valid and has 1 page
    And the PDF contains "Esta sesión todavía no tiene plan detallado."

  Scenario: Save the PDF in the cnl/entrenos folder of Drive
    When I open the plan of the next session of the group "Alevín"
    And I save the PDF to Drive
    Then I see the toast "PDF guardado en Drive (cnl/entrenos)"
    And Drive contains the PDF of the reference session in the folder "cnl/entrenos"
    When I save the PDF to Drive
    Then I see the toast "PDF actualizado en Drive"
    And Drive contains a single PDF of the reference session

  Scenario: The PDF texts come out in the active language
    When I change the language to "English"
    And I close the account menu
    And I generate the PDF of the next session of the group "Alevín"
    Then the PDF contains "TOTALS"
    And the PDF contains "SESSION TYPE"
    And the PDF contains "Page 1 of 1"

  Scenario: Closing the plan with unsaved changes asks for confirmation
    When I open the plan of the next session of the group "Alevín"
    And I put "Cambio temporal" in "Tipo de sesión" of the plan
    And I close the plan
    Then I see the confirmation dialog "cambios sin guardar"
    When I cancel the dialog
    Then the plan is still open
    When I close the plan and discard the changes
    Then the plan is closed
