# language: es
@calendario
Característica: Calendario en modo demo
  La demo no se conecta con Google: la sincronización se explica en lugar de quedar en gris sin motivo

  Escenario: En modo demo la sincronización con Google Calendar está desactivada y se explica
    Dado que la aplicación está abierta sin Client ID de Google
    Cuando pulso "Probar la demo"
    Y abro el módulo "Calendario"
    Entonces la sincronización con Google Calendar está desactivada y se explica
    Y veo el texto "El modo demo guarda los datos solo en este navegador"
