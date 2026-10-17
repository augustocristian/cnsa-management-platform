# language: en
@swimmers
Feature: Swimmer management
  As a coach I want to register, check and edit the swimmers of the club
  and organise them by categories and training groups.
  The category is not typed: it is calculated from the year of birth, sex and season
  (and can be fixed by hand in exceptional cases).

  Background:
    Given a club with demo data
    And I have the "Nadadores" module open

  @smoke
  Scenario: Register a swimmer and see them in the list and in their profile
    Given the current season is "2026-2027"
    When I register the swimmer with the data:
      | Nombre              | Zacarías      |
      | Apellidos           | Testeo Prueba |
      | Fecha de nacimiento | 2014-05-05    |
      | Grupo               | Alevín        |
    Then the swimmers list includes "Zacarías Testeo Prueba"
    When I open the profile of "Zacarías Testeo Prueba"
    Then I see the profile of "Zacarías Testeo Prueba"
    And the profile shows the value "Alevín"

  Scenario: A swimmer cannot be registered without surnames
    When I try to register a swimmer without surnames
    Then the form shows the error "Escribe los apellidos" in the field "Apellidos"
    And the form is still open

  Scenario: Save and add another swimmer leaves the form open for the next one
    When I open the new swimmer form
    And I fill the swimmer form with the data:
      | Nombre    | Primero |
      | Apellidos | Seguido |
    And I save and add another swimmer
    Then the form is still open with the name empty
    When I close the form
    Then the swimmers list includes "Primero Seguido"

  Scenario: Look up a swimmer by searching for their name
    When I search swimmers by "Lucía"
    Then the list shows 1 swimmer
    And the swimmers list includes "Lucía Fernández"

  Scenario: Check the swimmers of a category
    When I filter the swimmers by the category "Alevín"
    Then the list shows 2 swimmers
    And all the listed swimmers are of the category "Alevín"

  Scenario: Check the swimmers of a training group
    When I filter the swimmers by the group "Infantil-Junior"
    Then the list shows 4 swimmers

  Scenario: Edit the data of a swimmer from their profile
    When I open the profile of "Carla Menéndez"
    And I edit the swimmer with the data:
      | Teléfono | 600123456               |
      | Tutor    | Familia Menéndez Prueba |
    Then the profile shows the value "600123456"
    And the profile shows the value "Familia Menéndez Prueba"

  Scenario: Fix the category of a swimmer by hand and change them to another group
    When I open the profile of "Carla Menéndez"
    And I edit the swimmer with the data:
      | Categoría manual  | Sí              |
      | Categoría elegida | Infantil        |
      | Grupo             | Infantil-Junior |
    Then the profile shows the value "Infantil"
    And the profile shows the value "manual"
    And the profile shows the value "Infantil-Junior"

  Scenario: Delete a swimmer
    When I open the profile of "Pelayo García"
    And I delete the swimmer
    Then I see the toast "Nadador eliminado"
    And the swimmers list does not include "Pelayo García"

  Scenario: Undoing the deletion of a swimmer brings them back with their data
    When I open the profile of "Pelayo García"
    And I delete the swimmer
    And I undo the deletion
    Then the swimmers list includes "Pelayo García"

  Scenario: An inactive swimmer does not appear in the list unless inactive ones are requested
    When I open the profile of "Pelayo García"
    And I edit the swimmer with the data:
      | Estado | Inactivo |
    And I open the "Nadadores" module
    Then the swimmers list does not include "Pelayo García"
    When I tick show inactive swimmers
    Then the swimmers list includes "Pelayo García"

  @smoke
  Scenario: The individual profile gathers the personal data and the sports profile
    When I open the profile of "Carla Menéndez"
    Then the profile shows the personal data:
      | Categoría           |
      | Grupo               |
      | Fecha de nacimiento |
      | Email               |
      | Teléfono            |
      | Tutor               |
      | Licencia            |
    And the profile includes the sports profile sections:
      | Asistencia          |
      | Cargas              |
      | Evolución de marcas |
    And the profile shows its attendance percentage

  @categories
  Scenario: The category is assigned automatically by year of birth
    Given the current season is "2026-2027"
    When I register the swimmer with the data:
      | Nombre              | Ana              |
      | Apellidos           | Auto Pruebas     |
      | Fecha de nacimiento | 2016-04-04       |
      | Sexo                | Femenino         |
    Then the swimmer "Ana Auto Pruebas" appears in the category "Benjamín"
    And the swimmer "Ana Auto Pruebas" does not have the badge "manual"
    When I open the profile of "Ana Auto Pruebas"
    Then the profile shows the value "Benjamín"
    And the profile shows the value "Temporada 2026-2027: nacidos en 2016-2017"

  @categories
  Scenario Outline: The table of the 2026-2027 season comes from the year of birth
    Given the current season is "2026-2027"
    When I register the swimmer with the data:
      | Nombre              | Tabla     |
      | Apellidos           | <born>  |
      | Fecha de nacimiento | <born>  |
    Then the swimmer "Tabla <born>" appears in the category "<category>"

    Examples:
      | born       | category     |
      | 2018-01-01 | Pre-Benjamín |
      | 2018-12-31 | Pre-Benjamín |
      | 2017-12-31 | Benjamín     |
      | 2016-01-01 | Benjamín     |
      | 2015-12-31 | Alevín       |
      | 2014-01-01 | Alevín       |
      | 2013-12-31 | Infantil     |
      | 2012-01-01 | Infantil     |
      | 2011-12-31 | Junior       |
      | 2009-01-01 | Junior       |
      | 2008-12-31 | Absoluto     |
      | 1990-05-05 | Absoluto     |

  @categories
  Scenario: Settings show the birth years of each category of the season
    Given the current season is "2026-2027"
    When I open the "Configuración" module
    Then I see the panel "Categorías de la temporada 2026-2027"
    And the categories table shows:
      | Pre-Benjamín | 2018              |
      | Benjamín     | 2016-2017         |
      | Alevín       | 2014-2015         |
      | Infantil     | 2012-2013         |
      | Junior       | 2009-2011         |
      | Absoluto     | 2008 y anteriores |

  @categories
  Scenario: The form calculates the category live and does not allow editing it
    Given the current season is "2026-2027"
    When I open the new swimmer form
    Then the form asks for the birth date to calculate the category
    When I enter the birth date "2014-05-05"
    Then the form shows the automatic category "Alevín" for those born in "2014-2015"
    When I enter the birth date "2008-12-31"
    Then the form shows the automatic category "Absoluto" for those born in "2008 y anteriores"

  @categories
  Scenario: A swimmer with a master licence and enough age is Master
    Given the current season is "2026-2027"
    When I register the swimmer with the data:
      | Nombre              | Mara           |
      | Apellidos           | Master Pruebas |
      | Fecha de nacimiento | 1985-02-02     |
      | Licencia máster     | Sí             |
    Then the swimmer "Mara Master Pruebas" appears in the category "Master"

  @categories
  Scenario: Without a master licence an adult swimmer remains Absolute
    Given the current season is "2026-2027"
    When I register the swimmer with the data:
      | Nombre              | Sin            |
      | Apellidos           | Licencia Prueba |
      | Fecha de nacimiento | 1985-02-02     |
    Then the swimmer "Sin Licencia Prueba" appears in the category "Absoluto"

  @categories
  Scenario: The manual category prevails over the automatic one and is flagged
    Given the current season is "2026-2027"
    When I register the swimmer with the data:
      | Nombre              | Mano            |
      | Apellidos           | Manual Pruebas  |
      | Fecha de nacimiento | 2014-05-05      |
      | Categoría manual    | Sí              |
      | Categoría elegida   | Junior          |
    Then the swimmer "Mano Manual Pruebas" appears in the category "Junior"
    And the swimmer "Mano Manual Pruebas" has the badge "manual"

  @categories
  Scenario: A season change promotes the right swimmers, after previewing and confirming it
    Given the current season is "2026-2027"
    And I have registered the swimmer "Sube Pruebas" born on "2014-05-05"
    And I have registered the swimmer "Fijo Pruebas" born on "2014-05-05" with the manual category "Alevín"
    When I open the "Configuración" module
    And I choose the season "2027-2028" and press "Cambiar de temporada"
    Then the preview says that "Sube Pruebas" goes from "Alevín" to "Infantil"
    And the preview does not include "Fijo Pruebas"
    When I apply the season change
    Then I see the panel "Categorías de la temporada 2027-2028"
    And the categories table shows:
      | Pre-Benjamín | 2019              |
      | Alevín       | 2015-2016         |
      | Absoluto     | 2009 y anteriores |
    When I open the "Nadadores" module
    Then the swimmer "Sube Pruebas" appears in the category "Infantil"
    And the swimmer "Fijo Pruebas" appears in the category "Alevín"

  @categories
  Scenario: The category filter follows the order from youngest to oldest
    Then the category filter offers, in this order:
      | Pre-Benjamín |
      | Benjamín    |
      | Alevín      |
      | Infantil    |
      | Junior      |
      | Absoluto    |
      | Master      |

  @categories
  Scenario Outline: Each category takes its place in the official order
    Then the category "<category>" is in position <position> in the category filter

    Examples:
      | category    | position |
      | Pre-Benjamín | 1        |
      | Benjamín    | 2        |
      | Alevín      | 3        |
      | Infantil    | 4        |
      | Junior      | 5        |
      | Absoluto    | 6        |
      | Master      | 7        |

  @categories
  Scenario Outline: The list sorts the swimmers by category
    Then in the list the swimmers of "<previous>" appear before those of "<next>"

    Examples:
      | previous    | next      |
      | Pre-Benjamín | Benjamín  |
      | Benjamín    | Alevín    |
      | Alevín      | Infantil  |
      | Infantil    | Junior    |
      | Junior      | Absoluto  |
      | Absoluto    | Master    |

  Scenario: Training groups gather their swimmers
    When I open the "Grupos" module
    Then I see the group "Promoción"
    And the group "Promoción" has 3 swimmers
    And the group "Promoción" includes "Martina Suárez"
    And the group "Promoción" is in charge of "Marta Valdés"

  Scenario: Create a training group and assign a swimmer to it
    When I open the "Grupos" module
    And I create the group with the data:
      | Nombre     | Tiburones   |
      | Categoría  | Junior      |
      | Entrenador | Ana Pruebas |
    Then I see the group "Tiburones"
    When I open the "Nadadores" module
    And I open the profile of "Paula González"
    And I edit the swimmer with the data:
      | Grupo | Tiburones |
    And I open the "Grupos" module
    Then the group "Tiburones" includes "Paula González"
    And the group "Tiburones" has 1 swimmer

  Scenario: Edit a training group
    When I open the "Grupos" module
    And I edit the group "Promoción" with the data:
      | Entrenador | Lucas Nuevo |
    Then the group "Promoción" is in charge of "Lucas Nuevo"

  Scenario: Deleting a group leaves its swimmers without a group
    When I open the "Grupos" module
    And I delete the group "Absoluto-Master"
    Then I do not see the group "Absoluto-Master"
    And "Javier Álvarez" appears among the swimmers without a group

  Scenario: Undoing the deletion of a group brings its swimmers back
    When I open the "Grupos" module
    And I delete the group "Absoluto-Master"
    And I undo the deletion
    Then I see the group "Absoluto-Master"
    And the group "Absoluto-Master" includes "Javier Álvarez"

  Scenario: The groups page shows no leftover texts
    When I open the "Grupos" module
    Then the groups page does not show "null"
    And the groups page does not show "Alevín Alevín"
