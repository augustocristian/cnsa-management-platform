// Demo data of Club Natación Lugones (pure): swimmers, groups, sessions with detailed plans, attendance, loads, times, pool
// planning and season planning, all relative to the clock `hoy` (a Date received as a parameter). Deterministic: the random
// numbers come from a seeded generator (mulberry32), so the same `hoy` always gives the same club.
import { normalizarTipo, filaTipo, sembrarCatalogo } from './cargas.js';
import { planDemo, serializarLinea } from './entreno.js';
import { temporadaDemo } from './temporada.js';
import { categoriaDe, temporadaDe, etiquetaTemporada } from './categorias.js';
import { emptyDb, cleanRow as limpiarFila } from './filas.js';

// mulberry32: small deterministic generator -> () => number in [0, 1)
export function crearRng(semilla = 20251) {
  let seed = semilla;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -> { db, club }. `hoy`: Date (the demo clock); `genId`: used only if a row has no id; `rng`: injectable for tests.
export function construirDemo({
  hoy,
  genId = () => {
    throw new Error('genId is required for rows without id');
  },
  rng = crearRng(),
} = {}) {
  const hoyBase = hoy;
  const cleanRow = (sheet, row) => limpiarFila(sheet, row, genId);
  const reloj = () => new Date(hoyBase);
  const rnd = rng;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const addDays = (dt, n) => {
    const x = new Date(dt);
    x.setDate(x.getDate() + n);
    return x;
  };

  const out = emptyDb();
  const clubObj = {
    nombre: 'Club Natación Lugones',
    lema: 'Pequeño gran club',
    logo: '',
    colorPrimario: '#1a73e8',
    colorSecundario: '#0b3d91',
  };

  const grupos = [
    {
      id: 'g1',
      nombre: 'Promoción',
      categoria: 'Benjamín',
      entrenador: 'Marta Valdés',
      dias: [1, 3, 5],
      hora: '17:30',
      dur: 60,
      base: 1800,
      piscina: '25',
    },
    {
      id: 'g2',
      nombre: 'Alevín',
      categoria: 'Alevín',
      entrenador: 'Jorge Prieto',
      dias: [2, 4],
      hora: '18:30',
      dur: 75,
      base: 2600,
      piscina: '25',
    },
    {
      id: 'g3',
      nombre: 'Infantil-Junior',
      categoria: 'Infantil',
      entrenador: 'Marta Valdés',
      dias: [1, 3, 5],
      hora: '19:30',
      dur: 90,
      base: 3800,
      piscina: '25',
    },
    {
      id: 'g4',
      nombre: 'Absoluto-Master',
      categoria: 'Absoluto',
      entrenador: 'Jorge Prieto',
      dias: [2, 4, 6],
      hora: '20:30',
      dur: 90,
      base: 4500,
      piscina: '50',
    },
  ];
  grupos.forEach((g) =>
    out.Grupos.push({ id: g.id, nombre: g.nombre, categoria: g.categoria, entrenador: g.entrenador }),
  );

  // Birth = year of the current season (per the clock) - age in that season: so each swimmer falls in the intended category
  // even as time passes. The category is NOT set by hand: it is computed with the rules of domain/categorias.js.
  const temporadaDemoCat = temporadaDe(ymd(reloj()));
  const nad = [
    // name, surnames, age in the season (start year - birth year), month-day, sex, group, master licence
    ['Lucía', 'Fernández Roces', 8, '03-12', 'F', 'g1'], // Pre-Benjamín
    ['Martina', 'Suárez Cuesta', 10, '09-04', 'F', 'g1'], // Benjamín
    ['Pelayo', 'García Alonso', 9, '01-22', 'M', 'g1'], // Benjamín
    ['Carla', 'Menéndez Vigil', 12, '06-30', 'F', 'g2'], // Alevín
    ['Álvaro', 'Rodríguez Fano', 11, '11-08', 'M', 'g2'], // Alevín
    ['Noa', 'Díaz Llano', 14, '02-17', 'F', 'g3'], // Infantil
    ['Iker', 'Pérez Naves', 13, '08-25', 'M', 'g3'], // Infantil
    ['Paula', 'González Mier', 17, '05-14', 'F', 'g3'], // Junior
    ['Marcos', 'Llano Bernardo', 15, '10-03', 'M', 'g3'], // Junior
    ['Claudia', 'Vigil Argüelles', 23, '04-19', 'F', 'g4'], // Absoluto
    ['Daniel', 'Cueto Faes', 25, '12-01', 'M', 'g4'], // Absoluto (without master licence)
    ['Javier', 'Álvarez Tuñón', 42, '07-09', 'M', 'g4', true], // Master (with master licence)
  ];
  nad.forEach((n, i) => {
    const id = 'n' + pad(i + 1);
    const fila = {
      id,
      nombre: n[0],
      apellidos: n[1],
      fechaNacimiento: `${temporadaDemoCat - n[2]}-${n[3]}`,
      sexo: n[4],
      categoria: '',
      grupoId: n[5],
      email: '',
      telefono: '6' + String(10000000 + Math.floor(rnd() * 89999999)),
      tutor: i < 9 ? 'Familia ' + n[1].split(' ')[0] : '',
      licencia: 'AST' + (4000 + i * 7),
      notas: '',
      activo: 'true',
      licenciaMaster: n[6] ? 'true' : 'false',
      categoriaManual: '',
    };
    fila.categoria = categoriaDe(fila, temporadaDemoCat).categoria;
    out.Nadadores.push(fila);
  });
  clubObj.temporadaActual = '';
  clubObj.temporadaAplicada = etiquetaTemporada(temporadaDemoCat);

  // Content catalogue with weekly goals per swimmer (metres) for the contents worked on in the demo
  const obj = {
    'aerobico-medio': [1500, 4000],
    'aerobico-intenso': [800, 2500],
    anaerobico: [300, 1200],
    alactico: [400, 1500],
    piernas: [500, 1500],
    virajes: [500, 1500],
  };
  sembrarCatalogo([]).forEach((t) => {
    const clave = t.id.replace(/^tc-/, '');
    if (obj[clave]) {
      t.min = obj[clave][0];
      t.max = obj[clave][1];
    }
    out.TiposCarga.push(cleanRow('TiposCarga', filaTipo(t)));
  });

  // Entrenamientos: from 3 weeks ago to next week
  const today = reloj();
  today.setHours(0, 0, 0, 0);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const enfoques = [
    'Resistencia aeróbica',
    'Velocidad y salidas',
    'Técnica de viraje',
    'Trabajo de piernas',
    'Series mixtas',
    'Fuerza en seco',
  ];
  const tipoDe = {
    'Resistencia aeróbica': 'Aeróbico medio / Umbral anaeróbico',
    'Velocidad y salidas': 'Aláctico / Sprint',
    'Técnica de viraje': 'Virajes/volteos',
    'Trabajo de piernas': 'Piernas',
    'Series mixtas': 'Aeróbico intenso / Potencia aeróbica',
    'Fuerza en seco': 'Anaeróbico / Tolerancia al lactato',
  };
  let ne = 0;
  const sesiones = [];
  for (let w = -3; w <= 1; w++) {
    grupos.forEach((g) => {
      g.dias.forEach((dow) => {
        const fecha = addDays(monday, w * 7 + (dow - 1));
        const f = ymd(fecha);
        const enfoque = enfoques[(ne + g.dias.length) % enfoques.length];
        const vol = Math.round((g.base * (0.9 + rnd() * 0.3)) / 100) * 100;
        const id = 'e' + String(++ne).padStart(3, '0');
        const pasada = fecha < today;
        out.Entrenamientos.push({
          id,
          fecha: f,
          hora: g.hora,
          duracionMin: g.dur,
          grupoId: g.id,
          titulo: `${g.nombre} - ${enfoque}`,
          descripcion: `Calentamiento 400 m, parte principal de ${enfoque.toLowerCase()}, vuelta a la calma.`,
          estado: pasada ? 'realizado' : 'planificado',
          piscina: g.piscina,
          volumenMin: Math.round((vol * 0.9) / 100) * 100,
          volumenMax: Math.round((vol * 1.1) / 100) * 100,
          enfoque,
        });
        sesiones.push({ id, fecha: f, pasada, hoy: ymd(fecha) === ymd(today), g, vol, tipo: tipoDe[enfoque] });
        Object.assign(out.Entrenamientos[out.Entrenamientos.length - 1], {
          tipoSesion: '',
          materialDia: '',
          notasGenerales: '',
        });
        if (!pasada) {
          // today's and upcoming sessions: realistic detailed plan (see domain/entreno.js)
          const plan = planDemo(ne, vol, g.dur);
          Object.assign(out.Entrenamientos[out.Entrenamientos.length - 1], {
            tipoSesion: plan.tipoSesion,
            materialDia: plan.materialDia,
            notasGenerales: plan.notasGenerales,
          });
          plan.lineas.forEach((l, i) =>
            out.EntrenoLineas.push(
              cleanRow('EntrenoLineas', { ...serializarLinea(l), id: 'el' + id + '-' + (i + 1), entrenamientoId: id }),
            ),
          );
        }
      });
    });
  }

  // Attendance (Asistencia) and loads (Cargas)
  let na = 0,
    nc = 0;
  sesiones.forEach((s) => {
    if (!s.pasada && !s.hoy) return;
    out.Nadadores.filter((n) => n.grupoId === s.g.id).forEach((n) => {
      const r = rnd();
      const estado = r < 0.84 ? 'presente' : r < 0.92 ? 'justificado' : 'ausente';
      if (s.hoy && rnd() < 0.3) return; // today: some unconfirmed
      out.Asistencia.push({
        id: 'a' + ++na,
        entrenamientoId: s.id,
        nadadorId: n.id,
        estado,
        nota: estado === 'justificado' ? 'Avisa la familia' : '',
      });
      if (estado === 'presente' && s.pasada) {
        out.Cargas.push({
          id: 'c' + ++nc,
          entrenamientoId: s.id,
          nadadorId: n.id,
          fecha: s.fecha,
          metros: Math.round((s.vol * (0.85 + rnd() * 0.3)) / 50) * 50,
          rpe: 4 + Math.floor(rnd() * 5),
          minutos: s.g.dur,
          tipo: s.tipo,
          notas: '',
        });
      }
    });
  });

  // Marks (times in ms)
  const pruebas = [
    ['50 Libre', 28500],
    ['100 Libre', 62000],
    ['50 Espalda', 33000],
    ['100 Braza', 80000],
    ['50 Mariposa', 31000],
    ['200 Estilos', 150000],
  ];
  const mult = {
    'Pre-Benjamín': 1.45,
    Benjamín: 1.3,
    Alevín: 1.2,
    Infantil: 1.08,
    Junior: 1.0,
    Absoluto: 0.97,
    Master: 1.12,
  };
  // Club swimsuit catalogue: 2 training suits and 3 technical (fast skin) competition suits.
  [
    ['bn1', 'entrenamiento', 'Speedo', 'Endurance+'],
    ['bn2', 'entrenamiento', 'Arena', 'Solid'],
    ['bn3', 'competicion', 'Arena', 'Powerskin Carbon Core FX'],
    ['bn4', 'competicion', 'Speedo', 'Fastskin LZR Pure Intent'],
    ['bn5', 'competicion', 'Mizuno', 'GX Sonic V'],
  ].forEach(([id, tipo, marca, modelo]) => out.Banadores.push({ id, tipo, marca, modelo, activo: 'true', notas: '' }));
  const entreno = out.Banadores.filter((b) => b.tipo === 'entrenamiento');
  const tecnicos = out.Banadores.filter((b) => b.tipo === 'competicion');
  // Four competitions and, as a fifth option, a control test in training (no competition, training suit).
  const comps = ['Trofeo Ciudad de Gijón', 'Campeonato Asturias', 'Copa Federación', 'Torneo Lugones', ''];
  let nm = 0;
  out.Nadadores.forEach((n) => {
    const ps = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, 3);
    ps.forEach((pi) => {
      for (let k = 0; k < 2; k++) {
        // two marks: the recent one improves the previous one
        const fecha = addDays(today, -(k === 0 ? 20 + Math.floor(rnd() * 40) : 150 + Math.floor(rnd() * 120)));
        const base =
          pruebas[pi][1] *
          mult[n.categoria] *
          (n.sexo === 'F' ? 1.04 : 1) *
          (0.96 + rnd() * 0.08) *
          (k === 0 ? 1 : 1.04);
        const comp = pick(comps);
        // Suit consistent with the mark: technical in competition, training suit in tests; some mark without a recorded suit.
        const banador = nm % 7 === 6 ? null : (comp ? tecnicos : entreno)[nm % (comp ? tecnicos : entreno).length];
        out.Marcas.push({
          id: 'm' + ++nm,
          nadadorId: n.id,
          fecha: ymd(fecha),
          prueba: pruebas[pi][0],
          piscina: pi === 5 ? '50' : pick(['25', '50']),
          tiempoMs: Math.round(base / 10) * 10,
          competicion: comp,
          notas: comp ? '' : 'Test de control',
          banadorId: banador ? banador.id : '',
        });
      }
    });
  });

  // Pool planning: a 6-lane pool and recurring assignments consistent with the groups.
  // No error-level conflicts (only one intentional warning: a support session without a coach).
  const horario = JSON.stringify({
    1: { abre: '07:00', cierra: '22:00' },
    2: { abre: '07:00', cierra: '22:00' },
    3: { abre: '07:00', cierra: '22:00' },
    4: { abre: '07:00', cierra: '22:00' },
    5: { abre: '07:00', cierra: '22:00' },
    6: { abre: '09:00', cierra: '22:00' },
    7: null,
  });
  out.Piscinas.push({
    id: 'p1',
    nombre: 'Piscina Lugones',
    longitudM: 25,
    numCalles: 6,
    intervaloMin: 30,
    maxPorCalle: 8,
    horario,
  });
  const calles = { g1: [1, 2], g2: [3, 4], g3: [1, 3], g4: [1, 4] };
  let np = 0;
  grupos.forEach((g) =>
    g.dias.forEach((dow) => {
      const ini = Number(g.hora.slice(0, 2)) * 60 + Number(g.hora.slice(3));
      const hm = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
      out.AsignacionesCalle.push({
        id: 'ac' + ++np,
        piscinaId: 'p1',
        dia: dow,
        fecha: '',
        horaInicio: g.hora,
        horaFin: hm(ini + g.dur),
        calleDesde: calles[g.id][0],
        calleHasta: calles[g.id][1],
        grupoId: g.id,
        entrenadorId: g.entrenador,
        notas: '',
      });
    }),
  );
  out.AsignacionesCalle.push({
    id: 'ac' + ++np,
    piscinaId: 'p1',
    dia: 6,
    fecha: '',
    horaInicio: '10:00',
    horaFin: '11:00',
    calleDesde: 5,
    calleHasta: 6,
    grupoId: 'g1',
    entrenadorId: '',
    notas: 'Refuerzo (falta asignar entrenador)',
  });

  // Season planning: phases, weeks with planned volume and events (see domain/temporada.js)
  const demoTemp = temporadaDemo({
    hoy: ymd(today),
    grupoId: 'g3',
    tipos: out.TiposCarga.map(normalizarTipo),
    desdeFecha: ymd(addDays(monday, -21)),
  });
  out.Temporadas.push(cleanRow('Temporadas', demoTemp.temporada));
  demoTemp.fases.forEach((f) => out.Fases.push(cleanRow('Fases', f)));
  demoTemp.semanas.forEach((s) => out.SemanasPlan.push(cleanRow('SemanasPlan', s)));
  demoTemp.eventos.forEach((e) => out.EventosTemporada.push(cleanRow('EventosTemporada', e)));

  // Comunicaciones
  out.Comunicaciones.push(
    {
      id: 'k1',
      fecha: ymd(addDays(today, -1)),
      titulo: 'Horarios de la próxima semana',
      texto: 'Se mantienen los horarios habituales. Recordad traer gorro y gafas.',
      grupoId: '',
      autor: 'Dirección técnica',
    },
    {
      id: 'k2',
      fecha: ymd(addDays(today, -4)),
      titulo: 'Competición en Gijón',
      texto: 'Salida en autobús a las 8:00 desde la piscina de Lugones.',
      grupoId: 'g3',
      autor: 'Marta Valdés',
    },
    {
      id: 'k3',
      fecha: ymd(addDays(today, -9)),
      titulo: 'Entrega de bañadores',
      texto: 'Quien tenga el bañador pendiente puede recogerlo en secretaría.',
      grupoId: '',
      autor: 'Secretaría',
    },
  );

  return { db: out, club: clubObj };
}

// Sample conflicts for the pool planning (several errors and warnings) to ADD to an existing demo club.
// -> rows of AsignacionesCalle (empty if there is no pool)
export function filasConflictosPlanificacion({ piscinas, grupos }) {
  const pis = piscinas[0];
  if (!pis) return [];
  const g = grupos;
  return [
    {
      id: 'pcx1',
      piscinaId: pis.id,
      dia: 1,
      fecha: '',
      horaInicio: '17:30',
      horaFin: '18:30',
      calleDesde: 2,
      calleHasta: 3,
      grupoId: (g[1] || g[0]).id,
      entrenadorId: (g[1] || g[0]).entrenador,
      notas: 'Demo: calle solapada con Promoción',
    },
    {
      id: 'pcx2',
      piscinaId: pis.id,
      dia: 4,
      fecha: '',
      horaInicio: '18:30',
      horaFin: '19:30',
      calleDesde: 5,
      calleHasta: 5,
      grupoId: (g[2] || g[0]).id,
      entrenadorId: (g[1] || g[0]).entrenador,
      notas: 'Demo: mismo entrenador a la vez',
    },
  ];
}
