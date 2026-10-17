// Keyboard support for a tab list (WAI-ARIA tabs pattern): Left/Right (and Up/Down), Home and End move to the neighbouring tab and
// activate it. Works on any element whose children are [role="tab"] buttons (give the list an id if clicking a tab redraws it); tabs keep working with the pointer as plain buttons.
export function teclasTabs(lista) {
  lista.addEventListener('keydown', (e) => {
    const tabs = [...lista.querySelectorAll('[role="tab"]:not([disabled])')];
    const i = tabs.indexOf(e.target.closest?.('[role="tab"]'));
    if (i < 0) return;
    const ir = {
      ArrowRight: (i + 1) % tabs.length,
      ArrowDown: (i + 1) % tabs.length,
      ArrowLeft: (i - 1 + tabs.length) % tabs.length,
      ArrowUp: (i - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[e.key];
    if (ir === undefined) return;
    e.preventDefault();
    tabs[ir].click();
    // the click may redraw the whole list: focus the same position in the (possibly new) list
    const vivo = lista.isConnected ? lista : (lista.id && document.getElementById(lista.id)) || lista;
    const nuevos = [...vivo.querySelectorAll('[role="tab"]:not([disabled])')];
    (nuevos[ir] || tabs[ir]).focus();
  });
  return lista;
}
