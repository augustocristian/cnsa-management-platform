// Data integrity, backup, GDPR and sync error texts (dat. / gerr. prefixes). UI strings in Spanish.
export default {
  'gerr.timeout': 'Google no responde (tiempo agotado). Tus cambios siguen guardados en este dispositivo; se reintentará.',
  'gerr.cuota-drive': 'Tu Google Drive está lleno: libera espacio para poder guardar los cambios.',

  // Shell notices
  'dat.sesion-caducada': 'Sesión caducada: reconecta con Google para seguir guardando tus cambios en Drive.',
  'dat.reconectar': 'Reconectar',
  'dat.reconectado': 'Sesión renovada.',
  'dat.reconectar-error': 'No se pudo reconectar: {msg}',
  'dat.solo-lectura': 'Este club lo guardó una versión más nueva de la aplicación (versión {version}). Actualiza la app para poder editarlo; mientras tanto está en solo lectura.',
  'dat.recargar': 'Recargar la app',
  'dat.cache-llena': 'Sin espacio local: no cierres la pestaña hasta que los cambios se suban a Drive.',
  'dat.avisos-lectura': 'El fichero del club tenía {n} fila(s) con id repetido o sin id: se conservó la última de cada id y se descartaron las filas sin id.',
  'dat.entendido': 'Entendido',
  'dat.privacidad': 'Los datos de tus nadadores (incluidos menores) se guardan únicamente en tu Google Drive y en este dispositivo. Eres el responsable del tratamiento: obtén el consentimiento de las familias. Aquí no se envía nada a terceros.',

  // Error screen when the app cannot be displayed
  'dat.error-shell-titulo': 'No se pudo mostrar la aplicación',
  'dat.error-shell-texto': 'Ocurrió un error al abrir el club. Tus datos no se han modificado. Puedes reintentar o descargar una copia de seguridad.',
  'dat.reintentar': 'Reintentar',
  'dat.descargar-copia': 'Descargar copia',

  // Sign-out
  'dat.logout.titulo': 'Hay cambios sin subir a Drive',
  'dat.logout.texto': 'No se han podido subir los últimos cambios. Si cierras sesión se perderán de este dispositivo. Descarga una copia antes de salir.',
  'dat.logout.descargar': 'Descargar copia (.xlsx)',
  'dat.logout.descartar': 'Descartar y salir',
  'dat.logout.cancelar': 'Cancelar',
  'dat.logout.subiendo': 'Subiendo cambios…',

  // Damaged / emptied file
  'dat.danado.titulo': 'Fichero dañado',
  'dat.danado.texto': 'El fichero del club en Drive no se puede leer (no es un JSON válido). No se ha modificado nada. Elige cómo recuperarlo.',
  'dat.vacio.titulo': 'El fichero del club está vacío',
  'dat.vacio.texto': 'El fichero del club en Drive está vacío, pero antes tenía datos. No se trata como un club nuevo para no perderlos: elige cómo recuperarlo.',
  'dat.restaurar-local': 'Restaurar copia local',
  'dat.restaurar-backup': 'Restaurar último backup',
  'dat.abrir-drive': 'Abrir en Drive',
  'dat.empezar-vacio': 'Empezar con un club vacío',
  'dat.confirmar-local': 'Se sobrescribirá el fichero de Drive con los datos de este dispositivo. ¿Continuar?',
  'dat.confirmar-backup': 'Se sobrescribirá el fichero de Drive con la última copia de seguridad. ¿Continuar?',
  'dat.confirmar-vacio': 'Se sustituirá el contenido del fichero por un club vacío. ¿Continuar?',
  'dat.sin-local': 'No hay datos de este club en este dispositivo.',
  'dat.sin-backup': 'No hay copias de seguridad de este club en Drive.',

  // Excel import
  'dat.import.titulo': 'Importar desde Excel',
  'dat.import.texto': 'Se sustituirán los datos del club por los del fichero. Antes se guarda una copia en la carpeta cnl/backups de tu Drive.',
  'dat.import.hoja': 'Hoja',
  'dat.import.nuevas': 'En el fichero',
  'dat.import.actuales': 'Ahora',
  'dat.import.duplicados': '{n} id(s) repetidos: se conserva la última fila de cada uno.',
  'dat.import.invalidas': '{n} fila(s) con datos dudosos (fechas o números no válidos).',
  'dat.import.confirmar': 'Importar y sustituir',
  'dat.import.err-tamano': 'El fichero supera los 20 MB.',
  'dat.import.err-filas': 'El fichero tiene más de 50.000 filas.',
  'dat.import.err-copia': 'No se pudo guardar la copia previa; no se ha importado nada.',

  // Validation
  'dat.val.titulo': 'Revisa estos datos',
  'dat.val.fecha-invalida': 'fecha no válida',
  'dat.val.fecha-futura': 'la fecha de nacimiento es futura',
  'dat.val.edad-minima': 'la edad es demasiado baja',
  'dat.val.edad-maxima': 'la edad es demasiado alta',
  'dat.val.hora-invalida': 'hora no válida',
  'dat.val.numero-invalido': 'número no válido',
  'dat.val.fuera-de-rango': 'valor fuera de rango',

  // RGPD
  'dat.rgpd.titulo': 'Protección de datos (RGPD)',
  'dat.rgpd.texto': 'Los datos de tus nadadores (incluidos menores) se guardan únicamente en tu Google Drive y en este dispositivo; no se envía nada a terceros. Tú eres el responsable del tratamiento y debes obtener el consentimiento de las familias.',
  'dat.rgpd.derechos': 'Derechos de las personas (acceso, rectificación, supresión, portabilidad y oposición): desde la ficha de cada nadador puedes exportar todos sus datos y eliminarlo con todos sus datos.',
  'dat.rgpd.revisiones': 'Google Drive conserva versiones antiguas de los ficheros durante un tiempo, y los ficheros borrados quedan 30 días en la papelera. La app borra las versiones antiguas del fichero del club al eliminar un nadador; para comprobarlo o borrarlas a mano: Drive, clic derecho en el fichero, «Administrar versiones», y vacía la papelera.',
  'dat.nad.exportar': 'Exportar sus datos',
  'dat.nad.purgar': 'Eliminar nadador y todos sus datos',
  'dat.nad.purgar-confirmar': 'Se borrarán de forma definitiva la ficha de {nombre} y todos sus datos (asistencia, cargas, marcas y bañador), además de las copias .xlsx y las copias de seguridad de este club en Drive. No se puede deshacer.',
  'dat.nad.purgado': 'Datos de {nombre} eliminados ({n} filas).',
  'dat.nad.purgado-revisiones': 'Drive puede conservar versiones antiguas del fichero del club. Se han borrado {n}; revisa «Administrar versiones» y la papelera de Drive.',
  'dat.nad.purgado-pendiente': 'Los datos se han borrado en este dispositivo pero aún no se han podido subir a Drive: reconéctate y sincroniza.',
  'dat.notas.aviso': 'Evita datos de salud salvo que sea imprescindible.',
};
