# language: es
@nadadores
Característica: Gestión de nadadores
  Como entrenador quiero dar de alta, consultar y editar a los nadadores del club
  y organizarlos por categorías y grupos de entrenamiento

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Nadadores"

  @smoke
  Escenario: Dar de alta a un nadador y verlo en el listado y en su ficha
    Cuando doy de alta al nadador con los datos:
      | Nombre    | Zacarías      |
      | Apellidos | Testeo Prueba |
      | Categoría | Alevín        |
      | Grupo     | Alevín        |
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

  Escenario: Cambiar a un nadador de categoría y de grupo
    Cuando abro la ficha de "Carla Menéndez"
    Y edito al nadador con los datos:
      | Categoría | Infantil        |
      | Grupo     | Infantil-Junior |
    Entonces la ficha muestra el valor "Infantil"
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
  Escenario: El filtro de categorías sigue el orden de menor a mayor edad
    Entonces el filtro de categorías ofrece, en este orden:
      | Prebenjamín |
      | Benjamín    |
      | Alevín      |
      | Infantil    |
      | Junior      |
      | Absoluto    |
      | Máster      |

  @categorias
  Esquema del escenario: Cada categoría ocupa su lugar en el orden oficial
    Entonces la categoría "<categoria>" ocupa la posición <posicion> en el filtro de categorías

    Ejemplos:
      | categoria   | posicion |
      | Prebenjamín | 1        |
      | Benjamín    | 2        |
      | Alevín      | 3        |
      | Infantil    | 4        |
      | Junior      | 5        |
      | Absoluto    | 6        |
      | Máster      | 7        |

  @categorias
  Esquema del escenario: El listado ordena a los nadadores por categoría
    Entonces en el listado los nadadores de "<anterior>" aparecen antes que los de "<siguiente>"

    Ejemplos:
      | anterior    | siguiente |
      | Prebenjamín | Benjamín  |
      | Benjamín    | Alevín    |
      | Alevín      | Infantil  |
      | Infantil    | Junior    |
      | Junior      | Absoluto  |
      | Absoluto    | Máster    |

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
    Y elimino el grupo "Absoluto-Máster" y lo confirmo
    Entonces no veo el grupo "Absoluto-Máster"
    Y "Javier Álvarez" figura entre los nadadores sin grupo
