/* ===========================================================
   data.js — Mansioni, dati di esempio e persistenza locale
   Espone tutto sotto il namespace globale GL.data
   =========================================================== */
window.GL = window.GL || {};

GL.data = (function () {
  // v2: include i dati reali importati da Excel (vedi js/dipendenti-reali.js)
  const STORAGE_KEY = "gl_dipendenti_v2";

  // Mansioni di esempio (usate solo se NON sono stati importati dati reali).
  const MANSIONI_DEFAULT = [
    "Pulizie",
    "Manutenzione",
    "Elettricista",
    "Idraulico",
    "Giardinaggio",
    "Reception/Portineria",
    "Sicurezza",
    "Facchinaggio",
    "Disinfestazione",
  ];
  // Mansioni correnti: reali (window.GL_MANSIONI) se presenti, altrimenti esempio.
  // Funzione (non costante) così funziona anche dopo lo sblocco dei dati cifrati.
  function mansioni() {
    return window.GL_MANSIONI && window.GL_MANSIONI.length ? window.GL_MANSIONI : MANSIONI_DEFAULT;
  }

  // Dati di esempio: azienda tipo nell'area di Milano.
  // Le coordinate sono già pre-calcolate così la mappa si popola subito.
  const SEED_DEMO = [
    { id: "e1",  nome: "Marco Rossi",       telefono: "333 1112221", mansioni: ["Pulizie", "Facchinaggio"],            indirizzo: "Navigli, Milano",            lat: 45.4480, lng: 9.1750, stato: "Disponibile" },
    { id: "e2",  nome: "Giulia Bianchi",    telefono: "333 1112222", mansioni: ["Reception/Portineria"],               indirizzo: "Duomo, Milano",              lat: 45.4642, lng: 9.1900, stato: "Disponibile" },
    { id: "e3",  nome: "Luca Ferrari",      telefono: "333 1112223", mansioni: ["Elettricista", "Manutenzione"],       indirizzo: "Lambrate, Milano",           lat: 45.4850, lng: 9.2360, stato: "Occupato" },
    { id: "e4",  nome: "Sara Conti",        telefono: "333 1112224", mansioni: ["Pulizie"],                            indirizzo: "Porta Romana, Milano",       lat: 45.4500, lng: 9.2050, stato: "Disponibile" },
    { id: "e5",  nome: "Antonio Russo",     telefono: "333 1112225", mansioni: ["Idraulico", "Manutenzione"],          indirizzo: "Sesto San Giovanni",         lat: 45.5340, lng: 9.2400, stato: "Disponibile" },
    { id: "e6",  nome: "Elena Greco",       telefono: "333 1112226", mansioni: ["Giardinaggio"],                       indirizzo: "Cinisello Balsamo",          lat: 45.5580, lng: 9.2180, stato: "Disponibile" },
    { id: "e7",  nome: "Davide Costa",      telefono: "333 1112227", mansioni: ["Sicurezza"],                          indirizzo: "San Donato Milanese",        lat: 45.4180, lng: 9.2680, stato: "Occupato" },
    { id: "e8",  nome: "Francesca Marino",  telefono: "333 1112228", mansioni: ["Pulizie", "Disinfestazione"],         indirizzo: "Corsico, Milano",            lat: 45.4340, lng: 9.1130, stato: "Disponibile" },
    { id: "e9",  nome: "Matteo Galli",      telefono: "333 1112229", mansioni: ["Elettricista"],                       indirizzo: "Rho, Milano",                lat: 45.5310, lng: 9.0410, stato: "Disponibile" },
    { id: "e10", nome: "Chiara Lombardi",   telefono: "333 1112230", mansioni: ["Reception/Portineria", "Pulizie"],    indirizzo: "Cologno Monzese",            lat: 45.5300, lng: 9.2780, stato: "Disponibile" },
    { id: "e11", nome: "Simone Bruno",      telefono: "333 1112231", mansioni: ["Manutenzione", "Facchinaggio"],       indirizzo: "Bollate, Milano",            lat: 45.5430, lng: 9.1170, stato: "Occupato" },
    { id: "e12", nome: "Alessia Moretti",   telefono: "333 1112232", mansioni: ["Giardinaggio", "Pulizie"],            indirizzo: "Monza",                      lat: 45.5845, lng: 9.2744, stato: "Disponibile" },
  ];

  // Seed corrente: reale (window.GL_SEED) se presente, altrimenti esempio.
  function seed() {
    return window.GL_SEED && window.GL_SEED.length ? window.GL_SEED : SEED_DEMO;
  }

  // Carica i dipendenti dal browser; se vuoto, inizializza con gli esempi.
  function carica() {
    try {
      const SEED = seed();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        salva(SEED);
        return SEED.map(clona);
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return SEED.map(clona);
      // Arricchisce i record salvati con i campi statici aggiornati dal seed
      // (es. formazione, contratto), preservando i dati dinamici già inseriti
      // (impegni, modifiche). I dati salvati hanno la precedenza sui campi comuni.
      const perId = {};
      SEED.forEach((s) => { perId[s.id] = s; });
      return parsed.map((d) => {
        const s = perId[d.id];
        return s ? { ...clona(s), ...clona(d) } : clona(d);
      });
    } catch (e) {
      console.error("Errore lettura dati, uso gli esempi:", e);
      return SEED.map(clona);
    }
  }

  // Salva sempre una copia (pattern immutabile: nessuna mutazione esterna).
  function salva(lista) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  }

  function ripristinaEsempi() {
    const SEED = seed();
    salva(SEED);
    return SEED.map(clona);
  }

  function nuovoId() {
    return "e" + Date.now();
  }

  function clona(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  return { mansioni, carica, salva, ripristinaEsempi, nuovoId, clona };
})();
