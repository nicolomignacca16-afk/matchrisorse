/* ===========================================================
   servizi.js — Servizi (lavori) importati dall'Excel, vista per giornata
   Ribalta la logica: si parte dal SERVIZIO (non dal dipendente).
   Un "servizio" = una richiesta di lavoro in una data, con N risorse.
     { id, data:"YYYY-MM-DD", cliente, indirizzo, attivita, ora,
       risorse (persone richieste), cat, societa, note, assegnati:[idDip] }
   Legenda colori (dall'Excel):
     verde   = fisso mensile (lun–ven / lun–dom)
     azzurro = fisso solo alcuni giorni della settimana
     viola   = settimanale (richiesta di settimana in settimana)
     bianco  = spot / varie (telefonata, email, messaggio, preventivo confermato)
   Espone tutto sotto il namespace globale GL.servizi
   =========================================================== */
window.GL = window.GL || {};

GL.servizi = (function () {
  const STORAGE_KEY = "gl_servizi_v1";        // assegnazioni fatte nella demo
  const STORAGE_OREFINE = "gl_servizi_orefine_v1"; // ore di fine inserite nel gestionale

  // Metadati delle 4 categorie (ordine = ordine di visualizzazione).
  const CATEGORIE = [
    { id: "verde",   nome: "Fisso mensile",       desc: "Lavori fissi tutto il mese (lun–ven / lun–dom)" },
    { id: "azzurro", nome: "Fisso alcuni giorni", desc: "Lavori fissi solo alcuni giorni della settimana" },
    { id: "viola",   nome: "Settimanale",         desc: "Richiesta fatta di settimana in settimana" },
    { id: "bianco",  nome: "Spot / varie",        desc: "Telefonata, email, messaggio o preventivo confermato" },
  ];
  const CAT_INDEX = {};
  CATEGORIE.forEach((c, i) => { CAT_INDEX[c.id] = i; });

  function catMeta(id) { return CATEGORIE[CAT_INDEX[id]] || CATEGORIE[3]; }

  // Dataset di esempio (usato solo se NON è presente il file reale).
  const SERVIZI_DEMO = [
    { id: "sd1", data: "", cliente: "Cliente Alfa", indirizzo: "Via Roma 1, Milano", attivita: "Pulizie",      ora: "18:00", risorse: 2, cat: "verde",   societa: "", note: "" },
    { id: "sd2", data: "", cliente: "Cliente Beta", indirizzo: "Via Dante 10, Milano", attivita: "Facchinaggio", ora: "08:00", risorse: 3, cat: "bianco",  societa: "", note: "" },
  ];

  // Base servizi: reali (window.GL_SERVIZI_REALI) se presenti, altrimenti demo.
  function base() {
    return window.GL_SERVIZI_REALI && window.GL_SERVIZI_REALI.length
      ? window.GL_SERVIZI_REALI
      : SERVIZI_DEMO;
  }

  function clona(obj) { return JSON.parse(JSON.stringify(obj)); }

  function leggiMappa(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) {
      console.error("Dati servizi non leggibili (" + key + "):", e);
    }
    return {};
  }

  // Carica i servizi arricchendoli con assegnazioni e ore di fine salvate localmente.
  function carica() {
    const assegnazioni = leggiMappa(STORAGE_KEY);
    const oreFine = leggiMappa(STORAGE_OREFINE);
    return base().map((s) => ({
      ...clona(s),
      assegnati: Array.isArray(assegnazioni[s.id]) ? assegnazioni[s.id].slice() : [],
      oraFine: typeof oreFine[s.id] === "string" ? oreFine[s.id] : "",
    }));
  }

  // Salva SOLO la mappa idServizio -> [idDipendente] (dati leggeri, non i servizi).
  function salvaAssegnazioni(lista) {
    const m = {};
    lista.forEach((s) => { if (s.assegnati && s.assegnati.length) m[s.id] = s.assegnati; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  }

  // Salva SOLO la mappa idServizio -> "HH:MM" (ora di fine inserita nel gestionale).
  function salvaOreFine(lista) {
    const m = {};
    lista.forEach((s) => { if (s.oraFine) m[s.id] = s.oraFine; });
    localStorage.setItem(STORAGE_OREFINE, JSON.stringify(m));
  }

  // Mese (0-11) e anno del primo servizio con data: così la vista si apre dove ci sono i dati.
  function meseIniziale() {
    const date = base().map((s) => s.data).filter(Boolean).sort();
    if (!date.length) { const o = new Date(); return { anno: o.getFullYear(), mese: o.getMonth() }; }
    const [y, m] = date[0].split("-");
    return { anno: Number(y), mese: Number(m) - 1 };
  }

  // Servizi di un giorno ("YYYY-MM-DD"), ordinati per categoria e poi per ora.
  function delGiorno(servizi, giorno) {
    return servizi
      .filter((s) => s.data === giorno)
      .slice()
      .sort((a, b) => {
        const ca = CAT_INDEX[a.cat] ?? 9, cb = CAT_INDEX[b.cat] ?? 9;
        if (ca !== cb) return ca - cb;
        return (a.ora || "99:99").localeCompare(b.ora || "99:99");
      });
  }

  // Conteggio servizi per categoria in un giorno (per le barre nel calendario).
  function contaPerCategoria(servizi, giorno) {
    const c = { verde: 0, azzurro: 0, viola: 0, bianco: 0 };
    servizi.forEach((s) => { if (s.data === giorno && c[s.cat] != null) c[s.cat]++; });
    return c;
  }

  // Elenco attività distinte presenti (per il filtro a tendina).
  function attivitaDistinte(servizi) {
    return Array.from(new Set(servizi.map((s) => s.attivita).filter(Boolean))).sort();
  }

  // --- Ponte servizio → ricerca personale: mappa l'attività alle mansioni dei dipendenti ---
  const MAP_MANSIONI = {
    "Pulizie": ["pulizi"],
    "Facchinaggio": ["facchin", "spostamento merci", "magazzino", "imballaggio"],
    "Montaggio": ["manovali", "edilizia", "magazzino"],
    "Magazziniere": ["magazzino", "logistica di magazzino", "spostamento di merci"],
    "Confezionamento": ["imballaggio", "magazzino"],
    "Assist. ascensori": ["manovali", "edilizia"],
    "Assistenza": ["affari generali", "amministrativo"],
  };
  // Restituisce le mansioni reali (dai dipendenti) che meglio corrispondono all'attività.
  function mansioniPerAttivita(attivita, mansioniDisponibili) {
    const chiavi = MAP_MANSIONI[attivita] || [];
    if (!chiavi.length) return [];
    return mansioniDisponibili.filter((m) => {
      const low = m.toLowerCase();
      return chiavi.some((k) => low.includes(k));
    });
  }

  // Dipendenti candidati a svolgere una certa attività (per l'assegnazione automatica).
  // Se l'attività non ha una mappa dedicata, sono candidati tutti.
  function candidatiPerAttivita(dipendenti, attivita) {
    const chiavi = MAP_MANSIONI[attivita] || [];
    if (!chiavi.length) return dipendenti.slice();
    return dipendenti.filter((d) =>
      (d.mansioni || []).some((m) => {
        const low = m.toLowerCase();
        return chiavi.some((k) => low.includes(k));
      })
    );
  }

  return {
    CATEGORIE, catMeta, carica, salvaAssegnazioni, salvaOreFine, meseIniziale,
    delGiorno, contaPerCategoria, attivitaDistinte,
    mansioniPerAttivita, candidatiPerAttivita,
  };
})();
