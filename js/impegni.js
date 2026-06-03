/* ===========================================================
   impegni.js — Occupazioni con data E ORA, disponibilità e calendario
   Un "impegno" (un lavoro) = periodo con orario:
     { id, dal: "YYYY-MM-DDTHH:MM", al: "YYYY-MM-DDTHH:MM", note }
   Si possono avere più impegni nello stesso giorno (fasce orarie diverse).
   Espone tutto sotto il namespace globale GL.impegni
   =========================================================== */
window.GL = window.GL || {};

GL.impegni = (function () {
  const MESI = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];

  function due(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`; }

  function oggiISO() { return iso(new Date()); } // data "YYYY-MM-DD"
  function adessoISO() {
    const d = new Date();
    return `${iso(d)}T${due(d.getHours())}:${due(d.getMinutes())}`; // "YYYY-MM-DDTHH:MM"
  }

  function dataParte(s) { return (s || "").slice(0, 10); }
  function oraParte(s) { const t = (s || "").split("T")[1]; return t ? t.slice(0, 5) : ""; }

  // Occupato in un preciso istante (data+ora). Confronto fra stringhe ISO = cronologico.
  function occupatoIstante(dip, istante) {
    return (dip.impegni || []).some((i) => istante >= i.dal && istante <= i.al);
  }
  function impegnoIstante(dip, istante) {
    return (dip.impegni || []).find((i) => istante >= i.dal && istante <= i.al) || null;
  }

  // Occupato in un qualunque momento del giorno (data "YYYY-MM-DD").
  function occupatoGiorno(dip, giorno) {
    return (dip.impegni || []).some((i) => dataParte(i.dal) <= giorno && giorno <= dataParte(i.al));
  }
  function impegniGiorno(dip, giorno) {
    return (dip.impegni || [])
      .filter((i) => dataParte(i.dal) <= giorno && giorno <= dataParte(i.al))
      .slice()
      .sort((a, b) => (a.dal < b.dal ? -1 : 1));
  }

  // Griglia del mese in celle (settimane lun→dom); celle vuote = null.
  function grigliaMese(anno, mese /* 0-11 */) {
    const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
    const offset = (new Date(anno, mese, 1).getDay() + 6) % 7; // lunedì = 0
    const celle = [];
    for (let i = 0; i < offset; i++) celle.push(null);
    for (let g = 1; g <= giorniNelMese; g++) celle.push(iso(new Date(anno, mese, g)));
    while (celle.length % 7 !== 0) celle.push(null);
    return celle;
  }

  function formattaData(dataISO) {
    const [y, m, g] = dataISO.split("-");
    return `${g}/${m}/${y}`;
  }
  function formattaDataOra(s) {
    if (!s) return "";
    const t = oraParte(s);
    return formattaData(dataParte(s)) + (t ? " " + t : "");
  }

  // Etichetta leggibile di un impegno (compatta se nello stesso giorno).
  function descrivi(i) {
    if (dataParte(i.dal) === dataParte(i.al)) {
      return `${formattaData(dataParte(i.dal))}, ${oraParte(i.dal)}–${oraParte(i.al)}`;
    }
    return `${formattaDataOra(i.dal)} → ${formattaDataOra(i.al)}`;
  }

  function nomeMese(mese) { return MESI[mese]; }
  function nuovoId() { return "i" + Date.now() + "-" + Math.floor(Math.random() * 10000); }

  // --- Calcolo ore assegnate per settimana (per gli alert sul contratto) ---
  function oreImpegno(i) {
    const ms = new Date(i.dal.length === 10 ? i.dal + "T00:00" : i.dal) -
               new Date(i.al.length === 10 ? i.al + "T00:00" : i.al);
    const ore = Math.abs(ms) / 3600000;
    return ore > 0 ? ore : 0;
  }
  // Lunedì (ISO) della settimana che contiene la data "YYYY-MM-DD".
  function lunediISO(isoDate) {
    const d = new Date(isoDate + "T00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
  }
  // Mappa settimana(lunedì) -> ore totali assegnate (impegni attribuiti alla settimana d'inizio).
  function orePerSettimana(dip) {
    const m = {};
    (dip.impegni || []).forEach((i) => {
      const wk = lunediISO(dataParte(i.dal));
      m[wk] = (m[wk] || 0) + oreImpegno(i);
    });
    return m;
  }
  // Settimane in cui le ore superano quelle contrattuali.
  function settimaneSovraccarico(dip) {
    const contr = parseFloat(dip.orarioContrattuale);
    if (!contr || isNaN(contr)) return [];
    const m = orePerSettimana(dip);
    return Object.keys(m)
      .filter((wk) => m[wk] > contr + 0.001)
      .sort()
      .map((wk) => ({ settimana: wk, ore: m[wk], contrattuali: contr }));
  }
  function oreFmt(h) {
    return (Math.round(h * 10) / 10).toString().replace(".", ",") + "h";
  }

  return {
    iso, oggiISO, adessoISO, dataParte, oraParte,
    occupatoIstante, impegnoIstante, occupatoGiorno, impegniGiorno,
    grigliaMese, formattaData, formattaDataOra, descrivi, nomeMese, nuovoId,
    oreImpegno, orePerSettimana, settimaneSovraccarico, oreFmt,
  };
})();
