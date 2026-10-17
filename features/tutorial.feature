# language: es
@tutorial
Característica: Tutorial de configuración de Google
  Como quien publica la aplicación quiero una guía de 6 pasos para configurar Google una sola vez;
  el resto de personas solo conecta su Google Drive

  Antecedentes:
    Dado que la aplicación está abierta sin Client ID de Google
    Y pulso "Abrir el tutorial (5 minutos)"

  @smoke
  Escenario: El tutorial tiene 6 pasos con controles táctiles
    Entonces veo el encabezado "Configurar Google en 5 minutos"
    Y veo 6 pasos numerados de al menos 44 píxeles
    Y el tutorial no inyecta estilos en la página

  Escenario: Los valores a copiar tienen botones accesibles
    Cuando pulso "Paso 4 de 6"
    Entonces cada botón Copiar dice qué valor copia

  Escenario: El último paso explica el uso individual y la demo
    Cuando pulso "Paso 6 de 6"
    Entonces veo el texto "Probar la demo"
    Y veo el texto "uso individual"
    Y la página no se desborda horizontalmente
