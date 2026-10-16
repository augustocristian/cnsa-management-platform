// Builds the labels object that the PDF port receives: `PdfPort.generar(fichas, etiquetas)`.
// The PDF adapter (infrastructure/pdfEntreno.js) knows nothing about languages: everything it prints that is not data
// arrives here already translated. `t` (the translation function), `locale` and `ahora` (the clock) are injected.
//
// etiquetas = {
//   locale, ahora,
//   tituloSemana, tituloDoc,
//   dia, fecha, hora, grupo, tipo, piscina, materialDia, notasGenerales,
//   cols: [11 column headings], resumen, resTotal, resContenidos, resEstilos, sinContenido, sinEstilo, totales, sinPlan,
//   sets(n), filas(n), generado(fecha), pagina(n, total),
//   nombreContenido(item), nombreEstilo(estilo)
// }
import { claveEstilo } from '../domain/desglose.js';

const COLUMNAS = ['tiempo', 'objetivo', 'bloques', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'dist-set', 'material', 'notas'];

// opciones: { t, locale ('es-ES'), ahora (Date), nombreContenido?(item), nombreEstilo?(estilo) }
export function crearEtiquetasPdf({ t, locale = 'es-ES', ahora, nombreContenido = null, nombreEstilo = null }) {
  const k = (c) => t('entreno.pdf.' + c);
  const estiloPorDefecto = (e) => {
    if (!e) return k('sin-estilo');
    const clave = 'entreno.estilo.' + claveEstilo(e);
    const v = t(clave);
    return v && v !== clave ? v : e;
  };
  return {
    locale,
    ahora,
    tituloSemana: k('semana'),
    tituloDoc: k('titulo-doc'),
    dia: k('dia'), fecha: k('fecha'), hora: k('hora'), grupo: k('grupo'), tipo: k('tipo-sesion'), piscina: k('piscina'),
    materialDia: k('material-dia'), notasGenerales: k('notas-generales'),
    cols: COLUMNAS.map(k),
    resumen: k('resumen'), resTotal: k('res-total'), resContenidos: k('res-contenidos'), resEstilos: k('res-estilos'),
    sinContenido: k('sin-contenido'), sinEstilo: k('sin-estilo'), totales: k('totales'), sinPlan: k('sin-plan'),
    sets: (n) => t('entreno.pdf.n-sets', { n }),
    filas: (n) => t('entreno.pdf.n-filas', { n }),
    generado: (fecha) => t('entreno.pdf.generado', { fecha }),
    pagina: (n, total) => t('entreno.pdf.pagina', { n, total }),
    nombreContenido: nombreContenido || ((it) => it.contenido),
    nombreEstilo: nombreEstilo || estiloPorDefecto,
  };
}
