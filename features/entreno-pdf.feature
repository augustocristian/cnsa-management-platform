# language: es
@entreno-pdf
Característica: Plan de entreno detallado y PDF de entreno
  Como entrenador quiero detallar cada sesión por sets (calentamiento, piernas, aeróbico, relevos, vuelta a la calma)
  y generar un PDF de una página para llevarlo a la piscina, de una sesión o de toda la semana

  Antecedentes:
    Dado un club de demostración con la sesión de Google iniciada
    Y que estoy en el módulo "Entrenamientos"

  @smoke
  Escenario: Descargar el PDF de una sesión desde la lista semanal
    Cuando genero el PDF de la próxima sesión del grupo "Alevín"
    Entonces se descarga el PDF de la sesión de referencia con el nombre "Alevin-AAAA-MM-DD-día.pdf"
    Y el PDF es válido y tiene 1 página
    Y el PDF contiene "TOTALES"
    Y el PDF contiene "Calentamiento"
    Y el PDF contiene "Vuelta a la calma"
    Y el PDF contiene "Club Natación Lugones"
    Y el PDF contiene "Página 1 de 1"

  Escenario: La próxima sesión trae un plan detallado agrupado por sets con totales
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Entonces el plan tiene al menos 4 sets
    Y el total del plan coincide con la suma de los sets
    Y la fila 1 del set 1 tiene "Calentamiento" en "Objetivo"

  Escenario: Los totales se actualizan en vivo al editar series y distancias
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y anoto el total actual del plan
    Y pongo "40" en "Series" de la fila 1 del set 1
    Y pongo "100" en "Distancia" de la fila 1 del set 1
    Entonces la distancia del bloque de la fila 1 del set 1 es "4000"
    Y el total del plan ha cambiado
    Y el total del plan coincide con la suma de los sets

  Escenario: Guardar el plan y recuperarlo al volver a abrirlo
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y pongo "Técnica E2E" en "Tipo de sesión" del plan
    Y pongo "Cuerda" en "Material" de la fila 1 del set 1
    Y guardo el plan
    Y cierro el plan
    Y abro el plan de la sesión de referencia
    Entonces el campo "Tipo de sesión" del plan vale "Técnica E2E"
    Y la fila 1 del set 1 tiene "Cuerda" en "Material"

  Escenario: Añadir un set con sus filas y verlo reflejado en el PDF
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y añado un set al plan
    Y pongo "Relevos E2E" en "Ejercicio" de la fila 1 del último set
    Y pongo "4" en "Series" de la fila 1 del último set
    Y pongo "25" en "Distancia" de la fila 1 del último set
    Y pongo "d/30\"" en "Salida" de la fila 1 del último set
    Entonces la distancia del bloque de la fila 1 del último set es "100"
    Y el último set suma "100 m"
    Cuando genero el PDF del plan abierto
    Entonces se descarga el PDF de la sesión de referencia con el nombre "Alevin-AAAA-MM-DD-día.pdf"
    Y el PDF contiene "Relevos E2E"
    Y el PDF contiene "d/30"

  Escenario: Duplicar un set y quitar una fila
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y anoto el total actual del plan
    Y duplico el set 1 del plan
    Entonces el plan tiene al menos 5 sets
    Y el total del plan ha cambiado
    Cuando anoto el total actual del plan
    Y quito la fila 1 del set 2
    Entonces el total del plan ha cambiado

  Escenario: Un valor no numérico se marca y no permite generar el PDF
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y pongo "cuatro" en "Series" de la fila 1 del set 1
    Entonces la fila 1 del set 1 marca error en "Series"
    Y veo el aviso del plan "deben ser un número entero"
    Cuando intento generar el PDF del plan abierto
    Entonces no se descarga ningún PDF
    Y veo el aviso "Corrige los valores marcados antes de generar el PDF"

  Escenario: La salida se normaliza al formato C/1'10"
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y pongo "1:10" en "Salida" de la fila 1 del set 1
    Y salgo del campo "Salida" de la fila 1 del set 1
    Entonces la fila 1 del set 1 tiene "C/1'10\"" en "Salida"

  Escenario: Usar una plantilla de entreno en una sesión nueva
    Cuando creo la sesión de entrenamiento con los datos:
      | Título | Sesión con plantilla |
      | Grupo  | Alevín               |
    Y abro el plan de la sesión "Sesión con plantilla"
    Y elijo la plantilla "Velocidad"
    Entonces el plan tiene al menos 4 sets
    Cuando guardo el plan
    Y cierro el plan
    Entonces la sesión "Sesión con plantilla" muestra su resumen de metros y minutos

  Escenario: Copiar el plan de otra sesión
    Cuando creo la sesión de entrenamiento con los datos:
      | Título | Sesión copia |
      | Grupo  | Alevín       |
    Y abro el plan de la sesión "Sesión copia"
    Y copio el plan de la primera sesión disponible
    Entonces el plan tiene al menos 4 sets

  Escenario: Duplicar una sesión copia también su plan
    Cuando duplico la próxima sesión del grupo "Alevín"
    Entonces hay 2 sesiones iguales a la de referencia con resumen de plan

  Escenario: PDF de la semana con una página por sesión
    Cuando genero el PDF de la semana
    Entonces se descarga el PDF "Club-semana-{lunes}.pdf"
    Y el PDF tiene tantas páginas como sesiones se ven en la semana
    Y el PDF contiene "TOTALES"
    Y el PDF contiene "Página 1 de"

  Escenario: PDF de la semana filtrado por grupo
    Cuando filtro las sesiones por el grupo "Alevín"
    Y genero el PDF de la semana
    Entonces se descarga el PDF "Alevin-semana-{lunes}.pdf"
    Y el PDF tiene tantas páginas como sesiones se ven en la semana

  Escenario: Vista previa del PDF antes de descargarlo
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y abro la vista previa del PDF
    Entonces veo la vista previa del PDF
    Cuando cierro la vista previa
    Entonces no veo la vista previa del PDF

  Escenario: Imprimir el PDF del plan
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y pulso imprimir en el plan
    Entonces se prepara la impresión del PDF

  Escenario: Guardar el PDF en la carpeta cnl/entrenos de Drive
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y guardo el PDF en Drive
    Entonces veo el aviso "PDF guardado en Drive (cnl/entrenos)"
    Y Drive contiene el PDF de la sesión de referencia en la carpeta "cnl/entrenos"
    Cuando guardo el PDF en Drive
    Entonces veo el aviso "PDF actualizado en Drive"
    Y Drive contiene un solo PDF de la sesión de referencia

  Escenario: Los textos del PDF salen en el idioma activo
    Cuando cambio el idioma a "English"
    Y genero el PDF de la próxima sesión del grupo "Alevín"
    Entonces el PDF contiene "TOTALS"
    Y el PDF contiene "SESSION TYPE"
    Y el PDF contiene "Page 1 of 1"

  Escenario: Cerrar el plan con cambios sin guardar pide confirmación
    Cuando abro el plan de la próxima sesión del grupo "Alevín"
    Y pongo "Cambio temporal" en "Tipo de sesión" del plan
    Y cierro el plan
    Entonces veo el diálogo de confirmación "cambios sin guardar"
    Cuando cancelo el diálogo
    Entonces el plan sigue abierto
    Cuando cierro el plan y descarto los cambios
    Entonces el plan está cerrado
