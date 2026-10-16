# language: es
@nadadores
Característica: Gestión de nadadores
  Como entrenador quiero dar de alta, consultar y editar a los nadadores del club
  y organizarlos por categorías y grupos de entrenamiento.
  La categoría no se teclea: se calcula por año de nacimiento, sexo y temporada
  (y puede fijarse a mano en casos excepcionales).

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Nadadores"

  @smoke
  Escenario: Dar de alta a un nadador y verlo en el listado y en su ficha
    Dado que la temporada vigente es la "2026-2027"
    Cuando doy de alta al nadador con los datos:
      | Nombre              | Zacarías      |
      | Apellidos           | Testeo Prueba |
      | Fecha de nacimiento | 2014-05-05    |
      | Grupo               | Alevín        |
    Entonces el listado de nadadores incluye a "Zacarías Testeo Prueba"
    Cuando abro la ficha de "Zacarías Testeo Prueba"
    Entonces veo la ficha de "Zacarías Testeo Prueba"
    Y la ficha muestra el valor "Alevín"

  Escenario: No se puede dar de alta a un nadador sin apellidos
    Cuando intento dar de alta a un nadador sin apellidos
    Entonces veo el aviso "Nombre y apellidos son obligatorios"
    Y el formulario sigue abierto

  Escenario: Consultar a un nadador buscándolo por nombre
    Cuando busco nadadores por "Lucía"
    Entonces el listado muestra 1 nadador
    Y el listado de nadadores incluye a "Lucía Fernández"

  Escenario: Consultar los nadadores de una categoría
    Cuando filtro los nadadores por la categoría "Alevín"
    Entonces el listado muestra 2 nadadores
    Y todos los nadadores listados son de la categoría "Alevín"

  Escenario: Consultar los nadadores de un grupo de entrenamiento
    Cuando filtro los nadadores por el grupo "Infantil-Junior"
    Entonces el listado muestra 4 nadadores

  Escenario: Editar los datos de un nadador desde su ficha
    Cuando abro la ficha de "Carla Menéndez"
    Y edito al nadador con los datos:
      | Teléfono | 600123456               |
      | Tutor    | Familia Menéndez Prueba |
    Entonces la ficha muestra el valor "600123456"
    Y la ficha muestra el valor "Familia Menéndez Prueba"

  Escenario: Fijar a mano la categoría de un nadador y cambiarlo de grupo
    Cuando abro la ficha de "Carla Menéndez"
    Y edito al nadador con los datos:
      | Categoría manual  | Sí              |
      | Categoría elegida | Infantil        |
      | Grupo             | Infantil-Junior |
    Entonces la ficha muestra el valor "Infantil"
    Y la ficha muestra el valor "manual"
    Y la ficha muestra el valor "Infantil-Junior"

  Escenario: Eliminar a un nadador
    Cuando abro la ficha de "Pelayo García"
    Y elimino al nadador y lo confirmo
    Entonces veo el aviso "Nadador eliminado"
    Y el listado de nadadores no incluye a "Pelayo García"

  @smoke
  Escenario: La ficha individual reúne los datos personales y el perfil deportivo
    Cuando abro la ficha de "Carla Menéndez"
    Entonces la ficha muestra los datos personales:
      | Categoría           |
      | Grupo               |
      | Fecha de nacimiento |
      | Email               |
      | Teléfono            |
      | Tutor               |
      | Licencia            |
    Y la ficha incluye las secciones del perfil deportivo:
      | Asistencia          |
      | Cargas              |
      | Evolución de marcas |
    Y la ficha muestra su porcentaje de asistencia

  @categorias
  Escenario: La categoría se asigna automáticamente por año de nacimiento
    Dado que la temporada vigente es la "2026-2027"
    Cuando doy de alta al nadador con los datos:
      | Nombre              | Ana              |
      | Apellidos           | Auto Pruebas     |
      | Fecha de nacimiento | 2016-04-04       |
      | Sexo                | Femenino         |
    Entonces el nadador "Ana Auto Pruebas" figura en la categoría "Benjamín"
    Y el nadador "Ana Auto Pruebas" no lleva la insignia "manual"
    Cuando abro la ficha de "Ana Auto Pruebas"
    Entonces la ficha muestra el valor "Benjamín"
    Y la ficha muestra el valor "Temporada 2026-2027: nacidos en 2016-2017"

  @categorias
  Esquema del escenario: La tabla de la temporada 2026-2027 sale del año de nacimiento
    Dado que la temporada vigente es la "2026-2027"
    Cuando doy de alta al nadador con los datos:
      | Nombre              | Tabla     |
      | Apellidos           | <nacido>  |
      | Fecha de nacimiento | <nacido>  |
    Entonces el nadador "Tabla <nacido>" figura en la categoría "<categoria>"

    Ejemplos:
      | nacido     | categoria    |
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

  @categorias
  Escenario: Configuración muestra los años de nacimiento de cada categoría de la temporada
    Dado que la temporada vigente es la "2026-2027"
    Cuando abro el módulo "Configuración"
    Entonces veo el panel "Categorías de la temporada 2026-2027"
    Y la tabla de categorías muestra:
      | Pre-Benjamín | 2018              |
      | Benjamín     | 2016-2017         |
      | Alevín       | 2014-2015         |
      | Infantil     | 2012-2013         |
      | Junior       | 2009-2011         |
      | Absoluto     | 2008 y anteriores |

  @categorias
  Escenario: El formulario calcula la categoría en vivo y no deja editarla
    Dado que la temporada vigente es la "2026-2027"
    Cuando abro el formulario de nuevo nadador
    Entonces el formulario pide la fecha de nacimiento para calcular la categoría
    Cuando indico la fecha de nacimiento "2014-05-05"
    Entonces el formulario muestra la categoría automática "Alevín" para los nacidos en "2014-2015"
    Cuando indico la fecha de nacimiento "2008-12-31"
    Entonces el formulario muestra la categoría automática "Absoluto" para los nacidos en "2008 y anteriores"

  @categorias
  Escenario: Un nadador con licencia máster y edad suficiente es Master
    Dado que la temporada vigente es la "2026-2027"
    Cuando doy de alta al nadador con los datos:
      | Nombre              | Mara           |
      | Apellidos           | Master Pruebas |
      | Fecha de nacimiento | 1985-02-02     |
      | Licencia máster     | Sí             |
    Entonces el nadador "Mara Master Pruebas" figura en la categoría "Master"

  @categorias
  Escenario: Sin licencia máster un nadador adulto sigue siendo Absoluto
    Dado que la temporada vigente es la "2026-2027"
    Cuando doy de alta al nadador con los datos:
      | Nombre              | Sin            |
      | Apellidos           | Licencia Prueba |
      | Fecha de nacimiento | 1985-02-02     |
    Entonces el nadador "Sin Licencia Prueba" figura en la categoría "Absoluto"

  @categorias
  Escenario: La categoría manual manda sobre la automática y se señala
    Dado que la temporada vigente es la "2026-2027"
    Cuando doy de alta al nadador con los datos:
      | Nombre              | Mano            |
      | Apellidos           | Manual Pruebas  |
      | Fecha de nacimiento | 2014-05-05      |
      | Categoría manual    | Sí              |
      | Categoría elegida   | Junior          |
    Entonces el nadador "Mano Manual Pruebas" figura en la categoría "Junior"
    Y el nadador "Mano Manual Pruebas" lleva la insignia "manual"

  @categorias
  Escenario: Un cambio de temporada sube de categoría a quien corresponde, tras previsualizarlo y confirmarlo
    Dado que la temporada vigente es la "2026-2027"
    Y que he dado de alta al nadador "Sube Pruebas" nacido el "2014-05-05"
    Y que he dado de alta al nadador "Fijo Pruebas" nacido el "2014-05-05" con la categoría manual "Alevín"
    Cuando abro el módulo "Configuración"
    Y elijo la temporada "2027-2028" y pulso "Cambiar de temporada"
    Entonces la previsualización indica que "Sube Pruebas" pasa de "Alevín" a "Infantil"
    Y la previsualización no incluye a "Fijo Pruebas"
    Cuando aplico el cambio de temporada
    Entonces veo el panel "Categorías de la temporada 2027-2028"
    Y la tabla de categorías muestra:
      | Pre-Benjamín | 2019              |
      | Alevín       | 2015-2016         |
      | Absoluto     | 2009 y anteriores |
    Cuando abro el módulo "Nadadores"
    Entonces el nadador "Sube Pruebas" figura en la categoría "Infantil"
    Y el nadador "Fijo Pruebas" figura en la categoría "Alevín"

  @categorias
  Escenario: El filtro de categorías sigue el orden de menor a mayor edad
    Entonces el filtro de categorías ofrece, en este orden:
      | Pre-Benjamín |
      | Benjamín    |
      | Alevín      |
      | Infantil    |
      | Junior      |
      | Absoluto    |
      | Master      |

  @categorias
  Esquema del escenario: Cada categoría ocupa su lugar en el orden oficial
    Entonces la categoría "<categoria>" ocupa la posición <posicion> en el filtro de categorías

    Ejemplos:
      | categoria   | posicion |
      | Pre-Benjamín | 1        |
      | Benjamín    | 2        |
      | Alevín      | 3        |
      | Infantil    | 4        |
      | Junior      | 5        |
      | Absoluto    | 6        |
      | Master      | 7        |

  @categorias
  Esquema del escenario: El listado ordena a los nadadores por categoría
    Entonces en el listado los nadadores de "<anterior>" aparecen antes que los de "<siguiente>"

    Ejemplos:
      | anterior    | siguiente |
      | Pre-Benjamín | Benjamín  |
      | Benjamín    | Alevín    |
      | Alevín      | Infantil  |
      | Infantil    | Junior    |
      | Junior      | Absoluto  |
      | Absoluto    | Master    |

  Escenario: Los grupos de entrenamiento reúnen a sus nadadores
    Cuando abro el módulo "Grupos"
    Entonces veo el grupo "Promoción"
    Y el grupo "Promoción" tiene 3 nadadores
    Y el grupo "Promoción" incluye a "Martina Suárez"
    Y el grupo "Promoción" está a cargo de "Marta Valdés"

  Escenario: Crear un grupo de entrenamiento y asignarle un nadador
    Cuando abro el módulo "Grupos"
    Y creo el grupo con los datos:
      | Nombre     | Tiburones   |
      | Categoría  | Junior      |
      | Entrenador | Ana Pruebas |
    Entonces veo el grupo "Tiburones"
    Cuando abro el módulo "Nadadores"
    Y abro la ficha de "Paula González"
    Y edito al nadador con los datos:
      | Grupo | Tiburones |
    Y abro el módulo "Grupos"
    Entonces el grupo "Tiburones" incluye a "Paula González"
    Y el grupo "Tiburones" tiene 1 nadador

  Escenario: Editar un grupo de entrenamiento
    Cuando abro el módulo "Grupos"
    Y edito el grupo "Promoción" con los datos:
      | Entrenador | Lucas Nuevo |
    Entonces el grupo "Promoción" está a cargo de "Lucas Nuevo"

  Escenario: Eliminar un grupo deja a sus nadadores sin grupo
    Cuando abro el módulo "Grupos"
    Y elimino el grupo "Absoluto-Master" y lo confirmo
    Entonces no veo el grupo "Absoluto-Master"
    Y "Javier Álvarez" figura entre los nadadores sin grupo
