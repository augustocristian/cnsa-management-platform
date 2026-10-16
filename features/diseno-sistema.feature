# language: es
@diseno
Característica: Sistema de diseño
  Como entrenador quiero una aplicación accesible, con modo oscuro y avisos que me dejen deshacer
  para trabajar con seguridad desde el móvil, en la piscina o en el despacho

  Antecedentes:
    Dado un club con datos de demostración

  @smoke @accesibilidad
  Escenario: El enlace de salto lleva al contenido sin cambiar de ruta
    Cuando pulso Tab una vez desde el principio de la página
    Entonces el foco está en el enlace "Saltar al contenido"
    Y el enlace de salto es visible
    Cuando activo el enlace de salto con Intro
    Entonces el foco está en el contenido principal
    Y la ruta sigue siendo "#/inicio"

  @accesibilidad
  Escenario: El foco de teclado siempre se ve
    Cuando recorro con Tab los primeros 8 elementos interactivos
    Entonces cada elemento enfocado muestra un contorno visible de al menos 2 px

  @tema @smoke
  Escenario: El modo oscuro se aplica, se guarda y sobrevive a una recarga
    Cuando elijo el tema "Oscuro"
    Entonces la aplicación usa el modo oscuro
    Y las preferencias locales guardan el tema "dark"
    Y las preferencias del Drive acaban guardando el tema "dark"
    Cuando recargo la aplicación
    Entonces la aplicación usa el modo oscuro
    Y el selector de tema muestra "Oscuro"

  @tema
  Escenario: El modo oscuro se aplica antes del primer pintado
    Cuando elijo el tema "Oscuro"
    Y recargo la aplicación observando el orden de pintado
    Entonces el tema oscuro se aplicó antes de pintar la aplicación

  @tema
  Escenario: El tema automático sigue al sistema y el forzado lo ignora
    Dado que el sistema operativo prefiere el modo oscuro
    Cuando elijo el tema "Automático"
    Entonces la aplicación usa el modo oscuro
    Cuando elijo el tema "Claro"
    Entonces la aplicación usa el modo claro
    Cuando elijo el tema "Automático"
    Entonces la aplicación usa el modo oscuro

  @tema
  Escenario: El título de la pantalla, el nombre del club y el menú se leen en oscuro y en claro
    Cuando elijo el tema "Oscuro"
    Y abro el módulo "Nadadores"
    Entonces el título, el nombre del club y el menú tienen un contraste de al menos 4.5
    Cuando elijo el tema "Claro"
    Entonces el título, el nombre del club y el menú tienen un contraste de al menos 4.5

  @tema @escritorio
  Escenario: Un color de club muy claro sigue dejando el menú legible
    Dado que estoy en el módulo "Configuración"
    Cuando personalizo la identidad del club con:
      | Color primario | #ffd600 |
    Y guardo la identidad del club
    Y abro el módulo "Inicio"
    Entonces el color principal de la aplicación es "#ffd600"
    Y el texto sobre el color del club es "#111111"
    Y la opción activa del menú tiene un contraste de al menos 4.5

  @avisos
  Escenario: Un aviso con Deshacer permite revertir la acción
    Cuando se muestra el aviso "Nadador eliminado" con la acción Deshacer
    Entonces el aviso "Nadador eliminado" es accesible con role "status"
    Y el aviso tiene el botón "Deshacer"
    Cuando pulso el botón "Deshacer" del aviso
    Entonces la acción de deshacer se ejecutó una vez
    Y el aviso "Nadador eliminado" desaparece

  @avisos
  Escenario: Los avisos de error se anuncian como alerta y no desaparecen con el ratón encima
    Cuando se muestra un aviso de error "No se pudo guardar"
    Entonces el aviso "No se pudo guardar" es accesible con role "alert"
    Cuando paso el ratón sobre el aviso "No se pudo guardar"
    Y pasan 7 segundos
    Entonces el aviso "No se pudo guardar" sigue visible

  @hoja
  Escenario: Una hoja atrapa el foco, bloquea la página de fondo y devuelve el foco al cerrar
    Cuando abro una hoja de prueba desde el botón "Nuevo nadador"
    Entonces el foco está dentro de la hoja
    Y la página de fondo está inerte y sin scroll
    Cuando pulso Tab 12 veces
    Entonces el foco sigue dentro de la hoja
    Cuando pulso Escape
    Entonces la hoja se cierra
    Y el foco vuelve al botón "Nuevo nadador"
    Y la página de fondo vuelve a estar activa

  @hoja @movil
  Escenario: En el móvil la hoja sube desde abajo
    Dado que uso un móvil de 375 px de ancho
    Cuando abro una hoja de prueba desde el botón "Nuevo nadador"
    Entonces la hoja está anclada al borde inferior de la pantalla

  @hoja
  Escenario: Eliminar pide confirmación con el foco en Cancelar
    Cuando abro un diálogo de confirmación destructivo
    Entonces el foco está en el botón "Cancelar"
    Y el botón destructivo se llama "Eliminar"

