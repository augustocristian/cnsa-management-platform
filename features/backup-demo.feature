# language: en
@backup
Feature: Backup in demo mode
  As a person trying the app I want to be able to download and restore backups
  even if I have not connected my Drive.

  Scenario: In demo mode backups can be downloaded and restored, but Drive backups are disabled
    Given the app is open without a Google Client ID
    When I press "Probar la demo"
    And I open the "Configuración" module
    Then the backups in Drive appear disabled with an explanation
    When I download the backup
    Then the downloaded file is a valid backup with 12 swimmers
    When I delete all the swimmers of the club
    And I choose the downloaded backup file to restore
    Then I see the preview with 12 new swimmers
    When I confirm the restore by typing the club name
    Then I see the restore summary
    And the club has 12 swimmers
    And I see the text "solo mientras dure esta sesión"
