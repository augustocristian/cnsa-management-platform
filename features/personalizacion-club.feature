# language: es
@club
Característica: Personalización por club
  Como entrenador quiero que la aplicación muestre el nombre, el logotipo
  y los colores de mi club

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en el módulo "Configuración"

  @smoke
  Escenario: Cambiar el nombre y el lema del club
    Cuando personalizo la identidad del club con:
      | Nombre | Club Natación Prueba |
      | Lema   | Siempre adelante     |
    Y guardo la identidad del club
    Entonces la cabecera muestra el nombre "Club Natación Prueba"
    Y la cabecera muestra el lema "Siempre adelante"
    Y el pie de página menciona "Club Natación Prueba"

  Escenario: Cambiar el color principal y el secundario
    Cuando personalizo la identidad del club con:
      | Color primario   | #e91e63 |
      | Color secundario | #00796b |
    Y guardo la identidad del club
    Entonces el color principal de la aplicación es "#e91e63"
    Y el color secundario de la aplicación es "#00796b"

  Escenario: Subir y quitar el logotipo
    Cuando subo el logotipo del club
    Y guardo la identidad del club
    Entonces la cabecera muestra el logotipo subido
    Cuando quito el logotipo del club
    Y guardo la identidad del club
    Entonces la cabecera muestra el logotipo por defecto

  Escenario: La identidad del club se conserva al recargar
    Cuando personalizo la identidad del club con:
      | Nombre         | Club Persistente |
      | Color primario | #6a1b9a          |
    Y guardo la identidad del club
    Y recargo la aplicación
    Entonces la cabecera muestra el nombre "Club Persistente"
    Y el color principal de la aplicación es "#6a1b9a"

  Escenario: La configuración explica dónde se guardan los datos
    Entonces la configuración explica que los datos están en la carpeta cnl de Drive
