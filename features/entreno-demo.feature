# language: es
@entreno @entreno-demo
Característica: El plan de entreno en el modo demo
  Como persona que prueba la aplicación sin conectar Google Drive quiero poder preparar y descargar el PDF del entreno,
  y saber por qué guardarlo en Drive no está disponible

  Escenario: En el modo demo guardar en Drive está desactivado y se puede descargar el PDF
    Dado que la aplicación está recién abierta sin sesión
    Cuando pulso "Probar la demo"
    Y abro el módulo "Entrenamientos"
    Y abro el plan de la próxima sesión del grupo "Alevín"
    Entonces la opción "Guardar en Drive" del menú está desactivada y explica el motivo
    Cuando genero el PDF del plan abierto
    Entonces el PDF es válido y tiene 1 página
