/* ===========================================================
   economia.js — Calcolo di ricavi, costi e margine dai lavori del mese
   Funzioni pure: prendono i servizi e le tariffe e restituiscono i totali.
   Nessuna dipendenza dal DOM, così i conti sono verificabili e riutilizzabili.
     ricavi = ore lavorate × tariffa oraria del cliente
     costi  = ore lavorate × costo orario (interno/esterno) + rimborsi
              + ore di viaggio + costi fissi del mese
   Espone GL.economia
   =========================================================== */
window.GL = window.GL || {};

GL.economia = (function () {
  function arrotonda(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function vuotoGruppo(nome) {
    return { nome, ore: 0, ricavi: 0, costi: 0, servizi: 0, persone: 0 };
  }

  function chiudiGruppo(g) {
    const margine = g.ricavi - g.costi;
    return {
      ...g,
      ore: arrotonda(g.ore),
      ricavi: arrotonda(g.ricavi),
      costi: arrotonda(g.costi),
      margine: arrotonda(margine),
      marginePerc: g.ricavi > 0 ? arrotonda((margine / g.ricavi) * 100) : 0,
    };
  }

  function perValore(a, b) { return b.ricavi - a.ricavi || b.ore - a.ore; }

  /**
   * Riepilogo economico di un mese.
   * @param {Array} servizi  lavori caricati (GL.servizi.carica())
   * @param {Object} tariffe tariffe validate (GL.tariffe.carica())
   * @param {Object} periodo { anno, mese (0-11) }; se assente considera tutto
   */
  function riepilogo(servizi, tariffe, periodo) {
    const t = GL.tariffe.valida(tariffe);
    const lista = periodo
      ? GL.servizi.delMese(servizi || [], periodo.anno, periodo.mese)
      : (servizi || []).slice();

    const tot = {
      servizi: lista.length, ore: 0, oreInterne: 0, oreEsterne: 0,
      ricavi: 0, costoPersonale: 0, rimborsi: 0, oreViaggio: 0, costoViaggio: 0,
      serviziSenzaOre: 0, personeImpiegate: 0, giorniLavorati: 0,
    };
    const perCliente = new Map();
    const perAttivita = new Map();
    const perSocieta = new Map();
    const perGiorno = new Map();
    const perPersona = new Map();

    const gruppo = (mappa, nome) => {
      if (!mappa.has(nome)) mappa.set(nome, vuotoGruppo(nome));
      return mappa.get(nome);
    };

    lista.forEach((s) => {
      const ore = GL.servizi.orePersona(s);
      const persone = s.persone || [];
      if (GL.servizi.oreMancanti(s)) tot.serviziSenzaOre++;

      const tariffaCliente = GL.tariffe.ricavoOra(t, s);
      const ricavi = ore * persone.length * tariffaCliente;
      let costoPersonale = 0;
      persone.forEach((p) => {
        const costo = ore * GL.tariffe.costoOra(t, p);
        costoPersonale += costo;
        if (p.id) tot.oreInterne += ore; else tot.oreEsterne += ore;

        const chiave = p.id || "x:" + p.n;
        if (!perPersona.has(chiave)) {
          perPersona.set(chiave, {
            chiave, nome: p.n, esterno: !p.id, ore: 0, costo: 0, servizi: 0, giorni: new Set(),
          });
        }
        const voce = perPersona.get(chiave);
        voce.ore += ore;
        voce.costo += costo;
        voce.servizi++;
        if (s.data) voce.giorni.add(s.data);
      });

      const rimborsi = Number(s.rimborsi) || 0;
      const oreViaggio = Number(s.oreViaggio) || 0;
      const costoViaggio = oreViaggio * t.costoOraInterno;
      const costi = costoPersonale + rimborsi + costoViaggio;
      const oreLavorate = ore * persone.length;

      tot.ore += oreLavorate;
      tot.ricavi += ricavi;
      tot.costoPersonale += costoPersonale;
      tot.rimborsi += rimborsi;
      tot.oreViaggio += oreViaggio;
      tot.costoViaggio += costoViaggio;

      [
        [perCliente, s.cliente || "—"],
        [perAttivita, s.attivita || "—"],
        [perSocieta, s.societa || "—"],
        [perGiorno, s.data || "—"],
      ].forEach(([mappa, nome]) => {
        const g = gruppo(mappa, nome);
        g.ore += oreLavorate;
        g.ricavi += ricavi;
        g.costi += costi;
        g.servizi++;
        g.persone += persone.length;
      });
    });

    tot.personeImpiegate = perPersona.size;
    tot.giorniLavorati = Array.from(perGiorno.keys()).filter((d) => d !== "—").length;

    const costiFissi = t.costiFissiMese;
    const costiTotali = tot.costoPersonale + tot.rimborsi + tot.costoViaggio + costiFissi;
    const margine = tot.ricavi - costiTotali;

    const ordina = (mappa) => Array.from(mappa.values()).map(chiudiGruppo).sort(perValore);

    return {
      periodo: periodo || null,
      servizi: tot.servizi,
      serviziSenzaOre: tot.serviziSenzaOre,
      personeImpiegate: tot.personeImpiegate,
      giorniLavorati: tot.giorniLavorati,
      ore: arrotonda(tot.ore),
      oreInterne: arrotonda(tot.oreInterne),
      oreEsterne: arrotonda(tot.oreEsterne),
      ricavi: arrotonda(tot.ricavi),
      costoPersonale: arrotonda(tot.costoPersonale),
      rimborsi: arrotonda(tot.rimborsi),
      oreViaggio: arrotonda(tot.oreViaggio),
      costoViaggio: arrotonda(tot.costoViaggio),
      costiFissi: arrotonda(costiFissi),
      costiTotali: arrotonda(costiTotali),
      margine: arrotonda(margine),
      marginePerc: tot.ricavi > 0 ? arrotonda((margine / tot.ricavi) * 100) : 0,
      ricavoMedioOra: tot.ore > 0 ? arrotonda(tot.ricavi / tot.ore) : 0,
      costoMedioOra: tot.ore > 0 ? arrotonda(costiTotali / tot.ore) : 0,
      perCliente: ordina(perCliente),
      perAttivita: ordina(perAttivita),
      perSocieta: ordina(perSocieta),
      perGiorno: Array.from(perGiorno.values())
        .map(chiudiGruppo)
        .filter((g) => g.nome !== "—")
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      perPersona: Array.from(perPersona.values())
        .map((p) => ({
          chiave: p.chiave, nome: p.nome, esterno: p.esterno,
          ore: arrotonda(p.ore), costo: arrotonda(p.costo),
          servizi: p.servizi, giorni: p.giorni.size,
          costoOra: p.ore > 0 ? arrotonda(p.costo / p.ore) : 0,
        }))
        .sort((a, b) => b.ore - a.ore),
    };
  }

  // "1.234,50 €" — formato italiano, senza decimali sopra le mille per leggibilità.
  function euro(n, decimali) {
    const v = Number(n) || 0;
    const dec = decimali != null ? decimali : (Math.abs(v) >= 1000 ? 0 : 2);
    return v.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";
  }
  function ore(n) {
    const v = Math.round((Number(n) || 0) * 10) / 10;
    return v.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " h";
  }
  function percento(n) {
    return (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%";
  }

  // Esportazione CSV (separatore ";" per aprirlo direttamente in Excel italiano).
  function csv(riepilogoMese, titoloColonna) {
    const righe = [[titoloColonna, "Servizi", "Ore", "Ricavi", "Costi", "Margine", "Margine %"]];
    riepilogoMese.forEach((g) => {
      righe.push([
        g.nome, g.servizi, g.ore, g.ricavi, g.costi, g.margine, g.marginePerc,
      ]);
    });
    return righe
      .map((r) => r.map((c) => (typeof c === "number" ? String(c).replace(".", ",") : `"${String(c).replace(/"/g, '""')}"`)).join(";"))
      .join("\n");
  }

  return { riepilogo, euro, ore, percento, csv };
})();
