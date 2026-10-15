// Generación del PDF de entreno (A4 apaisado) con jsPDF + jspdf-autotable. Las librerías se cargan de forma
// diferida (vendor/) sólo la primera vez que se pide un PDF. Sin DOM propio: recibe fichas ya calculadas
// (ver entrenoService.ficha) y devuelve el PDF; los textos salen del idioma activo (i18n) salvo que se inyecte `t`.
import { t as tActual, locale as localeActual } from '../i18n.js';

const MM_PAGINA = { w: 297, h: 210 };
const MARGEN = 8;
const ALTO_CABECERA = 27;
const ALTO_PIE = 9;
const TAMANOS = [11, 10, 9, 8];

// ---------- Carga diferida de librerías ----------
let promesa = null;
let override = null;

// Para pruebas: inyecta { jsPDF, autoTable(doc, opciones) } y evita la carga de scripts.
export function usarLibreria(lib) { override = lib; promesa = null; }

function cargarScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => ko(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

const libGlobal = () => {
  const g = globalThis.jspdf;
  if (!g || !g.jsPDF || !g.jsPDF.API || !g.jsPDF.API.autoTable) return null;
  return { jsPDF: g.jsPDF, autoTable: (doc, o) => doc.autoTable(o) };
};

export function cargarLibreria() {
  if (override) return Promise.resolve(override);
  const ya = libGlobal();
  if (ya) return Promise.resolve(ya);
  promesa ||= (async () => {
    await cargarScript(new URL('../../vendor/jspdf.umd.min.js', import.meta.url).href);
    await cargarScript(new URL('../../vendor/jspdf.plugin.autotable.min.js', import.meta.url).href);
    const lib = libGlobal();
    if (!lib) throw new Error('jsPDF no disponible');
    return lib;
  })().catch((e) => { promesa = null; throw e; });
  return promesa;
}

// ---------- Utilidades de color y texto ----------
function parseHex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const mezcla = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const luminancia = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const textoSobre = (fondo) => (luminancia(fondo) > 0.45 ? [25, 30, 40] : [255, 255, 255]);

// Las fuentes estándar de PDF sólo cubren Latin-1 (+ algunos signos de WinAnsi): el resto se sustituye.
const EXTRA = new Set('–—‘’“”•€…'.split(''));
export function limpiar(s) {
  return String(s ?? '').replace(/\r/g, '').replace(/[^\n\x20-\x7e\xa0-\xff]/gu, (c) => (EXTRA.has(c) ? c : '?'));
}

function paleta(club) {
  const p = parseHex(club && club.colorPrimario) || [26, 115, 232];
  const s = parseHex(club && club.colorSecundario) || [11, 61, 145];
  const claro = mezcla(p, [255, 255, 255], 0.88);
  return {
    primario: p, secundario: s, claro,
    textoPrimario: textoSobre(p), textoSecundario: textoSobre(s),
    tenue: mezcla(p, [255, 255, 255], 0.8), // etiquetas sobre la banda
    linea: [190, 197, 208], gruesa: mezcla(s, [0, 0, 0], 0.15), zebra: [247, 249, 252], texto: [30, 36, 48], gris: [100, 108, 120],
  };
}

function fechaDe(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

// ---------- Etiquetas ----------
function etiquetas(t) {
  const k = (c) => t('entreno.pdf.' + c);
  return {
    dia: k('dia'), fecha: k('fecha'), hora: k('hora'), grupo: k('grupo'), tipo: k('tipo-sesion'), piscina: k('piscina'),
    materialDia: k('material-dia'), notasGenerales: k('notas-generales'),
    cols: ['tiempo', 'objetivo', 'bloques', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'dist-set', 'material', 'notas'].map(k),
    totales: k('totales'), sinPlan: k('sin-plan'), sets: (n) => t('entreno.pdf.n-sets', { n }), filas: (n) => t('entreno.pdf.n-filas', { n }),
  };
}

const nf = (n) => (Number.isFinite(n) && n !== 0 ? String(Math.round(n * 100) / 100) : '');

// ---------- Dibujo ----------
function dibujarCabecera(doc, ficha, c, L, loc) {
  const { sesion, club } = ficha;
  const W = MM_PAGINA.w;
  const x0 = MARGEN, y0 = MARGEN, w = W - 2 * MARGEN;
  doc.setFillColor(...c.primario);
  doc.roundedRect(x0, y0, w, ALTO_CABECERA, 2, 2, 'F');
  let x = x0 + 4;
  // Logo del club (si existe y es PNG/JPEG)
  const logo = club && club.logo;
  if (logo && /^data:image\/(png|jpe?g);base64,/i.test(logo)) {
    try {
      const props = doc.getImageProperties(logo);
      const caja = 19;
      const k = Math.min(caja / props.width, caja / props.height);
      const iw = props.width * k, ih = props.height * k;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y0 + 3.5, caja + 2, caja + 2, 1.5, 1.5, 'F');
      doc.addImage(logo, /png/i.test(logo.slice(0, 20)) ? 'PNG' : 'JPEG', x + 1 + (caja - iw) / 2, y0 + 4.5 + (caja - ih) / 2, iw, ih);
      x += caja + 6;
    } catch (e) { /* logo ilegible: se omite */ }
  }
  const f = fechaDe(sesion.fecha);
  const dia = f ? new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(f).toLocaleUpperCase(loc) : '';
  const fechaTxt = f ? new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(f) : '';
  doc.setTextColor(...c.textoPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...(luminancia(c.primario) > 0.45 ? mezcla(c.primario, [0, 0, 0], 0.55) : c.tenue));
  doc.text(limpiar(String(L.dia).toLocaleUpperCase(loc)), x, y0 + 7);
  doc.setTextColor(...c.textoPrimario);
  doc.setFontSize(21);
  doc.text(limpiar(dia), x, y0 + 15.5);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(limpiar(fechaTxt), x, y0 + 21.5);
  x += 50;

  // Celdas de datos
  const derecha = x0 + w - 4;
  const fijas = [
    [L.hora, sesion.hora, 16], [L.grupo, sesion.grupo, 38], [L.tipo, sesion.tipoSesion, 30],
    [L.piscina, sesion.piscina, 18], [L.materialDia, sesion.materialDia, 36],
  ];
  const resto = derecha - x - fijas.reduce((a, [, , ww]) => a + ww, 0);
  const celdas = fijas.concat([[L.notasGenerales, sesion.notasGenerales, Math.max(30, resto)]]);
  celdas.forEach(([etq, val, ww]) => {
    doc.setDrawColor(...mezcla(c.primario, c.textoPrimario, 0.35));
    doc.setLineWidth(0.2);
    doc.line(x, y0 + 4, x, y0 + ALTO_CABECERA - 4);
    const tx = x + 2.5, tw = ww - 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...(luminancia(c.primario) > 0.45 ? mezcla(c.primario, [0, 0, 0], 0.55) : c.tenue));
    doc.text(limpiar(String(etq).toLocaleUpperCase(loc)), tx, y0 + 7);
    doc.setTextColor(...c.textoPrimario);
    const txt = limpiar(val);
    let fs = 11;
    let lineas = [];
    for (; fs >= 7; fs -= 1) {
      doc.setFontSize(fs);
      lineas = doc.splitTextToSize(txt, tw);
      if (lineas.length * fs * 0.3528 * 1.15 <= ALTO_CABECERA - 12) break;
    }
    doc.text(lineas.slice(0, 3), tx, y0 + 12.5 + (fs * 0.3528) * 0.6, { lineHeightFactor: 1.15 });
    x += ww;
  });
}

function dibujarPies(doc, ficha, c, ahoraTxt, paginasTotal, t) {
  const club = ficha.club || {};
  const W = MM_PAGINA.w, H = MM_PAGINA.h;
  doc.setDrawColor(...c.linea);
  doc.setLineWidth(0.2);
  doc.line(MARGEN, H - MARGEN - 5.5, W - MARGEN, H - MARGEN - 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...c.gris);
  const izq = `${club.nombre || ''}${club.nombre ? '  ·  ' : ''}${t('entreno.pdf.generado', { fecha: ahoraTxt })}`;
  doc.text(limpiar(izq), MARGEN, H - MARGEN - 1.5);
  doc.text(limpiar(t('entreno.pdf.pagina', { n: ficha._pagina, total: paginasTotal })), W - MARGEN, H - MARGEN - 1.5, { align: 'right' });
}

// Dibuja una sesión (puede ocupar varias páginas). Devuelve las páginas usadas (números de página del documento).
function dibujarSesion(doc, lib, ficha, c, L, loc, tam, paginas) {
  const topTabla = MARGEN + ALTO_CABECERA + (ficha.sesion.titulo ? 9 : 4);
  const margen = { left: MARGEN, right: MARGEN, top: topTabla, bottom: MARGEN + ALTO_PIE };
  const marcarPagina = () => { const n = doc.getCurrentPageInfo().pageNumber; if (!paginas.has(n)) paginas.set(n, ficha); };
  const cabeceraYTitulo = () => {
    marcarPagina();
    dibujarCabecera(doc, ficha, c, L, loc);
    if (ficha.sesion.titulo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...c.texto);
      doc.text(limpiar(ficha.sesion.titulo), MARGEN, MARGEN + ALTO_CABECERA + 5.8);
    }
  };

  if (!ficha.sets.length) {
    cabeceraYTitulo();
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...c.gris);
    doc.text(limpiar(L.sinPlan), MARGEN, topTabla + 6);
    if (ficha.sesion.descripcion) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...c.texto);
      doc.text(doc.splitTextToSize(limpiar(ficha.sesion.descripcion), MM_PAGINA.w - 2 * MARGEN), MARGEN, topTabla + 14);
    }
    return;
  }

  // Cuerpo: una fila por línea; Dist. Set en la última fila de cada set; marca de fin de set.
  const body = [];
  ficha.sets.forEach((s, si) => {
    s.lineas.forEach((l, i) => {
      const fin = i === s.lineas.length - 1;
      body.push({
        meta: { fin, set: si },
        celdas: [
          nf(Number(l.tiempoMin)) || (String(l.tiempoMin) && !Number.isFinite(Number(l.tiempoMin)) ? String(l.tiempoMin) : ''),
          limpiar(l.objetivo), limpiar(l.bloque), l.series === '' ? '' : limpiar(String(l.series)), l.distancia === '' ? '' : limpiar(String(l.distancia)),
          limpiar(l.salida), limpiar(l.ejercicio),
          nf(l.distBloque),
          fin ? nf(s.distSet) : '',
          limpiar(l.material), limpiar(l.notas),
        ],
      });
    });
  });
  const tot = ficha.totales;
  const centro = { halign: 'center' };
  const foot = [[
    { content: limpiar(L.totales.toLocaleUpperCase(loc)), styles: { halign: 'left' } },
    { content: nf(tot.tiempoMin) || '0', styles: centro },
    { content: '', colSpan: 4 },
    { content: limpiar(`${L.sets(tot.sets)}  ·  ${L.filas(tot.filas)}`), styles: { fontStyle: 'normal', fontSize: Math.max(7, tam - 2), textColor: c.gris } },
    { content: nf(tot.metros) || '0', styles: centro },
    { content: nf(tot.metros) || '0', styles: centro },
    { content: '', colSpan: 2 },
  ]];

  const anchos = [21, 33, 24, 15, 22, 20, 0, 18, 17, 23, 0]; // ejercicio y notas se reparten el resto
  const util = MM_PAGINA.w - 2 * MARGEN;
  const fijo = anchos.reduce((a, b) => a + b, 0);
  const libre = util - fijo;
  anchos[6] = Math.round(libre * 0.58 * 10) / 10;
  anchos[10] = Math.round((libre - anchos[6]) * 10) / 10;
  const columnStyles = {};
  anchos.forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
  [0, 3, 4, 5, 7, 8].forEach((i) => { columnStyles[i].halign = 'center'; });
  columnStyles[8].fontStyle = 'bold';

  const gruesas = new Map(); // página -> [y]
  const cajas = new Map(); // página -> {y0, y1}
  lib.autoTable(doc, {
    startY: topTabla,
    margin: margen,
    theme: 'grid',
    head: [L.cols.map((x) => limpiar(x.toLocaleUpperCase(loc)))],
    body: body.map((r) => r.celdas),
    foot,
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    columnStyles,
    styles: { font: 'helvetica', fontSize: tam, cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, lineColor: c.linea, lineWidth: 0.15, valign: 'middle', textColor: c.texto, overflow: 'linebreak' },
    headStyles: { fillColor: c.secundario, textColor: c.textoSecundario, fontStyle: 'bold', fontSize: Math.max(7, tam - 2.5), halign: 'center', lineColor: c.secundario },
    footStyles: { fillColor: c.claro, textColor: c.texto, fontStyle: 'bold', fontSize: tam - 0.5, lineColor: c.gruesa },
    didParseCell(d) {
      if (d.section !== 'body') return;
      const meta = body[d.row.index].meta;
      if (meta.set % 2 === 1) d.cell.styles.fillColor = c.zebra; // alterna el fondo por set
      if (d.column.index === 8 && meta.fin) d.cell.styles.fillColor = c.claro;
    },
    didDrawCell(d) {
      if (d.column.index !== 0) return;
      const n = doc.getCurrentPageInfo().pageNumber;
      const caja = cajas.get(n) || { y0: d.cell.y, y1: 0 };
      if (d.section === 'body' || d.section === 'foot') caja.y1 = Math.max(caja.y1, d.cell.y + d.cell.height);
      caja.y0 = Math.min(caja.y0, d.cell.y);
      cajas.set(n, caja);
      if (d.section === 'body' && body[d.row.index].meta.fin) {
        const l = gruesas.get(n) || [];
        l.push(d.cell.y + d.cell.height);
        gruesas.set(n, l);
      }
    },
    didDrawPage() {
      const n = doc.getCurrentPageInfo().pageNumber;
      cabeceraYTitulo();
      const caja = cajas.get(n);
      doc.setDrawColor(...c.gruesa);
      if (caja) {
        doc.setLineWidth(0.6);
        (gruesas.get(n) || []).forEach((y) => doc.line(MARGEN, y, MM_PAGINA.w - MARGEN, y));
        doc.setLineWidth(0.7);
        doc.rect(MARGEN, caja.y0, MM_PAGINA.w - 2 * MARGEN, caja.y1 - caja.y0, 'S');
      }
    },
  });
}

// ---------- API ----------
// fichas: [ficha] (ver entrenoService.ficha). Una página (o más) por sesión.
// -> { blob, bytes, paginas, tamanoFuente }
export async function generarPdfEntreno(fichas, { t = tActual, locale = localeActual(), lib = null, ahora = new Date(), titulo = '' } = {}) {
  if (!fichas || !fichas.length) throw new Error('sin-fichas');
  const L0 = lib || (await cargarLibreria());
  const L = etiquetas(t);
  const club = fichas[0].club || {};
  const c = paleta(club);
  const loc = typeof locale === 'string' ? locale : 'es-ES';
  const ahoraTxt = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ahora);

  const nuevo = () => new L0.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  // Mayor tamaño de letra con el que cada sesión cabe en una página (mínimo el menor de TAMANOS)
  const tamanoPara = (f) => {
    for (const tam of TAMANOS) {
      const prueba = nuevo();
      dibujarSesion(prueba, L0, f, c, L, loc, tam, new Map());
      if (prueba.getNumberOfPages() === 1) return tam;
    }
    return TAMANOS[TAMANOS.length - 1];
  };

  const doc = nuevo();
  const paginas = new Map();
  fichas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    dibujarSesion(doc, L0, f, c, L, loc, tamanoPara(f), paginas);
  });
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    const f = paginas.get(n) || fichas[0];
    dibujarPies(doc, { ...f, _pagina: n }, c, ahoraTxt, total, t);
  }
  const f0 = fichas[0].sesion;
  try {
    doc.setProperties({
      title: limpiar(titulo || (fichas.length === 1 ? `${f0.grupo || ''} ${f0.fecha}`.trim() : t('entreno.pdf.semana'))),
      subject: t('entreno.pdf.titulo-doc'), author: limpiar(club.nombre || ''), creator: 'CNL Plataforma',
    });
    doc.setLanguage(loc);
  } catch (e) { /* ignorar */ }
  const bytes = doc.output('arraybuffer');
  return { blob: new Blob([bytes], { type: 'application/pdf' }), bytes, paginas: total };
}
