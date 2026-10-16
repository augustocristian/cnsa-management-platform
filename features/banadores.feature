# language: es
@banadores
Característica: Catálogo de bañadores
  Como entrenador quiero mantener el catálogo de bañadores del club (de entrenamiento y técnicos de competición)
  para poder indicar con cuál se logró cada marca y filtrar los tiempos por tipo, marca y modelo

  Antecedentes:
    Dado un club con datos de demostración
    Y abro el catálogo de bañadores

  @smoke
  Escenario: El catálogo muestra los bañadores agrupados por tipo
    Entonces el grupo "Entrenamiento" del catálogo incluye "Speedo Endurance+"
    Y el grupo "Competición (bañadores técnicos)" del catálogo incluye "Arena Powerskin Carbon Core FX"
    Y el grupo "Competición (bañadores técnicos)" del catálogo incluye "Mizuno GX Sonic V"

  @smoke
  Escenario: Dar de alta un bañador técnico de competición
    Cuando guardo un bañador con los datos:
      | Tipo   | Bañador técnico (competición) |
      | Marca  | TYR                           |
      | Modelo | Venzo Genesis                 |
    Entonces veo el bañador "TYR Venzo Genesis" en el catálogo
    Y el grupo "Competición (bañadores técnicos)" del catálogo incluye "TYR Venzo Genesis"
    Y veo el aviso "creado"

  Escenario: Un bañador técnico exige marca y modelo
    Cuando guardo un bañador con los datos:
      | Tipo | Bañador técnico (competición) |
    Entonces veo el error "La marca es obligatoria en un bañador técnico." en el formulario de bañador
    Y veo el error "El modelo es obligatorio en un bañador técnico." en el formulario de bañador

  Escenario: No se repite el mismo bañador
    Cuando guardo un bañador con los datos:
      | Tipo   | Bañador técnico (competición) |
      | Marca  | arena                         |
      | Modelo | POWERSKIN carbon core fx      |
    Entonces veo el error "Ya existe un bañador de este tipo con la misma marca y modelo." en el formulario de bañador

  Escenario: Desactivar un bañador y deshacerlo
    Cuando desactivo el bañador "Arena Solid"
    Entonces el bañador "Arena Solid" figura como inactivo
    Cuando deshago el último aviso
    Entonces el bañador "Arena Solid" figura como activo

  @smoke
  Escenario: No se puede eliminar un bañador usado en marcas
    Cuando intento eliminar el bañador "Arena Powerskin Carbon Core FX"
    Entonces el diálogo de bañador en uso me ofrece desactivarlo o unirlo con otro
    Cuando pulso "Cancelar"
    Entonces veo el bañador "Arena Powerskin Carbon Core FX" en el catálogo

  Escenario: Un bañador sin marcas se elimina con opción de deshacer
    Cuando guardo un bañador con los datos:
      | Tipo   | Bañador de entrenamiento |
      | Marca  | Finis                    |
      | Modelo | Hydro                    |
    Y intento eliminar el bañador "Finis Hydro"
    Entonces no veo el bañador "Finis Hydro" en el catálogo
    Cuando deshago el último aviso
    Entonces veo el bañador "Finis Hydro" en el catálogo
