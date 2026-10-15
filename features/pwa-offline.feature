# language: es
@pwa
Característica: PWA, persistencia local y funcionamiento sin conexión
  Como entrenador quiero instalar la aplicación y seguir trabajando aunque
  la piscina no tenga cobertura, sin perder los datos

  Antecedentes:
    Dado un club en modo local con datos de demostración

  @smoke
  Escenario: La aplicación es instalable
    Entonces el manifiesto de la aplicación es válido
    Y todos los iconos del manifiesto se pueden descargar
    Y el service worker está activo

  @smoke
  Escenario: El modo local arranca con datos de demostración
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

  @google @pendiente
  Escenario: Con Google, los datos viven en una Google Sheet compartida
    # Requiere un Client ID de Google y una sesión real: no ejecutable en e2e.
    Dado que inicio sesión con Google
    Cuando doy de alta al nadador con los datos:
      | Nombre    | Compartido |
      | Apellidos | En la hoja |
    Entonces el nadador aparece en la pestaña "Nadadores" de la Google Sheet del club

  @google @pendiente
  Escenario: Otro entrenador ve los cambios de la hoja compartida
    Dado que dos entrenadores comparten la hoja de Google del club
    Cuando el primero registra una marca
    Entonces el segundo la ve tras la sincronización automática

  @google @pendiente
  Escenario: Los cambios hechos sin conexión se sincronizan al volver la red
    Dado que inicio sesión con Google
    Y me quedo sin conexión
    Cuando registro una carga con los datos:
      | Nadador | Lucía Fernández Roces |
      | Metros  | 1000                  |
    Y recupero la conexión
    Entonces la carga se guarda en la Google Sheet del club
