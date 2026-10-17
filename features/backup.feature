# language: es
@backup
Característica: Copia de seguridad completa
  Como entrenador quiero descargar una copia de todo mi club y poder restaurarla
  para no perder datos y poder volver atrás si me equivoco.

  Antecedentes:
    Dado un club con datos de demostración
    Y que estoy en la sección de copia de seguridad

  @smoke
  Escenario: Descargar una copia completa y comprobar su contenido
    Cuando descargo la copia de seguridad
    Entonces el fichero descargado es una copia de seguridad válida con 12 nadadores
    Y el nombre del fichero descargado empieza por "cnl-backup-"
    Y veo el texto "Copia descargada"

  Escenario: Modificar los datos, restaurar el archivo y recuperar todo
    Dado he descargado una copia de seguridad
    Cuando elimino todos los nadadores del club
    Y cambio el lema del club a "Lema temporal"
    Y elijo el archivo de la copia descargada para restaurar
    Entonces veo la vista previa con 12 nadadores nuevos
    Y el modo de restauración por defecto es "Reemplazar"
    Cuando intento confirmar la restauración escribiendo "no es el nombre"
    Entonces veo el texto "No coincide"
    Y el club tiene 0 nadadores
    Cuando pulso "Cancelar"
    Y confirmo la restauración escribiendo el nombre del club
    Entonces veo el resumen de la restauración
    Y el club tiene 12 nadadores
    Y el lema del club es "Pequeño gran club"
    Y hay una copia previa automática en la carpeta de copias de Drive

  Escenario: Un archivo alterado se rechaza y no cambia nada
    Dado he descargado una copia de seguridad
    Cuando elimino todos los nadadores del club
    Y elijo para restaurar la copia descargada pero alterada
    Entonces veo el texto "dañado o fue modificado"
    Y no veo el botón de restaurar de la copia
    Y el club tiene 0 nadadores

  Escenario: Un archivo que no es una copia se rechaza
    Cuando elijo para restaurar un archivo que no es una copia
    Entonces veo el texto "no es una copia de seguridad"
    Y no veo el botón de restaurar de la copia

  Escenario: Una copia cifrada necesita su contraseña
    Cuando descargo la copia de seguridad con la contraseña "una-clave-larga-1"
    Entonces el fichero descargado está cifrado y no contiene los nombres de los nadadores
    Cuando elijo el archivo de la copia descargada para restaurar
    Entonces se me pide la contraseña de la copia
    Y no veo el botón de restaurar de la copia
    Cuando escribo la contraseña "equivocada-123" para abrir la copia
    Entonces veo el texto "Contraseña incorrecta o archivo dañado"
    Cuando escribo la contraseña "una-clave-larga-1" para abrir la copia
    Entonces veo el botón de restaurar de la copia

  Escenario: Las copias de Drive se listan y se pueden restaurar
    Dado hay una copia diaria del club en la carpeta de copias de Drive
    Cuando actualizo la lista de copias en Drive
    Entonces la lista de copias en Drive tiene 1 copia
    Y la copia de Drive indica "12 nadadores"
    Cuando elimino todos los nadadores del club
    Y pulso Restaurar en la primera copia de Drive
    Entonces veo la vista previa con 12 nadadores nuevos
    Y veo el botón de restaurar de la copia
