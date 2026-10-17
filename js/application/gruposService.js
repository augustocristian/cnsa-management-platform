// Use cases about training groups: cards with their members, save with validation, delete with undo.
// The repository (list/get/upsert/upsertMany/remove, e.g. the store) is injected.
import {
  ordenarGrupos,
  miembrosActivos,
  sinGrupo,
  asignados,
  validarGrupo,
  categoriaVisible,
} from '../domain/grupos.js';

export const HOJA = 'Grupos';

export function crearGruposService(repo) {
  return {
    // One entry per group (category order): {grupo, miembros (active), categoria (badge, '' when redundant)}
    tarjetas() {
      const nadadores = repo.list('Nadadores');
      return ordenarGrupos(repo.list(HOJA)).map((grupo) => ({
        grupo,
        miembros: miembrosActivos(nadadores, grupo.id),
        categoria: categoriaVisible(grupo),
      }));
    },
    sinGrupo: () => sinGrupo(repo.list('Nadadores'), repo.list(HOJA)),
    total: () => repo.list(HOJA).length,

    // -> {ok:true, fila} | {ok:false, errores:[{campo, codigo}]}
    guardar(fila) {
      const limpia = {
        ...fila,
        nombre: String(fila.nombre || '').trim(),
        entrenador: String(fila.entrenador || '').trim(),
        categoria: fila.categoria || '',
      };
      const errores = validarGrupo(limpia, repo.list(HOJA));
      if (errores.length) return { ok: false, errores };
      return { ok: true, fila: repo.upsert(HOJA, limpia) };
    },

    // Deletes the group; its swimmers (active or not) stay in the club without a group. -> snapshot for restaurar()
    eliminar(id) {
      const grupo = repo.get(HOJA, id);
      if (!grupo) return null;
      const miembros = asignados(repo.list('Nadadores'), id);
      if (miembros.length)
        repo.upsertMany(
          'Nadadores',
          miembros.map((n) => ({ ...n, grupoId: '' })),
        );
      repo.remove(HOJA, id);
      return { grupo, miembros: miembros.map((n) => n.id) };
    },

    // Undo of eliminar(): the group comes back and so does the membership of those swimmers that are still without group.
    restaurar(snapshot) {
      if (!snapshot) return;
      repo.upsertMany(HOJA, [snapshot.grupo]);
      const vueltos = snapshot.miembros.map((id) => repo.get('Nadadores', id)).filter((n) => n && !n.grupoId);
      if (vueltos.length)
        repo.upsertMany(
          'Nadadores',
          vueltos.map((n) => ({ ...n, grupoId: snapshot.grupo.id })),
        );
    },
  };
}
