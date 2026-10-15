// Vista Asistencia: pasar lista (tocar para ciclar estado) e historial.
const CSS = `
.asi-tabs{display:flex;gap:6px;margin-bottom:12px}
.asi-tabs .btn.asi-on{background:var(--c-primary,#1a73e8);color:#fff}
.asi-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.asi-bar select{font:inherit;padding:8px;border:1px solid #c9d1dc;border-radius:8px;max-width:100%}
.asi-sum{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.asi-list{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.asi-sw{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;font:inherit;padding:14px 12px;min-height:56px;border:2px solid #d5dbe4;border-radius:12px;background:#fff;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.asi-sw b{font-weight:600}
.asi-st{font-size:.8rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#eef1f5;color:#5f6b7a;white-space:nowrap}
.asi-sw.asi-presente{border-color:#2e9e5b;background:#eaf7f0}.asi-sw.asi-presente .asi-st{background:#2e9e5b;color:#fff}
.asi-sw.asi-ausente{border-color:#d93025;background:#fdecea}.asi-sw.asi-ausente .asi-st{background:#d93025;color:#fff}
.asi-sw.asi-justificado{border-color:#e6a100;background:#fff6dc}.asi-sw.asi-justificado .asi-st{background:#e6a100;color:#fff}
.asi-pct{display:inline-block;min-width:44px;font-weight:700}
.asi-bar-bg{height:8px;background:#e5e9f0;border-radius:4px;overflow:hidden;min-width:80px}
.asi-bar-fg{height:100%;background:#2e9e5b}
.asi-det td{font-size:.85rem;color:#44505f}
.asi-wrap{overflow-x:auto}
.asi-empty{color:#7a8594;padding:8px 0}
`;

const ESTADOS = ['presente', 'ausente', 'justificado'];
const LABEL = { presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado', '': 'Sin marcar' };
const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isActive = (n) => !['false', '0', 'no', 'n', 'falso'].includes(String(n.activo ?? '').trim().toLowerCase());
const fdate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

function injectStyle() {
  if (document.getElementById('asi-style')) return;
  const s = document.createElement('style');
  s.id = 'asi-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export async function render(container, params, ctx) {
  const { store, auth } = ctx;
  const h = ctx.ui.h;
  injectStyle();

  const canEdit = auth.role() !== 'nadador';
  let tab = 'lista';
  let sessionId = (Array.isArray(params) ? params[0] : params && (params.id || params[0])) || '';
  let histGroup = '';
  let expanded = null;
  let unsub = null;

  const grupoName = (id) => (store.list('Grupos').find((g) => g.id === id) || {}).nombre || 'Todos';
  const fullName = (n) => `${n.apellidos || ''}${n.apellidos ? ', ' : ''}${n.nombre || ''}`;
  const sortSessions = (arr) => arr.sort((a, b) =>
    (String(b.fecha) + String(b.hora || '')).localeCompare(String(a.fecha) + String(a.hora || '')));

  function defaultSession(sessions) {
    const t = todayIso();
    const today = sessions.find((s) => String(s.fecha).slice(0, 10) === t);
    if (today) return today.id;
    const past = sessions.find((s) => String(s.fecha).slice(0, 10) <= t);
    return (past || sessions[0] || {}).id || '';
  }

  // presente -> ausente -> justificado -> sin marcar
  async function cycle(sess, n, current) {
    if (!current) {
      await store.upsert('Asistencia', { entrenamientoId: sess.id, nadadorId: n.id, estado: ESTADOS[0], nota: '' });
      return;
    }
    const next = ESTADOS[ESTADOS.indexOf(current.estado) + 1];
    if (next) await store.upsert('Asistencia', { ...current, estado: next });
    else await store.remove('Asistencia', current.id);
  }

  function drawLista() {
    const sessions = sortSessions(store.list('Entrenamientos'));
    if (!sessions.find((s) => s.id === sessionId)) sessionId = defaultSession(sessions);
    const sess = sessions.find((s) => s.id === sessionId);
    if (!sess) return h('div', { class: 'card asi-empty' }, 'No hay sesiones. Crea una en Entrenamientos.');

    const sel = h('select', { onchange: (e) => { sessionId = e.target.value; draw(); } },
      ...sessions.map((s) => h('option', { value: s.id },
        `${fdate(s.fecha)} ${s.hora || ''} · ${s.titulo || 'Sesión'} · ${grupoName(s.grupoId)}`)));
    sel.value = sessionId;

    const nadadores = store.list('Nadadores')
      .filter((n) => isActive(n) && (!sess.grupoId || n.grupoId === sess.grupoId))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
    const recs = new Map(store.list('Asistencia')
      .filter((a) => a.entrenamientoId === sess.id).map((a) => [a.nadadorId, a]));

    const count = { presente: 0, ausente: 0, justificado: 0 };
    nadadores.forEach((n) => { const r = recs.get(n.id); if (r && count[r.estado] !== undefined) count[r.estado]++; });
    const sin = nadadores.length - count.presente - count.ausente - count.justificado;

    const items = nadadores.map((n) => {
      const r = recs.get(n.id);
      const st = r ? r.estado : '';
      return h('button', {
        type: 'button', class: `asi-sw${st ? ' asi-' + st : ''}`, disabled: !canEdit,
        onclick: () => cycle(sess, n, r),
      }, h('b', {}, fullName(n)), h('span', { class: 'asi-st' }, LABEL[st] || 'Sin marcar'));
    });

    return h('div', {},
      h('div', { class: 'asi-bar' }, sel,
        canEdit ? h('button', { class: 'btn', onclick: async () => {
          for (const n of nadadores) if (!recs.get(n.id)) await cycle(sess, n, null);
        } }, 'Marcar todos presentes') : null),
      h('div', { class: 'asi-sum' },
        h('span', { class: 'badge' }, `Presentes: ${count.presente}`),
        h('span', { class: 'badge' }, `Ausentes: ${count.ausente}`),
        h('span', { class: 'badge' }, `Justificados: ${count.justificado}`),
        h('span', { class: 'badge' }, `Sin marcar: ${sin}`)),
      canEdit ? h('div', { class: 'asi-empty' }, 'Toca un nadador para cambiar: presente, ausente, justificado, sin marcar.') : null,
      nadadores.length ? h('div', { class: 'asi-list' }, ...items)
        : h('div', { class: 'asi-empty' }, 'No hay nadadores activos en este grupo.'));
  }

  function drawHistorial() {
    const grupos = store.list('Grupos');
    const gsel = h('select', { onchange: (e) => { histGroup = e.target.value; expanded = null; draw(); } },
      h('option', { value: '' }, 'Todos los grupos'),
      ...grupos.map((g) => h('option', { value: g.id }, g.nombre)));
    gsel.value = histGroup;

    const sessById = new Map(store.list('Entrenamientos').map((s) => [s.id, s]));
    const byNad = new Map();
    store.list('Asistencia').forEach((a) => {
      if (!sessById.has(a.entrenamientoId)) return;
      if (!byNad.has(a.nadadorId)) byNad.set(a.nadadorId, []);
      byNad.get(a.nadadorId).push(a);
    });

    const nads = store.list('Nadadores')
      .filter((n) => isActive(n) && (!histGroup || n.grupoId === histGroup))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));

    const rows = [];
    nads.forEach((n) => {
      const recs = byNad.get(n.id) || [];
      const c = { presente: 0, ausente: 0, justificado: 0 };
      recs.forEach((r) => { if (c[r.estado] !== undefined) c[r.estado]++; });
      const total = recs.length;
      const pct = total ? Math.round((c.presente / total) * 100) : null;
      rows.push(h('tr', { style: 'cursor:pointer', onclick: () => { expanded = expanded === n.id ? null : n.id; draw(); } },
        h('td', {}, fullName(n)),
        h('td', {}, String(c.presente)), h('td', {}, String(c.ausente)), h('td', {}, String(c.justificado)),
        h('td', {}, pct === null ? '—' : h('div', { style: 'display:flex;gap:8px;align-items:center' },
          h('span', { class: 'asi-pct' }, `${pct}%`),
          h('div', { class: 'asi-bar-bg' }, h('div', { class: 'asi-bar-fg', style: `width:${pct}%` }))))));
      if (expanded === n.id) {
        const det = recs.slice().sort((a, b) =>
          String(sessById.get(b.entrenamientoId).fecha).localeCompare(String(sessById.get(a.entrenamientoId).fecha)));
        rows.push(h('tr', { class: 'asi-det' }, h('td', { colspan: 5 },
          det.length ? h('div', {}, ...det.map((r) => {
            const s = sessById.get(r.entrenamientoId);
            return h('div', {}, `${fdate(s.fecha)} · ${s.titulo || 'Sesión'} · ${LABEL[r.estado] || r.estado}${r.nota ? ' (' + r.nota + ')' : ''}`);
          })) : 'Sin registros')));
      }
    });

    return h('div', {},
      h('div', { class: 'asi-bar' }, gsel),
      h('div', { class: 'asi-empty' }, '% = sesiones presentes sobre sesiones con asistencia registrada. Toca una fila para ver el detalle.'),
      nads.length ? h('div', { class: 'card asi-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ...['Nadador', 'Pres.', 'Aus.', 'Just.', '% asistencia'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...rows))) : h('div', { class: 'asi-empty' }, 'No hay nadadores.'));
  }

  function draw() {
    container.replaceChildren(
      h('h2', {}, 'Asistencia'),
      h('div', { class: 'asi-tabs' },
        h('button', { class: 'btn' + (tab === 'lista' ? ' asi-on' : ''), onclick: () => { tab = 'lista'; draw(); } }, 'Pasar lista'),
        h('button', { class: 'btn' + (tab === 'historial' ? ' asi-on' : ''), onclick: () => { tab = 'historial'; draw(); } }, 'Historial')),
      tab === 'lista' ? drawLista() : drawHistorial());
  }

  draw();
  if (store.on) {
    const off = store.on(() => { if (container.isConnected) draw(); else if (typeof off === 'function') off(); });
    unsub = off;
  }
  return unsub;
}
