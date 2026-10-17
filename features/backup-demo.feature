# language: es
@backup
Característica: Copia de seguridad en modo demostración
  Como persona que prueba la aplicación quiero poder descargar y restaurar copias
  aunque no haya conectado mi Drive.

  Escenario: En modo demostración se puede descargar y restaurar, pero las copias de Drive están desactivadas
    Dado que la aplicación está recién abierta sin sesión
    Cuando pulso "Probar la demo"
    Y abro el módulo "Configuración"
    Entonces las copias en Drive aparecen desactivadas con una explicación
    Cuando descargo la copia de seguridad
    Entonces el fichero descargado es una copia de seguridad válida con 12 nadadores
    Cuando elimino todos los nadadores del club
    Y elijo el archivo de la copia descargada para restaurar
    Entonces veo la vista previa con 12 nadadores nuevos
    Cuando confirmo la restauración escribiendo el nombre del club
    Entonces veo el resumen de la restauración
    Y el club tiene 12 nadadores
    Y veo el texto "solo mientras dure esta sesión"
