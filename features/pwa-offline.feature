# language: es
@pwa
Característica: PWA, caché local y funcionamiento sin conexión
  Como entrenador quiero instalar la aplicación y seguir trabajando aunque
  la piscina no tenga cobertura, sin perder los datos

  Antecedentes:
    Dado un club con datos de demostración

  @smoke
  Escenario: La aplicación es instalable
    Entonces el manifiesto de la aplicación es válido
    Y todos los iconos del manifiesto se pueden descargar
    Y el service worker está activo

  @smoke
  Escenario: El club arranca con datos de demostración
    Cuando abro el módulo "Nadadores"
    Entonces los datos de ejemplo del club están cargados

  Escenario: Los datos persisten al recargar la aplicación
    Dado que estoy en el módulo "Nadadores"
    Cuando doy de alta al nadador con los datos:
      | Nombre    | Persistente |
      | Apellidos | Recarga     |
    Y recargo la aplicación
    Y abro el módulo "Nadadores"
    Entonces el listado de nadadores incluye a "Persistente Recarga"

  Escenario: Las sesiones y la asistencia se conservan al recargar
    Dado que he creado la sesión "Sesión persistente" para el grupo "Promoción"
    Cuando recargo la aplicación
    Y abro el módulo "Entrenamientos"
    Entonces la sesión "Sesión persistente" aparece en el calendario semanal

  Escenario: Sin conexión la aplicación sigue funcionando con sus datos
    Cuando me quedo sin conexión
    Entonces la aplicación sigue disponible con sus datos

  Escenario: Los datos viven en el fichero del club dentro de la carpeta cnl de Drive
    Dado que estoy en el módulo "Nadadores"
    Cuando doy de alta al nadador con los datos:
      | Nombre    | Compartido |
      | Apellidos | En Drive   |
    Entonces el fichero del club en Drive contiene al nadador "Compartido"

  Escenario: Los cambios hechos sin conexión se suben a Drive al volver la red
    Dado que estoy en el módulo "Nadadores"
    Cuando me quedo sin conexión
    Y doy de alta al nadador con los datos:
      | Nombre    | Sin red   |
      | Apellidos | Pendiente |
    Entonces el indicador de sincronización muestra "Sin conexión"
    Y el fichero del club en Drive no contiene al nadador "Sin red"
    Cuando recupero la conexión
    Entonces el fichero del club en Drive contiene al nadador "Sin red"

  @navegacion
  Escenario: Sin conexión se muestra un aviso bajo la cabecera que desaparece al volver la red
    Cuando me quedo sin conexión
    Entonces veo el banner de sin conexión
    Cuando recupero la conexión
    Entonces el banner de sin conexión desaparece
