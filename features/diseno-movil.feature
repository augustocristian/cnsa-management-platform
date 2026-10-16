# language: es
@diseno
Característica: Diseño móvil primero
  Como entrenador que trabaja desde la piscina quiero una aplicación sencilla,
  coherente y adaptada a móvil, tableta y escritorio

  Antecedentes:
    Dado un club con datos de demostración

  @smoke @navegacion
  Esquema del escenario: Todos los módulos son accesibles desde el menú sin errores
    Cuando pulso "<modulo>" en el menú
    Entonces la pantalla "<modulo>" se muestra completa y sin errores

    Ejemplos:
      | modulo         |
      | Inicio         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Bañador        |
      | Avisos y notas |
      | Configuración  |

  @movil
  Esquema del escenario: Ninguna pantalla se desborda horizontalmente en un móvil
    Dado que uso un móvil de 375 px de ancho
    Entonces la pantalla "<modulo>" no tiene desplazamiento horizontal

    Ejemplos:
      | modulo         |
      | Inicio         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |

  Esquema del escenario: La aplicación se adapta a móvil, tableta y escritorio
    Dado que uso un dispositivo de <ancho> px de ancho
    Entonces la pantalla "<modulo>" no tiene desplazamiento horizontal

    Ejemplos:
      | ancho | modulo         |
      | 375   | Inicio         |
      | 375   | Marcas         |
      | 768   | Inicio         |
      | 768   | Nadadores      |
      | 768   | Cargas         |
      | 1280  | Inicio         |
      | 1280  | Entrenamientos |
      | 1280  | Marcas         |

  Esquema del escenario: El menú se coloca según el tamaño de pantalla
    Dado que uso un dispositivo de <ancho> px de ancho
    Entonces el menú de navegación está <posicion>

    Ejemplos:
      | ancho | posicion |
      | 375   | abajo    |
      | 768   | abajo    |

  @escritorio
  Escenario: En escritorio el menú es lateral
    Dado que uso un dispositivo de 1280 px de ancho
    Entonces el menú de navegación está lateral

  @movil
  Escenario: Las opciones del menú se pueden pulsar con el pulgar
    Dado que uso un móvil de 375 px de ancho
    Entonces las opciones del menú miden al menos 44 px de alto

  @movil
  Escenario: Pasar lista desde el móvil con un solo toque por nadador
    Dado que uso un móvil de 375 px de ancho
    Y que he creado la sesión "Lista móvil" para el grupo "Promoción"
    Cuando abro el módulo "Asistencia"
    Y selecciono la sesión "Lista móvil" para pasar lista
    Y marco como presente a "Martina Suárez"
    Entonces el recuento de asistencia muestra "Presentes: 1"

  Escenario: Los formularios son fáciles de rellenar porque todos sus campos tienen etiqueta
    Dado que estoy en el módulo "Nadadores"
    Cuando pulso "Nuevo nadador"
    Entonces todos los campos del formulario abierto tienen etiqueta

  Esquema del escenario: Los formularios de registro rápido tienen todos sus campos etiquetados
    Dado que estoy en el módulo "<modulo>"
    Entonces todos los campos de registro de la pantalla tienen etiqueta

    Ejemplos:
      | modulo         |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |

  Esquema del escenario: Cada pantalla tiene un título claro y coherente
    Entonces la pantalla "<modulo>" tiene un título

    Ejemplos:
      | modulo         |
      | Nadadores      |
      | Grupos         |
      | Entrenamientos |
      | Asistencia     |
      | Cargas         |
      | Marcas         |
      | Avisos y notas |

  Escenario: La aplicación declara una vista adaptable a móviles
    Entonces la aplicación declara una vista adaptable a móviles

  @i18n
  Esquema del escenario: El idioma se puede cambiar desde la cabecera
    Cuando cambio el idioma a "<idioma>"
    Entonces el menú muestra "<texto>" para el módulo "Nadadores"
    Y el idioma del documento es "<codigo>"

    Ejemplos:
      | idioma  | texto     | codigo |
      | English | Swimmers  | en     |
      | Italiano| Nuotatori | it     |
      | Español | Nadadores | es     |
