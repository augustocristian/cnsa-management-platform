// Category block of the swimmer form: a live read-only "automatic category" box plus the master-licence and manual-category
// controls. The rules live in the categories service; this module only draws them.
import { h, field } from '../ui.js';
import { t, tCat } from '../i18n/i18n.js';
import { CATEGORIAS_ORDEN, esVerdadero, etiquetaTemporada } from '../../domain/categorias.js';
import { textoRango } from './categorias-panel.js';

// svc: categories service. nadador: the record being edited (or defaults). entradas: {fechaNacimiento, sexo} inputs.
// -> {vivo, extras:[nodes for "More data"], datos(), actualizar()}
export function bloqueCategoria(svc, nadador, entradas) {
  const manualInicial = String(nadador.categoriaManual || '').trim();
  const chkMaster = h('input', { type: 'checkbox', checked: esVerdadero(nadador.licenciaMaster) });
  const chkManual = h('input', { type: 'checkbox', checked: !!manualInicial });
  const selManual = h(
    'select',
    null,
    CATEGORIAS_ORDEN.map((c) =>
      h('option', { value: c, selected: c === (manualInicial || nadador.categoria || CATEGORIAS_ORDEN[0]) }, tCat(c)),
    ),
  );
  const campoManual = field({ label: t('categorias.f-elegida'), input: selManual });
  const vivo = h('div', {
    class: 'nad-catvivo full',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'categoria-auto',
  });

  const datos = () => ({
    licenciaMaster: chkMaster.checked,
    categoriaManual: chkManual.checked ? selManual.value : '',
  });
  const previa = () =>
    svc.previsualizar({ fechaNacimiento: entradas.fechaNacimiento.value, sexo: entradas.sexo.value, ...datos() });

  function actualizar() {
    const p = previa();
    const temporada = etiquetaTemporada(p.temporada);
    campoManual.hidden = !chkManual.checked;
    let texto;
    if (p.manual)
      texto = p.calculada
        ? t('categorias.vivo.manual', { categoria: tCat(p.categoria), auto: tCat(p.calculada) })
        : t('categorias.vivo.manual-sola', { categoria: tCat(p.categoria) });
    else if (!p.categoria)
      texto = t(p.origen === 'sin-sexo' ? 'categorias.vivo.sin-sexo' : 'categorias.vivo.sin-fecha');
    else if (p.origen === 'master')
      texto = t('categorias.vivo.master', {
        categoria: tCat(p.categoria),
        edad: p.rango ? p.rango.edadMin : '',
        temporada,
      });
    else texto = t('categorias.vivo.auto', { categoria: tCat(p.categoria), rango: textoRango(p.rango), temporada });
    const avisos = [];
    if (p.avisos.includes('por-debajo-edad'))
      avisos.push(t('categorias.aviso.por-debajo', { categoria: tCat(p.calculada || p.categoria) }));
    if (p.avisos.includes('master-edad-insuficiente'))
      avisos.push(t('categorias.aviso.master-edad', { edad: svc.config().edadMinimaMaster }));
    vivo.replaceChildren(
      h('p', null, h('strong', null, t('categorias.f-auto') + ': '), texto),
      ...avisos.map((a) => h('p', { class: 'nad-aviso' }, a)),
    );
  }

  // Turning manual mode on proposes the category that would come out automatically.
  chkManual.addEventListener('change', () => {
    if (!chkManual.checked || manualInicial) return;
    const auto = svc.previsualizar({
      fechaNacimiento: entradas.fechaNacimiento.value,
      sexo: entradas.sexo.value,
      licenciaMaster: chkMaster.checked,
      categoriaManual: '',
    }).categoria;
    if (CATEGORIAS_ORDEN.includes(auto)) selManual.value = auto;
  });
  [entradas.fechaNacimiento, entradas.sexo, chkMaster, chkManual, selManual].forEach((el) => {
    el.addEventListener('input', actualizar);
    el.addEventListener('change', actualizar);
  });
  actualizar();

  const extras = [
    h('label', { class: 'check full' }, chkMaster, t('categorias.f-master')),
    h('label', { class: 'check full' }, chkManual, t('categorias.f-manual')),
    campoManual,
  ];
  return { vivo, extras, datos, actualizar, controles: { chkMaster, chkManual, selManual }, manualInicial };
}
