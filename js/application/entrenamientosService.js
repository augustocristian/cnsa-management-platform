// Application service of the Training sessions list and of the PDF flow.
// Everything outside the domain arrives injected, so it runs in tests with an in-memory repository:
//   repo     list/get/upsert/remove (the store or a fake)
//   entreno  the detailed-plan service (application/entrenoService.js)
//   ahora    clock: () => Date
//   pdf      PdfPort: { generar(fichas, etiquetas) -> { blob, paginas } }  (infrastructure/pdfEntreno.js)
//   drive    { guardar({ blob, nombre }) -> { actualizado, ... } } or null when there is no Drive connection (demo mode)
//   nombreDia(fecha) -> weekday name used in file names (the view knows the language)
import * as E from '../domain/entrenamientos.js';
import { nombreFichero, nombreFicheroSemana, planVacio } from '../domain/entreno.js';

const HOJA = 'Entrenamientos';
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function crearEntrenamientosService(repo, { entreno, ahora = () => new Date(), pdf = null, drive = null, nombreDia = () => '' } = {}) {
  if (!entreno) throw new Error('entreno service required');
  const hoy = () => isoLocal(ahora());
  const todas = () => repo.list(HOJA);

  const svc = {
    hoy,
    lunesActual: () => E.lunesDe(hoy()),
    semanaAnterior: (lunes) => E.sumarDias(lunes, -7),
    semanaSiguiente: (lunes) => E.sumarDias(lunes, 7),
    grupos: () => repo.list('Grupos'),
    nombreGrupo: (id) => { const g = id ? repo.get('Grupos', id) : null; return g ? g.nombre : ''; },
    sesion: (id) => repo.get(HOJA, id),

    // Week model with the plan summary of each session: sesiones[i].resumen = { metros, tiempoMin, ... } | null
    semana(lunes, { grupoId = '' } = {}) {
      const semana = E.armarSemana(todas(), lunes, { grupoId, hoy: hoy() });
      const porSesion = new Map();
      repo.list('EntrenoLineas').forEach((l) => {
        const k = String(l.entrenamientoId);
        if (!porSesion.has(k)) porSesion.set(k, []);
        porSesion.get(k).push(l);
      });
      semana.dias.forEach((d) => { d.sesiones = d.sesiones.map((s) => ({ ...s, resumen: porSesion.has(String(s.id)) ? entreno.resumen(s.id) : null })); });
      return semana;
    },

    borradorNuevo: ({ fecha, grupoId } = {}) => E.borradorNuevo({ fecha: fecha || hoy(), grupoId: grupoId || '' }),
    borradorDuplicado: (id) => { const s = repo.get(HOJA, id); return s ? E.borradorDuplicado(s) : null; },

    // Validates and saves a session from the form. `valores.copiaDe` copies that session's plan into a NEW session.
    // -> { ok: true, sesion } | { ok: false, errores: { campo: codigo } }
    guardar(valores) {
      const { copiaDe, ...fila } = valores;
      const errores = E.validarFormulario(fila);
      if (Object.keys(errores).length) return { ok: false, errores };
      const esNueva = !fila.id;
      let sesion;
      try { sesion = repo.upsert(HOJA, fila); } catch (e) {
        if (e && e.code === 'validacion') return { ok: false, errores: { _formulario: 'validacion' } };
        throw e;
      }
      if (esNueva && copiaDe && sesion) entreno.copiarPlan(copiaDe, sesion.id);
      return { ok: true, sesion };
    },

    alternarEstado(id) {
      const s = repo.get(HOJA, id);
      return s ? repo.upsert(HOJA, { ...s, estado: E.alternarEstado(s.estado) }) : null;
    },

    // Deletes a session and its plan. -> snapshot to pass to `restaurar` (undo) or null
    eliminar(id) {
      const snap = entreno.instantanea(id);
      if (snap) entreno.eliminarSesion(id);
      return snap;
    },
    restaurar: (snap) => entreno.restaurar(snap),

    // ---------- PDF ----------
    // Each returns { ok: true, blob, nombre, paginas } or { ok: false, codigo } with codigo:
    //   'sesion-inexistente' | 'plan-vacio' (pass { permitirVacio: true } to generate anyway) | 'sin-sesiones' | 'sin-pdf'
    async pdfSesion(id, { borrador = null, etiquetas, permitirVacio = false } = {}) {
      if (!pdf) return { ok: false, codigo: 'sin-pdf' };
      const ficha = entreno.ficha(id, borrador);
      if (!ficha) return { ok: false, codigo: 'sesion-inexistente' };
      if (!permitirVacio && !ficha.sets.length) return { ok: false, codigo: 'plan-vacio' };
      const nombre = nombreFichero({ grupo: ficha.sesion.grupo || ficha.sesion.titulo, fecha: ficha.sesion.fecha, dia: nombreDia(ficha.sesion.fecha) });
      const r = await pdf.generar([ficha], etiquetas);
      return { ok: true, blob: r.blob, nombre, paginas: r.paginas };
    },
    async pdfSemana(lunes, { grupoId = '', etiquetas, permitirVacio = false } = {}) {
      if (!pdf) return { ok: false, codigo: 'sin-pdf' };
      const fichas = entreno.fichasSemana(lunes, { grupoId });
      if (!fichas.length) return { ok: false, codigo: 'sin-sesiones' };
      if (!permitirVacio && fichas.every((f) => !f.sets.length)) return { ok: false, codigo: 'plan-vacio' };
      const r = await pdf.generar(fichas, etiquetas);
      return { ok: true, blob: r.blob, nombre: nombreFicheroSemana({ grupo: grupoId ? svc.nombreGrupo(grupoId) : '', lunes }), paginas: r.paginas };
    },
    // Is the draft (or the saved plan) empty? Used to warn before generating.
    planVacio: (id, borrador = null) => planVacio(borrador ? borrador.lineas : entreno.lineas(id)),

    // Saving to Drive needs the Drive connection (not available in demo mode). -> { actualizado }
    driveDisponible: () => !!drive,
    async guardarEnDrive({ blob, nombre }) {
      if (!drive) throw new Error('drive-no-disponible');
      return drive.guardar({ blob, nombre });
    },
  };
  return svc;
}
