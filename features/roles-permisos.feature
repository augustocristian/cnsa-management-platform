# language: es
@roles
Característica: Roles y permisos
  Como club quiero que cada persona vea y haga sólo lo que su rol permite:
  el entrenador/administrador gestiona según permisos y el nadador sólo ve su espacio personal

  Antecedentes:
    Dado un club en modo local con datos de demostración

  @smoke
  Esquema del escenario: El menú depende del rol
    Cuando cambio al rol "<rol>"
    Entonces el menú <acceso> el módulo "<modulo>"

    Ejemplos: Administrador
      | rol           | modulo         | acceso  |
      | Administrador | Inicio         | muestra |
      | Administrador | Nadadores      | muestra |
      | Administrador | Grupos         | muestra |
      | Administrador | Entrenamientos | muestra |
      | Administrador | Asistencia     | muestra |
      | Administrador | Cargas         | muestra |
      | Administrador | Marcas         | muestra |
      | Administrador | Bañador        | muestra |
      | Administrador | Comunicaciones | muestra |
      | Administrador | Configuración  | muestra |
      | Administrador | Mi espacio     | oculta  |

    Ejemplos: Entrenador
      | rol        | modulo         | acceso  |
      | Entrenador | Inicio         | muestra |
      | Entrenador | Nadadores      | muestra |
      | Entrenador | Grupos         | muestra |
      | Entrenador | Entrenamientos | muestra |
      | Entrenador | Asistencia     | muestra |
      | Entrenador | Cargas         | muestra |
      | Entrenador | Marcas         | muestra |
      | Entrenador | Bañador        | muestra |
      | Entrenador | Comunicaciones | muestra |
      | Entrenador | Configuración  | oculta  |
      | Entrenador | Mi espacio     | oculta  |

    Ejemplos: Nadador
      | rol     | modulo         | acceso  |
      | Nadador | Mi espacio     | muestra |
      | Nadador | Comunicaciones | muestra |
      | Nadador | Inicio         | oculta  |
      | Nadador | Nadadores      | oculta  |
      | Nadador | Grupos         | oculta  |
      | Nadador | Entrenamientos | oculta  |
      | Nadador | Asistencia     | oculta  |
      | Nadador | Cargas         | oculta  |
      | Nadador | Marcas         | oculta  |
      | Nadador | Bañador        | oculta  |
      | Nadador | Configuración  | oculta  |

  Esquema del escenario: Un rol sin permiso no puede entrar escribiendo la dirección de un módulo
    Dado que entro como "<rol>"
    Cuando intento abrir directamente el módulo "<modulo>"
    Entonces estoy en el módulo "<destino>"

    Ejemplos:
      | rol        | modulo         | destino    |
      | Nadador    | Nadadores      | Mi espacio |
      | Nadador    | Cargas         | Mi espacio |
      | Nadador    | Configuración  | Mi espacio |
      | Entrenador | Configuración  | Inicio     |

  Escenario: El nadador aterriza en su espacio personal
    Cuando cambio al rol "Nadador"
    Entonces estoy en el módulo "Mi espacio"

  Escenario: El espacio personal del nadador reúne lo que el club habilita
    Dado que entro como "Nadador"
    Cuando elijo previsualizar el espacio de "Carla Menéndez Vigil"
    Entonces mi espacio muestra las secciones:
      | Mis próximos entrenamientos |
      | Mi asistencia               |
      | Mis marcas                  |
      | Mis cargas                  |
      | Comunicaciones              |

  Esquema del escenario: El nadador sólo ve los avisos generales y los de su grupo
    Dado que he publicado el aviso "Aviso general" para "Todo el club"
    Y que he publicado el aviso "Aviso de promoción" para "Promoción"
    Y que entro como "Nadador"
    Y abro el módulo "Mi espacio"
    Cuando elijo previsualizar el espacio de "<nadador>"
    Entonces en mi espacio veo el aviso "Aviso general"
    Y en mi espacio <ve> el aviso "Aviso de promoción"

    Ejemplos:
      | nadador                | ve    |
      | Lucía Fernández Roces  | veo   |
      | Carla Menéndez Vigil   | no veo |

  Escenario: El nadador no puede publicar avisos
    Dado que entro como "Nadador"
    Cuando abro el módulo "Comunicaciones"
    Entonces no puedo publicar avisos

  Escenario: El administrador da de alta a un usuario con rol de entrenador
    Dado que estoy en el módulo "Configuración"
    Cuando añado el usuario con:
      | Email  | nuevo.entrenador@ejemplo.com |
      | Nombre | Nuevo Entrenador             |
      | Rol    | Entrenador                   |
    Entonces la lista de usuarios incluye a "nuevo.entrenador@ejemplo.com" con rol "Entrenador"

  Escenario: El administrador vincula un usuario nadador con su ficha
    Dado que estoy en el módulo "Configuración"
    Cuando añado el usuario con:
      | Email             | lucia@ejemplo.com     |
      | Rol               | Nadador               |
      | Nadador vinculado | Lucía Fernández Roces |
    Entonces la lista de usuarios incluye a "lucia@ejemplo.com" con rol "Nadador"

  @google @pendiente
  Esquema del escenario: Un usuario sólo accede a los clubes que tiene autorizados
    Dado que inicio sesión con Google como "<usuario>"
    Entonces el selector de clubes ofrece únicamente "<clubes>"

    Ejemplos:
      | usuario            | clubes                  |
      | ana@ejemplo.com    | Club Lugones            |
      | luis@ejemplo.com   | Club Gijón              |
      | marta@ejemplo.com  | Club Lugones, Club Gijón |

  @google @pendiente
  Escenario: Los datos de un club están aislados de los de otro
    Dado que la entrenadora "ana@ejemplo.com" ha dado de alta al nadador "Solo Lugones" en "Club Lugones"
    Cuando "luis@ejemplo.com" abre el módulo "Nadadores" del "Club Gijón"
    Entonces no ve al nadador "Solo Lugones"
