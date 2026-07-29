/* ===========================================================
   tariffe.js — Tariffe di vendita e costi orari (impostazioni economiche)
   Il file dei lavori contiene le ORE, non gli euro: i valori economici si
   ottengono moltiplicando le ore per le tariffe impostate qui.
     { ricavoOra, costoOraInterno, costoOraEsterno, costiFissiMese,
       perCliente: { "MANENTI": 27, ... } }
   Salvate nel browser (localStorage). Espone GL.tariffe
   =========================================================== */
window.GL = window.GL || {};

GL.tariffe = (function () {
  const STORAGE_KEY = "gl_tariffe_v1";

  // Valori di partenza: vanno adeguati ai propri contratti dalla vista "Costi & Ricavi".
  const DEFAULT = Object.freeze({
    ricavoOra: 25,          // € fatturati per ora di lavoro (tariffa media)
    costoOraInterno: 16,    // € di costo azienda per ora di un dipendente
    costoOraEsterno: 22,    // € di costo per ora di interinali / ditte esterne
    costiFissiMese: 0,      // € di costi fissi mensili (sede, mezzi, struttura)
    perCliente: {},         // tariffa oraria specifica per cliente
  });

  function numero(v, fallback) {
    const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
    return typeof n === "number" && isFinite(n) && n >= 0 ? n : fallback;
  }

  // Normalizza qualunque oggetto (anche proveniente da localStorage o dal file
  // cifrato) in tariffe valide: nessun valore negativo o non numerico.
  function valida(t) {
    const base = t && typeof t === "object" ? t : {};
    const perCliente = {};
    const src = base.perCliente && typeof base.perCliente === "object" ? base.perCliente : {};
    Object.keys(src).forEach((k) => {
      const n = numero(src[k], null);
      if (n != null) perCliente[k] = n;
    });
    return {
      ricavoOra: numero(base.ricavoOra, DEFAULT.ricavoOra),
      costoOraInterno: numero(base.costoOraInterno, DEFAULT.costoOraInterno),
      costoOraEsterno: numero(base.costoOraEsterno, DEFAULT.costoOraEsterno),
      costiFissiMese: numero(base.costiFissiMese, DEFAULT.costiFissiMese),
      perCliente,
    };
  }

  function carica() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return valida(JSON.parse(raw));
    } catch (e) {
      console.error("Tariffe non leggibili, uso i valori predefiniti:", e);
    }
    return valida(window.GL_TARIFFE || DEFAULT);
  }

  function salva(t) {
    const pulite = valida(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pulite));
    return pulite;
  }

  function ripristina() {
    localStorage.removeItem(STORAGE_KEY);
    return valida(window.GL_TARIFFE || DEFAULT);
  }

  // Aggiorna un campo restituendo SEMPRE un nuovo oggetto (nessuna mutazione).
  function conCampo(t, campo, valore) {
    return valida({ ...t, [campo]: valore });
  }
  function conCliente(t, cliente, valore) {
    const perCliente = { ...t.perCliente };
    if (valore === "" || valore == null) delete perCliente[cliente];
    else perCliente[cliente] = numero(valore, t.ricavoOra);
    return valida({ ...t, perCliente });
  }

  // Tariffa oraria di vendita applicata a un servizio.
  function ricavoOra(t, servizio) {
    const perCli = t.perCliente[servizio.cliente];
    return perCli != null ? perCli : t.ricavoOra;
  }
  // Costo orario di una persona: interno se in anagrafica, esterno altrimenti.
  function costoOra(t, persona) {
    return persona && persona.id ? t.costoOraInterno : t.costoOraEsterno;
  }

  return { DEFAULT, carica, salva, ripristina, valida, conCampo, conCliente, ricavoOra, costoOra };
})();
