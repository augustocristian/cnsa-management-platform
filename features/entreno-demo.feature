# language: en
@training @training-demo
Feature: The training plan in demo mode
  As a person trying the app without connecting Google Drive I want to be able to prepare and download the training PDF,
  and know why saving it to Drive is not available

  Scenario: In demo mode saving to Drive is disabled and the PDF can be downloaded
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I open the "Entrenamientos" module
    And I open the plan of the next session of the group "Alevín"
    Then the menu option "Guardar en Drive" is disabled and explains why
    When I generate the PDF of the open plan
    Then the PDF is valid and has 1 page
