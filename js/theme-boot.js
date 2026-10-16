// Runs WITHOUT modules, synchronously in <head> (before first paint) to avoid a theme flash.
// Reads the mirrored preference ('cnl:tema' = 'light' | 'dark'; anything else = automatic) and applies it to <html>.
// The source of truth is preferencias.json in the user's Drive (see js/theme.js).
(function () {
  try {
    var t = localStorage.getItem('cnl:tema');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: automatic mode */ }
})();
