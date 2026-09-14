/* ===========================================================
   servizi.js — I lavori del mese importati dall'Excel
   Un "servizio" = un lavoro in una data, con le persone che lo svolgono.
     { id, data:"YYYY-MM-DD", cliente, indirizzo, attivita,
       ora, oraFine, pausa, ore (per persona), risorse,
       persone:[{n:"Nome Cognome", id:"r12"|null}],
       cat, societa, oreViaggio, rimborsi, note }
   Le persone arrivano già assegnate dal file (colonna NOMINATIVO): chi non è
   in anagrafica ha id = null ed è trattato come risorsa esterna/interinale.
   Legenda colori (ricavata dalla ricorrenza del cantiere nel mese):
     verde   = fisso mensile (>= 15 giorni)
     azzurro = fisso alcuni giorni (6–14 giorni)
     viola   = ricorrente/settimanale (2–5 giorni)
     bianco  = spot / una tantum
   Espone tutto sotto il namespace globale GL.servizi
   =========================================================== */
window.GL = window.GL || {};

GL.servizi = (function () {
  const STORAGE_OREFINE = "gl_servizi_orefine_v2"; // ore di fine corrette nel gestionale
  const STORAGE_MANUALI = "gl_servizi_manuali_v1"; // lavori inseriti a mano nel gestionale

  const CATEGORIE = [
    { id: "verde",   nome: "Fisso mensile",       desc: "Cantiere presente quasi tutti i giorni del mese" },
    { id: "azzurro", nome: "Fisso alcuni giorni", desc: "Cantiere presente 6–14 giorni nel mese" },
    { id: "viola",   nome: "Ricorrente",          desc: "Cantiere presente 2–5 giorni nel mese" },
    { id: "bianco",  nome: "Spot / una tantum",   desc: "Lavoro presente un solo giorno nel mese" },
  ];
  const CAT_INDEX = {};
  CATEGORIE.forEach((c, i) => { CAT_INDEX[c.id] = i; });

  function catMeta(id) { return CATEGORIE[CAT_INDEX[id]] || CATEGORIE[3]; }

  // Dataset di esempio (usato solo se NON è presente il file reale).
  const SERVIZI_DEMO = [
    { id: "sd1", data: "", cliente: "Cliente Alfa", indirizzo: "Via Roma 1, Milano", attivita: "Pulizie", ora: "18:00", oraFine: "20:00", ore: 2, risorse: 1, persone: [{ n: "Mario Rossi", id: null }], cat: "verde", societa: "", note: "" },
    { id: "sd2", data: "", cliente: "Cliente Beta", indirizzo: "Via Dante 10, Milano", attivita: "Facchinaggio", ora: "08:00", oraFine: "16:00", ore: 8, risorse: 1, persone: [{ n: "Luca Bianchi", id: null }], cat: "bianco", societa: "", note: "" },
  ];

  function importati() {
    return window.GL_SERVIZI_REALI && window.GL_SERVIZI_REALI.length
      ? window.GL_SERVIZI_REALI
      : SERVIZI_DEMO;
  }
  // Tutti i lavori: quelli importati dall'Excel più quelli inseriti a mano.
  // Stesso id in entrambi (es. manuale già incluso in un file cifrato): vince la copia locale.
  function base() {
    const perId = new Map();
    importati().concat(caricaManuali()).forEach((s) => perId.set(s.id, s));
    return Array.from(perId.values());
  }

  // ------------------------------------------------ lavori inseriti a mano ---
  function caricaManuali() {
    try {
      const lista = JSON.parse(localStorage.getItem(STORAGE_MANUALI) || "[]");
      return Array.isArray(lista) ? lista.filter((s) => s && s.id && s.data) : [];
    } catch (e) {
      console.error("Lavori inseriti a mano non leggibili:", e);
      return [];
    }
  }
  function salvaManuali(lista) { localStorage.setItem(STORAGE_MANUALI, JSON.stringify(lista)); }
  function aggiungiManuali(nuovi) { salvaManuali(caricaManuali().concat(nuovi)); }
  function rimuoviManuale(id) { salvaManuali(caricaManuali().filter((s) => s.id !== id)); }

  // Categoria dalla ricorrenza nel mese (stessa regola dell'import da Excel).
  function categoriaPerGiorni(n) {
    if (n >= 15) return "verde";
    if (n >= 6) return "azzurro";
    if (n >= 2) return "viola";
    return "bianco";
  }

  // Costruisce un servizio per ogni data scelta, con le stesse persone (funzione pura).
  // form = { cliente, indirizzo, attivita, ora, oraFine, note, date: [ISO], persone: [{n,id}] }
  function nuoviServizi(form) {
    const ore = form.oraFine ? durataDaOrari(form.ora, form.oraFine, "") : null;
    const cat = categoriaPerGiorni(form.date.length);
    const radice = "m" + Date.now().toString(36);
    return form.date.slice().sort().map((data, i) => ({
      id: `${radice}-${i}`,
      data,
      cliente: form.cliente,
      indirizzo: form.indirizzo || "",
      attivita: form.attivita,
      ora: form.ora,
      oraFine: form.oraFine || "",
      pausa: "",
      ore: ore ? Math.round(ore * 100) / 100 : 0,
      risorse: form.persone.length,
      persone: form.persone.map((p) => ({ n: p.n, id: p.id || null })),
      cat,
      societa: "",
      note: form.note || "",
      manuale: true,
    }));
  }

  function clona(obj) { return JSON.parse(JSON.stringify(obj)); }

  // ---------------------------------------------------------------- orari ---
  function oraValida(hhmm) { return typeof hhmm === "string" && /^\d{1,2}:\d{2}$/.test(hhmm); }

  function minuti(hhmm) {
    if (!oraValida(hhmm)) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  // Durata inizio→fine in ore, gestendo il turno che passa la mezzanotte e la pausa.
  function durataDaOrari(ora, oraFine, pausa) {
    const a = minuti(ora), b = minuti(oraFine);
    if (a == null || b == null) return null;
    let tot = (b - a + 1440) % 1440;
    if (!tot) return null;
    const p = (pausa || "").split(/[–-]/);
    const pa = minuti((p[0] || "").trim()), pb = minuti((p[1] || "").trim());
    if (pa != null && pb != null) {
      const dur = (pb - pa + 1440) % 1440;
      if (dur > 0 && dur < tot) tot -= dur;
    }
    return tot / 60;
  }

  // Ore di UNA persona sul servizio (l'Excel riporta il totale ore per riga).
  function orePersona(s) { return Number(s.ore) > 0 ? Number(s.ore) : 0; }
  // Ore complessive del servizio (tutte le persone impiegate).
  function oreTotali(s) { return orePersona(s) * (s.risorse || 0); }
  // Servizio senza ore leggibili nel file: vanno completate a mano.
  function oreMancanti(s) { return !(Number(s.ore) > 0); }

  // Intervallo occupato nella giornata, in minuti. Senza ora di inizio il
  // lavoro non è temporizzato e viene considerato "tutto il giorno".
  function intervallo(s) {
    const start = minuti(s.ora);
    if (start == null) return { start: 0, end: 1440, untimed: true };
    const dur = durataDaOrari(s.ora, s.oraFine, s.pausa) || orePersona(s) || 1;
    return { start, end: start + dur * 60, untimed: false };
  }

  function fasciaOraria(s) {
    if (!oraValida(s.ora)) return "orario da definire";
    return s.oraFine ? `${s.ora}–${s.oraFine}` : `dalle ${s.ora}`;
  }

  // ------------------------------------------------------- caricamento dati ---
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

  // Carica i servizi applicando le ore di fine corrette nel gestionale:
  // se l'utente cambia la fine, le ore vengono ricalcolate di conseguenza.
  function carica() {
    const oreFine = leggiMappa(STORAGE_OREFINE);
    return base().map((s) => {
      const copia = clona(s);
      copia.persone = Array.isArray(copia.persone) ? copia.persone : [];
      copia.risorse = copia.risorse || copia.persone.length;
      const corretta = typeof oreFine[s.id] === "string" ? oreFine[s.id] : "";
      if (!corretta) return copia;
      const ore = durataDaOrari(copia.ora, corretta, copia.pausa);
      return ore ? { ...copia, oraFine: corretta, ore: Math.round(ore * 100) / 100, oreStimate: false } : copia;
    });
  }

  // Salva SOLO la mappa idServizio -> "HH:MM" corretta a mano (dati leggeri).
  function salvaOreFine(lista) {
    const m = {};
    lista.forEach((s) => {
      if (!s.oraFine) return;
      const originale = base().find((b) => b.id === s.id);
      if (!originale || originale.oraFine !== s.oraFine) m[s.id] = s.oraFine;
    });
    localStorage.setItem(STORAGE_OREFINE, JSON.stringify(m));
  }

  // Mese (0-11) e anno del primo servizio con data: la vista si apre sui dati.
  function meseIniziale() {
    const date = base().map((s) => s.data).filter(Boolean).sort();
    if (!date.length) { const o = new Date(); return { anno: o.getFullYear(), mese: o.getMonth() }; }
    const [y, m] = date[0].split("-");
    return { anno: Number(y), mese: Number(m) - 1 };
  }

  function delMese(servizi, anno, mese /* 0-11 */) {
    const prefisso = `${anno}-${String(mese + 1).padStart(2, "0")}`;
    return servizi.filter((s) => s.data && s.data.startsWith(prefisso));
  }

  // Servizi di un giorno ("YYYY-MM-DD"), ordinati per ora e poi per cliente.
  function delGiorno(servizi, giorno) {
    return servizi
      .filter((s) => s.data === giorno)
      .slice()
      .sort((a, b) => {
        const oa = a.ora || "99:99", ob = b.ora || "99:99";
        if (oa !== ob) return oa.localeCompare(ob);
        return (a.cliente || "").localeCompare(b.cliente || "");
      });
  }

  function contaPerCategoria(servizi, giorno) {
    const c = { verde: 0, azzurro: 0, viola: 0, bianco: 0 };
    servizi.forEach((s) => { if (s.data === giorno && c[s.cat] != null) c[s.cat]++; });
    return c;
  }

  function attivitaDistinte(servizi) {
    return Array.from(new Set(servizi.map((s) => s.attivita).filter(Boolean))).sort();
  }

  function clientiDistinti(servizi) {
    return Array.from(new Set(servizi.map((s) => s.cliente).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  // ------------------------------------------------------ persone al lavoro ---
  // Chi lavora in un giorno: una voce per persona con i suoi servizi.
  // Vale sia per il personale in anagrafica sia per gli esterni (id = null).
  function personeGiorno(servizi, giorno) {
    const perChiave = new Map();
    delGiorno(servizi, giorno).forEach((s) => {
      (s.persone || []).forEach((p) => {
        const chiave = p.id || "x:" + p.n;
        if (!perChiave.has(chiave)) {
          perChiave.set(chiave, { chiave, nome: p.n, dipId: p.id || null, servizi: [], ore: 0 });
        }
        const voce = perChiave.get(chiave);
        voce.servizi.push(s);
        voce.ore += orePersona(s);
      });
    });
    return Array.from(perChiave.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // Tutte le persone che compaiono nei servizi: [{ chiave, nome }] in ordine alfabetico.
  function personeDistinte(servizi) {
    const m = new Map();
    servizi.forEach((s) => (s.persone || []).forEach((p) => {
      const chiave = p.id || "x:" + p.n;
      if (!m.has(chiave)) m.set(chiave, { chiave, nome: p.n });
    }));
    return Array.from(m.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // Un servizio è svolto (anche) dalla persona con quella chiave?
  function haPersona(s, chiave) {
    return (s.persone || []).some((p) => (p.id || "x:" + p.n) === chiave);
  }

  // Tutti i servizi di una persona (per chiave: id dipendente oppure "x:Nome").
  function serviziPersona(servizi, chiave) {
    return servizi
      .filter((s) => haPersona(s, chiave))
      .sort((a, b) => (a.data + (a.ora || "")).localeCompare(b.data + (b.ora || "")));
  }

  // Impegni derivati dai lavori, per dipendente in anagrafica:
  // { idDipendente: [{ id, dal, al, titolo, note, servizioId }] }.
  // Servono a calendario, ricerca personale e conteggio ore settimanali.
  function impegniPerDipendente(servizi) {
    const m = {};
    servizi.forEach((s) => {
      if (!s.data) return;
      const iv = intervallo(s);
      const dal = s.data + "T" + fmtMinuti(Math.min(iv.start, 1439));
      const al = s.data + "T" + fmtMinuti(Math.min(Math.max(iv.end, iv.start + 1), 1439));
      (s.persone || []).forEach((p) => {
        if (!p.id) return;
        (m[p.id] = m[p.id] || []).push({
          id: "srv-" + s.id + "-" + p.id,
          dal, al,
          titolo: s.cliente + " · " + s.attivita,
          note: s.indirizzo,
          ore: orePersona(s),
          servizioId: s.id,
          daServizio: true,
        });
      });
    });
    Object.keys(m).forEach((k) => m[k].sort((a, b) => a.dal.localeCompare(b.dal)));
    return m;
  }

  function fmtMinuti(min) {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  // --- Ponte servizio → ricerca personale: mappa l'attività alle mansioni ---
  const MAP_MANSIONI = {
    "Pulizie": ["pulizi"],
    "Pulizie vetri": ["pulizi"],
    "Pulizie e presidio": ["pulizi"],
    "Presidio": ["pulizi", "affari generali"],
    "Facchinaggio": ["facchin", "spostamento merci", "magazzino", "imballaggio"],
    "Facchinaggio e pulizie": ["facchin", "pulizi"],
    "Facchinaggio e montaggio": ["facchin", "manovali", "edilizia"],
    "Montaggio": ["manovali", "edilizia", "magazzino"],
    "Smontaggio": ["manovali", "edilizia", "magazzino"],
    "Supporto montaggio": ["manovali", "edilizia", "magazzino"],
    "Imbiancatura": ["manovali", "edilizia"],
    "Imbiancatura e pulizie": ["manovali", "edilizia", "pulizi"],
    "Magazziniere": ["magazzino", "logistica di magazzino", "spostamento di merci"],
    "Confezionamento": ["imballaggio", "magazzino"],
    "Consegna materiale": ["facchin", "spostamento merci", "magazzino"],
    "Trasporto": ["facchin", "spostamento merci"],
    "Trasloco": ["facchin", "spostamento merci"],
    "Assist. ascensori": ["manovali", "edilizia"],
  };

  function mansioniPerAttivita(attivita, mansioniDisponibili) {
    const chiavi = MAP_MANSIONI[attivita] || [];
    if (!chiavi.length) return [];
    return mansioniDisponibili.filter((m) => {
      const low = m.toLowerCase();
      return chiavi.some((k) => low.includes(k));
    });
  }

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
    CATEGORIE, catMeta, carica, salvaOreFine, meseIniziale,
    delMese, delGiorno, contaPerCategoria, attivitaDistinte, clientiDistinti,
    orePersona, oreTotali, oreMancanti, intervallo, fasciaOraria, durataDaOrari, oraValida,
    personeGiorno, personeDistinte, haPersona, serviziPersona, impegniPerDipendente,
    nuoviServizi, aggiungiManuali, rimuoviManuale, categoriaPerGiorni,
    mansioniPerAttivita, candidatiPerAttivita,
  };
})();
