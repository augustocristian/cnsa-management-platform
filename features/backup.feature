# language: en
@backup
Feature: Full backup
  As a coach I want to download a backup of my whole club and be able to restore it
  so as not to lose data and to be able to go back if I make a mistake.

  Background:
    Given a club with demo data
    And I am in the backup section

  @smoke
  Scenario: Download a full backup and check its content
    When I download the backup
    Then the downloaded file is a valid backup with 12 swimmers
    And the downloaded file name starts with "cnl-backup-"
    And I see the text "Copia descargada"

  Scenario: Modify the data, restore the file and recover everything
    Given I have downloaded a backup
    When I delete all the swimmers of the club
    And I set the club motto to "Lema temporal"
    And I choose the downloaded backup file to restore
    Then I see the preview with 12 new swimmers
    And the default restore mode is "Reemplazar"
    When I try to confirm the restore by typing "no es el nombre"
    Then I see the text "No coincide"
    And the club has 0 swimmers
    When I press "Cancelar"
    And I confirm the restore by typing the club name
    Then I see the restore summary
    And the club has 12 swimmers
    And the club motto is "Pequeño gran club"
    And there is an automatic prior backup in the Drive backups folder

  Scenario: A tampered file is rejected and nothing changes
    Given I have downloaded a backup
    When I delete all the swimmers of the club
    And I choose to restore the downloaded backup but tampered with
    Then I see the text "dañado o fue modificado"
    And I do not see the restore button of the backup
    And the club has 0 swimmers

  Scenario: A file that is not a backup is rejected
    When I choose to restore a file that is not a backup
    Then I see the text "no es una copia de seguridad"
    And I do not see the restore button of the backup

  Scenario: An encrypted backup needs its password
    When I download the backup with the password "una-clave-larga-1"
    Then the downloaded file is encrypted and does not contain the swimmers names
    When I choose the downloaded backup file to restore
    Then I am asked for the backup password
    And I do not see the restore button of the backup
    When I type the password "equivocada-123" to open the backup
    Then I see the text "Contraseña incorrecta o archivo dañado"
    When I type the password "una-clave-larga-1" to open the backup
    Then I see the restore button of the backup

  Scenario: Drive backups are listed and can be restored
    Given there is a daily backup of the club in the Drive backups folder
    When I refresh the list of backups in Drive
    Then the list of backups in Drive has 1 backup
    And the Drive backup says "12 nadadores"
    When I delete all the swimmers of the club
    And I press Restore on the first Drive backup
    Then I see the preview with 12 new swimmers
    And I see the restore button of the backup
