import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, tick } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
const test = (name, fn) =>
  base(name, async (t) => {
    c = await fresh();
    return fn(t);
  });

const montar = (nodos) => {
  c.container.replaceChildren(...nodos.flat().filter(Boolean));
  return c.container;
};
const botonPorTexto = (root, texto) =>
  [...root.querySelectorAll('button, a')].find((b) => b.textContent.trim() === texto);

test('start screen (Client ID set): value proposition, privacy and ONLY Connect Google Drive; no demo, no account wording', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  const root = montar(acceso.login({ auth: { connect: async () => {} }, onConectar: () => {} }));
  assert.equal(root.querySelector('h1').textContent, 'CNL Plataforma');
  const primario = root.querySelector('#btn-google');
  assert.equal(primario.textContent.trim(), 'Conectar Google Drive');
  assert.ok(primario.classList.contains('btn--primary'));
  assert.match(root.textContent, /Tus datos se guardan en tu propio Google Drive; no se comparte nada con nadie/);
  assert.match(root.querySelector('.acc-propuesta').textContent, /Planifica entrenamientos/);
  assert.equal(root.querySelector('#btn-demo'), null);
  assert.equal(botonPorTexto(root, 'Probar la demo'), undefined);
  assert.doesNotMatch(root.textContent, /demo/i);
  assert.equal(root.querySelectorAll('button.btn-primary').length, 1, 'a single primary action');
  assert.doesNotMatch(root.textContent, /iniciar sesi|inicia sesi|cuenta|correo|bienvenid|e-?mail/i);
  assert.ok(document.head.querySelector('link[data-view-css="acceso"]'));
  assert.equal(document.querySelectorAll('style').length, 0);
});

test('start screen: the one-off notice that the demo was closed is announced politely', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  const aviso = 'A Google Client ID is now configured: the demo was closed. Connect Google Drive to continue.';
  const root = montar(acceso.login({ auth: { connect: async () => {} }, onConectar: () => {}, aviso }));
  const caja = root.querySelector('#acc-aviso.alert.alert--info[role="status"]');
  assert.ok(caja);
  assert.equal(caja.textContent.trim(), aviso);
  assert.ok(root.querySelector('#btn-google'));
  assert.equal(
    montar(acceso.login({ auth: { connect: async () => {} }, onConectar: () => {} })).querySelector('#acc-aviso'),
    null,
  );
});

test('start: the language selector is not the first thing in the card and is a button group, not a select', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  const root = montar(acceso.login({ auth: { connect: async () => {} }, onConectar: () => {} }));
  assert.equal(root.querySelector('select'), null);
  const grupo = root.querySelector('[role="radiogroup"].lang-switch');
  assert.ok(grupo);
  assert.deepEqual(
    [...grupo.querySelectorAll('[role="radio"]')].map((b) => b.dataset.lang),
    ['es', 'en', 'it'],
  );
  assert.notEqual(root.firstElementChild, grupo.closest('.acc-foot'));
  assert.equal(root.lastElementChild, grupo.closest('.acc-foot'), 'in the card footer');
  assert.ok(root.firstElementChild.matches('img.logo-big'));
});

test('connect: success calls onConectar; a Google error is explained with an accessible .alert and the button is released', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let ok = 0;
  let fallo = true;
  const auth = {
    connect: async () => {
      if (fallo) {
        const e = new Error('x');
        e.code = 'popup-bloqueado';
        throw e;
      }
    },
  };
  const root = montar(
    acceso.login({
      auth,
      onConectar: () => {
        ok++;
      },
    }),
  );
  const btn = root.querySelector('#btn-google');
  btn.click();
  await tick(5);
  const alerta = root.querySelector('#login-salida .alert.alert--danger[role="alert"]');
  assert.ok(alerta, 'error visible');
  assert.equal(alerta.dataset.codigo, 'popup-bloqueado');
  assert.ok(alerta.querySelector('svg.icon'));
  assert.match(alerta.textContent, /El navegador ha bloqueado la ventana de Google/);
  assert.equal(btn.hasAttribute('aria-busy'), false);
  assert.equal(root.querySelector('#login-salida').getAttribute('aria-live'), 'polite');
  fallo = false;
  btn.click();
  await tick(5);
  assert.equal(ok, 1);
  assert.equal(root.querySelector('#login-salida').children.length, 0, 'the previous error is cleared');
});

test('errorGoogle: the current origin appears next to its Copy button in a single aligned row', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  const e = new Error('origin');
  e.code = 'origen-no-autorizado';
  e.origin = 'http://localhost:4500';
  const box = acceso.errorGoogle(e);
  const fila = box.querySelector('.acc-copy');
  assert.ok(fila);
  assert.equal(fila.querySelector('code').textContent, 'http://localhost:4500');
  assert.deepEqual(
    [...fila.children].map((x) => x.tagName),
    ['CODE', 'BUTTON'],
  );
});

test('configuration needed: connection wording (not session), labelled field and accessible error', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let listo = 0;
  const root = montar(
    acceso.configNecesaria({
      auth: { connect: async () => {} },
      onListo: () => {
        listo++;
      },
    }),
  );
  assert.equal(root.querySelector('h1').textContent, 'Configuración necesaria');
  assert.doesNotMatch(root.textContent, /iniciar sesi|inicia sesi/i);
  assert.ok(root.querySelector('.acc-copy code'));
  const campo = root.querySelector('#cfg-clientid');
  assert.equal(campo.closest('label').textContent.trim().startsWith('ID de cliente de Google'), true);
  campo.value = 'esto-no-vale';
  root.querySelector('#cfg-probar').click();
  await tick(5);
  assert.equal(campo.getAttribute('aria-invalid'), 'true');
  assert.match(
    campo.closest('.field').querySelector('.field-error').textContent,
    /debe terminar en \.apps\.googleusercontent\.com/,
  );
  campo.value = '123456-abc.apps.googleusercontent.com';
  root.querySelector('#cfg-probar').click();
  await tick(5);
  assert.equal(listo, 1);
});

test('configuration needed (no Client ID): Try the demo is the first action, the owner setup comes below', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let demo = 0;
  const root = montar(
    acceso.configNecesaria({
      auth: { connect: async () => {} },
      onListo: () => {},
      onDemo: () => {
        demo++;
      },
    }),
  );
  const botones = [...root.querySelectorAll('button, a.btn')];
  assert.equal(botones[0].id, 'btn-demo', 'the demo button is the first action');
  assert.equal(botones[0].textContent.trim(), 'Probar la demo');
  assert.ok(botones[0].classList.contains('btn--primary'));
  assert.match(
    root.querySelector('.acc-demo-cta').textContent,
    /Datos de ejemplo guardados solo en este dispositivo; no se envía nada a Drive\./,
  );
  const setup = root.querySelector('.acc-owner');
  assert.ok(
    setup && root.querySelector('.acc-demo-cta').compareDocumentPosition(setup) & 4,
    'owner setup after the demo',
  );
  for (const id of ['cfg-tutorial', 'cfg-tutorial-id', 'cfg-clientid', 'cfg-probar'])
    assert.ok(setup.querySelector('#' + id), id);
  assert.equal(root.querySelector('#btn-google'), null, 'no Connect button before a Client ID exists');
  assert.equal(root.querySelector('#cfg-volver-demo'), null);
  root.querySelector('#btn-demo').click();
  assert.equal(demo, 1);
  assert.equal(root.querySelectorAll('h1').length, 1);
});

test('configuration needed reached from the demo: Back to the demo instead of Try the demo, and a note that connecting closes it', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let volver = 0;
  const root = montar(
    acceso.configNecesaria({
      auth: { connect: async () => {} },
      onListo: () => {},
      onVolverDemo: () => {
        volver++;
      },
    }),
  );
  assert.equal(root.querySelector('#btn-demo'), null);
  const b = root.querySelector('#cfg-volver-demo');
  assert.equal(b.textContent.trim(), 'Volver a la demo');
  assert.equal([...root.querySelectorAll('button, a.btn')][0], b);
  assert.match(root.querySelector('.acc-owner').textContent, /se cierra la demo y se borran sus datos/);
  b.click();
  assert.equal(volver, 1);
});

test('wizard: accessible inline errors, live colour preview and no jumps when advancing', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let creado = null;
  let redibujo = null;
  const p = acceso.asistente({
    mount: (n) => montar(n),
    crear: async (d) => {
      creado = d;
    },
    redibujar: (fn) => {
      redibujo = fn;
    },
  });
  const root = c.container;
  assert.ok(redibujo);
  assert.match(root.textContent, /Paso 1 de 2/);
  root.querySelector('#as-siguiente').click();
  await tick(5);
  const nombre = root.querySelector('#as-nombre');
  assert.equal(nombre.getAttribute('aria-invalid'), 'true');
  assert.match(nombre.closest('.field').querySelector('.field-error').textContent, /Escribe el nombre del club/);
  nombre.value = 'Club Prueba';
  nombre.dispatchEvent(new window.Event('input', { bubbles: true }));
  root.querySelector('#as-siguiente').click();
  await tick(5);
  assert.match(root.textContent, /Paso 2 de 2/);
  const previa = root.querySelector('.acc-prev');
  assert.ok(previa, 'preview');
  assert.equal(previa.querySelector('.acc-prev-nombre').textContent, 'Club Prueba');
  const antes = previa.style.getPropertyValue('--c-action');
  const c1 = root.querySelector('#as-color1');
  c1.value = '#d81b60';
  c1.dispatchEvent(new window.Event('input', { bubbles: true }));
  const despues = previa.style.getPropertyValue('--c-action');
  assert.notEqual(despues, antes, 'the preview changes with the colour');
  assert.match(despues, /^#[0-9a-f]{6}$/i);
  assert.match(previa.style.getPropertyValue('--c-on-primary'), /^#[0-9a-f]{6}$/i);
  assert.equal(root.querySelector('.acc-foot [role="radiogroup"]') !== null, true);
  root.querySelector('#as-siguiente').click();
  await tick(5);
  const datos = await p;
  assert.equal(creado.nombre, 'Club Prueba');
  assert.equal(datos.colorPrimario, '#d81b60');
});

test('wizard: if Drive fails when creating the club the Google error is shown as an alert and can be retried', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let intentos = 0;
  acceso.asistente({
    mount: (n) => montar(n),
    crear: async () => {
      intentos++;
      const e = new Error('Drive off');
      e.code = 'api-desactivada';
      throw e;
    },
    redibujar: () => {},
  });
  const root = c.container;
  const nombre = root.querySelector('#as-nombre');
  nombre.value = 'Club';
  nombre.dispatchEvent(new window.Event('input', { bubbles: true }));
  root.querySelector('#as-siguiente').click();
  await tick(5);
  root.querySelector('#as-siguiente').click();
  await tick(10);
  assert.equal(intentos, 1);
  assert.ok(root.querySelector('.alert.alert--danger[data-codigo="api-desactivada"]'));
  assert.equal(root.querySelector('#as-siguiente').disabled, false);
});

test('club selector: uses "Desconectar Drive", no email or account', async () => {
  const acceso = await importApp('js/presentation/views/acceso.js');
  let elegido = null;
  const root = montar(
    acceso.selector({
      clubes: [
        { id: 'a', name: 'Club A' },
        { id: 'b', name: 'Club B' },
      ],
      onElegir: (x) => {
        elegido = x;
      },
      onCrear: () => {},
      onSalir: () => {},
    }),
  );
  assert.ok(botonPorTexto(root, 'Desconectar Drive'));
  assert.doesNotMatch(root.textContent, /@|sesi[oó]n|cuenta/i);
  root.querySelectorAll('.club-item')[1].click();
  assert.equal(elegido.id, 'b');
});
