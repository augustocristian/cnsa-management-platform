// Iconos SVG lineales (viewBox 24, trazo 1.75, currentColor), dibujados a mano. Sin dependencias.
const NS = 'http://www.w3.org/2000/svg';

export const ICONS = {
  inicio: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  nadadores: 'M16 11a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1M18 14a5 5 0 014 5v2',
  grupos: 'M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1a5 5 0 0110 0v1M14 15a5 5 0 017 4v1',
  calendario: 'M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 10h16M8 3v4M16 3v4',
  planificacion: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 9.5h18M3 14.5h18M6 12l2-1 2 1 2-1 2 1',
  entrenamientos: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  asistencia: 'M9 12l2 2 4-4M5 4h14a1 1 0 011 1v15a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z',
  cargas: 'M3 20h18M6 20V12M11 20V6M16 20v-9M21 20V9',
  marcas: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  banador: 'M7 3l-4 4 3 3 1-1v12h10V9l1 1 3-3-4-4a5 5 0 01-10 0z',
  comunicaciones: 'M4 5h16v11H9l-5 4V5z',
  ajustes: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2L10 21h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  'mi-espacio': 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  campana: 'M6 9a6 6 0 0112 0c0 5 2 6 2 7H4c0-1 2-2 2-7zM10 20a2 2 0 004 0',
  salir: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cerrar: 'M6 6l12 12M18 6L6 18',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  editar: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  borrar: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copiar: 'M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM16 9V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3',
  enlace: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  nube: 'M7 18a4 4 0 01-.6-7.95A6 6 0 0118 9.5 4.3 4.3 0 0117.5 18H7z',
  aviso: 'M12 4l9.5 16h-19L12 4zM12 10v4.5M12 17.5v.01',
  'flecha-izq': 'M19 12H5M11 6l-6 6 6 6',
  'flecha-arriba': 'M12 19V5M6 11l6-6 6 6',
  'flecha-abajo': 'M12 5v14M6 13l6 6 6-6',
  'flecha-dcha': 'M5 12h14M13 6l6 6-6 6',
  reloj: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  traje: 'M7 3l-4 4 3 3 1-1v12h10V9l1 1 3-3-4-4a5 5 0 01-10 0z', // swimsuit (catalogue); independent of the legacy `banador` nav icon
  trofeo: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  ayuda: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17v.01',
  estrella: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.9L12 3.5z',
  descargar: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  subir: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  refrescar: 'M20 11a8 8 0 00-14.5-3.5M4 4v4h4M4 13a8 8 0 0014.5 3.5M20 20v-4h-4',
  buscar: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  usuario: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.01',
  grafica: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  'fila-arriba': 'M12 19V5M6 11l6-6 6 6',
  'fila-abajo': 'M12 5v14M6 13l6 6 6-6',
  imprimir: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  ojo: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  documento: 'M6 3h8l4 4v14H6V3zM14 3v4h4M9 13h6M9 17h6',
  'mas-opciones': 'M5 12a1.1 1.1 0 102.2 0 1.1 1.1 0 10-2.2 0zM10.9 12a1.1 1.1 0 102.2 0 1.1 1.1 0 10-2.2 0zM16.8 12a1.1 1.1 0 102.2 0 1.1 1.1 0 10-2.2 0z',
  'sin-conexion': 'M3 3l18 18M8.6 8.9A9 9 0 003 11.4M20.9 11.4a9 9 0 00-4.5-2.8M5.6 14.6a5.5 5.5 0 013.6-1.7M14.8 13a5.5 5.5 0 012.6 1.6M10.2 17.6a2.6 2.6 0 013.6 0M12 21h.01',
  'chevron-abajo': 'M6 9l6 6 6-6'
};

// icon('mas', {size: 18, class: 'x'}) -> <svg>
export function icon(name, { size = 20, class: cls } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  const attrs = {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false'
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.inicio);
  svg.appendChild(p);
  return svg;
}
