# language: es
@entreno @entreno-contenidos
Característica: Varios contenidos por ejercicio, reparto de metros, totales y porcentajes
  Como entrenador quiero poner más de un contenido en el mismo ejercicio (por ejemplo 75 m de aeróbico ligero y 25 m de sprint),
  repartir los metros a mano o automáticamente y ver cuántos metros y qué porcentaje de la sesión es de cada contenido y estilo

  Antecedentes:
    Dado un club de demostración con la sesión de Google iniciada
    Y que estoy en el módulo "Entrenamientos"
    Cuando creo la sesión de entrenamiento con los datos:
      | Título | Sesión contenidos |
      | Grupo  | Alevín            |
    Y abro el plan de la sesión "Sesión contenidos"

  @smoke
  Escenario: Añadir dos contenidos al mismo ejercicio y repartir los metros
    Cuando pongo "4" en "Series" de la fila 1 del set 1
    Y pongo "100" en "Distancia" de la fila 1 del set 1
    Y añado el contenido "Aeróbico ligero" a la fila 1 del set 1
    Y añado el contenido "Aláctico / Sprint" a la fila 1 del set 1
    Entonces el contenido "Aeróbico ligero" de la fila 1 del set 1 reparte "50 m/rep"
    Y el contenido "Aláctico / Sprint" de la fila 1 del set 1 reparte "50 m/rep"
    Cuando fijo "75" metros por repetición de "Aeróbico ligero" en la fila 1 del set 1
    Entonces el contenido "Aeróbico ligero" de la fila 1 del set 1 está en modo "Manual"
    Y el contenido "Aláctico / Sprint" de la fila 1 del set 1 está en modo "Auto"
    Y el contenido "Aláctico / Sprint" de la fila 1 del set 1 reparte "25 m/rep"
    Y el resumen de la sesión dice "Volumen total: 400 m (AeL 300 m · Sprint 100 m)"
    Y el contenido "Aeróbico ligero" pesa "300 m" y "75 %" en el resumen
    Y el contenido "Aláctico / Sprint" pesa "100 m" y "25 %" en el resumen

  Escenario: Autocompletar el reparto desde el texto del ejercicio
    Cuando pongo "4x100 Crol. 75 AeL-25 Tope" en "Ejercicio" de la fila 1 del set 1
    Y autocompleto desde el texto la fila 1 del set 1
    Entonces la fila 1 del set 1 tiene "4" en "Series"
    Y la fila 1 del set 1 tiene "100" en "Distancia"
    Y la distancia del bloque de la fila 1 del set 1 es "400"
    Y el contenido "Aeróbico ligero" de la fila 1 del set 1 reparte "75 m/rep"
    Y el contenido "Aláctico / Sprint" de la fila 1 del set 1 reparte "25 m/rep"
    Y el resumen de la sesión dice "Volumen total: 400 m (AeL 300 m · Sprint 100 m) · Por estilo: Crol 400 m"
    Y el estilo "Crol" suma "400 m" y "100 %" en el resumen

  Escenario: Avisar del resto sin asignar y asignarlo a un contenido
    Cuando pongo "2" en "Series" de la fila 1 del set 1
    Y pongo "100" en "Distancia" de la fila 1 del set 1
    Y añado el contenido "Piernas" a la fila 1 del set 1
    Y fijo "60" metros por repetición de "Piernas" en la fila 1 del set 1
    Entonces veo el resto sin asignar "Sin asignar: 40 m por repetición" en la fila 1 del set 1
    Y veo el aviso del plan "Reparto de contenidos incompleto"
    Cuando asigno el resto de la fila 1 del set 1 a "Técnica"
    Entonces el contenido "Técnica" de la fila 1 del set 1 reparte "40 m/rep"
    Y no hay resto sin asignar en la fila 1 del set 1
    Y el contenido "Piernas" pesa "120 m" y "60 %" en el resumen
    Y el contenido "Técnica" pesa "80 m" y "40 %" en el resumen

  Escenario: El reparto se guarda y se recupera al volver a abrir el plan
    Cuando pongo "4x100 Crol. 75 AeL-25 Tope" en "Ejercicio" de la fila 1 del set 1
    Y autocompleto desde el texto la fila 1 del set 1
    Y guardo el plan
    Y cierro el plan
    Y abro el plan de la sesión "Sesión contenidos"
    Entonces el contenido "Aeróbico ligero" de la fila 1 del set 1 reparte "75 m/rep"
    Y el resumen de la sesión dice "Volumen total: 400 m"

  Escenario: Copiar el resumen en texto
    Cuando pongo "4x100 Crol. 75 AeL-25 Tope" en "Ejercicio" de la fila 1 del set 1
    Y autocompleto desde el texto la fila 1 del set 1
    Y copio el resumen de la sesión
    Entonces el portapapeles contiene "Volumen total: 400 m (AeL 300 m · Sprint 100 m) · Por estilo: Crol 400 m"
    Y el portapapeles contiene "% por contenido: AeL 75 % · Sprint 25 %"

  Escenario: El resumen con contenidos aparece en el PDF descargado
    Cuando pongo "4x100 Crol. 75 AeL-25 Tope" en "Ejercicio" de la fila 1 del set 1
    Y autocompleto desde el texto la fila 1 del set 1
    Y genero el PDF del plan abierto
    Entonces el PDF es válido y tiene 1 página
    Y el PDF contiene "75 AeL + 25 Sprint"
    Y el PDF contiene "RESUMEN DE LA SESIÓN"
    Y el PDF contiene "Volumen total: 400 m"
    Y el PDF contiene "Aeróbico ligero"
    Y el PDF contiene "300 m"
    Y el PDF contiene "75 %"
    Y el PDF contiene "POR ESTILO"

  Escenario: Registrar las cargas desde el plan sin duplicarlas
    Cuando elijo la plantilla "Aeróbico"
    Y registro las cargas desde el plan
    Entonces veo el aviso "Cargas registradas"
    Cuando registro las cargas desde el plan
    Entonces veo el aviso "ya estaban registradas"
