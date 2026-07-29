/* ===========================================================
   economia-view.js — Vista "Costi & Ricavi": visione d'insieme del mese
   Mostra ricavi, costi e margine calcolati dalle ore dei lavori e dalle
   tariffe impostate qui dentro. Modulo autonomo: costruisce da solo il
   contenuto del contenitore e riaggancia i propri eventi a ogni render.
   Uso:  GL.economiaView.monta({ contenitore, servizi: () => [...] })
   =========================================================== */
window.GL = window.GL || {};

GL.economiaView = (function () {
  const { euro, ore: fmtOre, percento } = GL.economia;

  let cont = null;
  let getServizi = () => [];
  let anno = 0, mese = 0;
  let tariffe = null;
  let scheda = "cliente"; // cliente | attivita | persona | societa

  const SCHEDE = [
    { id: "cliente",  nome: "Per cliente",   campo: "perCliente",  colonna: "Cliente" },
    { id: "attivita", nome: "Per attività",  campo: "perAttivita", colonna: "Attività" },
    { id: "persona",  nome: "Per persona",   campo: "perPersona",  colonna: "Persona" },
    { id: "societa",  nome: "Per società",   campo: "perSocieta",  colonna: "Società" },
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  const $ = (sel) => cont.querySelector(sel);

  function monta(opzioni) {
    cont = opzioni.contenitore;
    getServizi = opzioni.servizi;
    tariffe = GL.tariffe.carica();
    const mi = GL.servizi.meseIniziale();
    anno = mi.anno;
    mese = mi.mese;
  }

  function vaiAMese(nuovoAnno, nuovoMese) {
    anno = nuovoAnno;
    mese = nuovoMese;
    render();
  }

  function cambiaMese(delta) {
    let m = mese + delta, a = anno;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    vaiAMese(a, m);
  }

  // ------------------------------------------------------------- rendering ---
  function render() {
    if (!cont) return;
    const servizi = getServizi() || [];
    const r = GL.economia.riepilogo(servizi, tariffe, { anno, mese });
    const clienti = GL.servizi.clientiDistinti(GL.servizi.delMese(servizi, anno, mese));

    cont.innerHTML = `
      <div class="eco-top">
        <div class="eco-nav">
          <button id="eco-prev" class="btn ghost" title="Mese precedente">‹</button>
          <h2 id="eco-titolo">${esc(GL.impegni.nomeMese(mese))} ${anno}</h2>
          <button id="eco-next" class="btn ghost" title="Mese successivo">›</button>
        </div>
        <p class="eco-sub">Ricavi e costi calcolati dalle <b>ore realmente lavorate</b> nel mese
          moltiplicate per le tariffe impostate qui a destra.</p>
        <button id="eco-csv" class="btn ghost" title="Scarica il dettaglio in CSV (apribile in Excel)">⬇️ Esporta CSV</button>
      </div>

      ${kpiHtml(r)}

      <div class="eco-layout">
        <div class="eco-main">
          ${graficoHtml(r)}
          ${tabellaHtml(r)}
        </div>
        <aside class="eco-side">
          ${tariffeHtml(r, clienti)}
        </aside>
      </div>`;

    aggancia(r);
  }

  function kpiHtml(r) {
    const segno = r.margine >= 0 ? "pos" : "neg";
    return `
      <div class="eco-kpi">
        <div class="eco-card ricavi">
          <span class="eco-card-tit">Entrate (fatturato)</span>
          <b class="eco-card-val">${esc(euro(r.ricavi))}</b>
          <span class="eco-card-sub">${esc(fmtOre(r.ore))} lavorate · ${esc(euro(r.ricavoMedioOra, 2))}/h medi</span>
        </div>
        <div class="eco-card costi">
          <span class="eco-card-tit">Uscite (costi)</span>
          <b class="eco-card-val">${esc(euro(r.costiTotali))}</b>
          <span class="eco-card-sub">personale ${esc(euro(r.costoPersonale))}${r.rimborsi ? " · rimborsi " + esc(euro(r.rimborsi)) : ""}${r.costiFissi ? " · fissi " + esc(euro(r.costiFissi)) : ""}</span>
        </div>
        <div class="eco-card margine ${segno}">
          <span class="eco-card-tit">Margine</span>
          <b class="eco-card-val">${esc(euro(r.margine))}</b>
          <span class="eco-card-sub">${esc(percento(r.marginePerc))} sul fatturato</span>
        </div>
        <div class="eco-card info">
          <span class="eco-card-tit">Attività del mese</span>
          <b class="eco-card-val">${r.servizi}</b>
          <span class="eco-card-sub">lavori · ${r.personeImpiegate} persone · ${r.giorniLavorati} giorni</span>
        </div>
        <div class="eco-card info">
          <span class="eco-card-tit">Ore interne / esterne</span>
          <b class="eco-card-val">${esc(fmtOre(r.oreInterne))}<span class="eco-card-vs"> / ${esc(fmtOre(r.oreEsterne))}</span></b>
          <span class="eco-card-sub">${r.oreEsterne > 0 ? esc(percento((r.oreEsterne / (r.ore || 1)) * 100)) + " coperto da esterni" : "tutto personale interno"}</span>
        </div>
      </div>
      ${r.serviziSenzaOre ? `<p class="eco-avviso">⚠️ ${r.serviziSenzaOre} lavori del mese non hanno le ore nel file: contano 0 nei calcoli. Aprili dalla vista <b>Lavori</b> e inserisci l'ora di fine per includerli.</p>` : ""}`;
  }

  function graficoHtml(r) {
    if (!r.perGiorno.length) {
      return `<div class="eco-box"><p class="vuoto">Nessun lavoro in questo mese.</p></div>`;
    }
    const max = Math.max(...r.perGiorno.map((g) => Math.max(g.ricavi, g.costi)), 1);
    const barre = r.perGiorno
      .map((g) => {
        const giorno = Number(g.nome.split("-")[2]);
        const hr = Math.max(2, (g.ricavi / max) * 100);
        const hc = Math.max(2, (g.costi / max) * 100);
        const tip = `${GL.impegni.formattaData(g.nome)} — entrate ${euro(g.ricavi)} · costi ${euro(g.costi)} · margine ${euro(g.margine)}`;
        return `
          <div class="eco-gcol" title="${esc(tip)}">
            <div class="eco-gbars">
              <span class="eco-gbar ric" style="height:${hr}%"></span>
              <span class="eco-gbar cos" style="height:${hc}%"></span>
            </div>
            <span class="eco-gday">${giorno}</span>
          </div>`;
      })
      .join("");
    return `
      <div class="eco-box">
        <div class="eco-box-head">
          <h3>Andamento giornaliero</h3>
          <span class="eco-leg"><i class="ric"></i> entrate <i class="cos"></i> costi</span>
        </div>
        <div class="eco-grafico">${barre}</div>
      </div>`;
  }

  function tabellaHtml(r) {
    const tabs = SCHEDE
      .map((s) => `<button class="eco-tab ${scheda === s.id ? "on" : ""}" data-scheda="${s.id}">${esc(s.nome)}</button>`)
      .join("");
    const corpo = scheda === "persona" ? tabellaPersone(r) : tabellaGruppi(r);
    return `
      <div class="eco-box">
        <div class="eco-box-head">
          <h3>Dettaglio</h3>
          <div class="eco-tabs">${tabs}</div>
        </div>
        ${corpo}
      </div>`;
  }

  function tabellaGruppi(r) {
    const def = SCHEDE.find((s) => s.id === scheda);
    const righe = r[def.campo];
    if (!righe.length) return `<p class="vuoto">Nessun dato per questo mese.</p>`;
    const maxRic = Math.max(...righe.map((g) => g.ricavi), 1);
    return `
      <table class="eco-tab-dati">
        <thead>
          <tr>
            <th>${esc(def.colonna)}</th><th class="num">Lavori</th><th class="num">Ore</th>
            <th class="num">Entrate</th><th class="num">Costi</th><th class="num">Margine</th><th class="num">%</th>
          </tr>
        </thead>
        <tbody>
          ${righe.map((g) => `
            <tr>
              <td class="eco-nome">
                <span class="eco-barra" style="width:${Math.round((g.ricavi / maxRic) * 100)}%"></span>
                <span class="eco-nome-txt">${esc(g.nome)}</span>
              </td>
              <td class="num">${g.servizi}</td>
              <td class="num">${esc(fmtOre(g.ore))}</td>
              <td class="num">${esc(euro(g.ricavi))}</td>
              <td class="num">${esc(euro(g.costi))}</td>
              <td class="num ${g.margine >= 0 ? "pos" : "neg"}">${esc(euro(g.margine))}</td>
              <td class="num ${g.marginePerc >= 0 ? "pos" : "neg"}">${esc(percento(g.marginePerc))}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function tabellaPersone(r) {
    const righe = r.perPersona;
    if (!righe.length) return `<p class="vuoto">Nessuna persona impiegata in questo mese.</p>`;
    const maxOre = Math.max(...righe.map((p) => p.ore), 1);
    return `
      <table class="eco-tab-dati">
        <thead>
          <tr>
            <th>Persona</th><th>Tipo</th><th class="num">Giorni</th><th class="num">Lavori</th>
            <th class="num">Ore</th><th class="num">Costo</th><th class="num">€/h</th>
          </tr>
        </thead>
        <tbody>
          ${righe.map((p) => `
            <tr>
              <td class="eco-nome">
                <span class="eco-barra" style="width:${Math.round((p.ore / maxOre) * 100)}%"></span>
                <span class="eco-nome-txt">${esc(p.nome)}</span>
              </td>
              <td><span class="eco-pill ${p.esterno ? "est" : "int"}">${p.esterno ? "esterno" : "interno"}</span></td>
              <td class="num">${p.giorni}</td>
              <td class="num">${p.servizi}</td>
              <td class="num">${esc(fmtOre(p.ore))}</td>
              <td class="num">${esc(euro(p.costo))}</td>
              <td class="num">${esc(euro(p.costoOra, 2))}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function tariffeHtml(r, clienti) {
    const campo = (id, etichetta, valore, nota) => `
      <label class="eco-campo">
        <span>${esc(etichetta)}</span>
        <input type="number" min="0" step="0.5" id="${id}" value="${valore}" />
        ${nota ? `<small>${esc(nota)}</small>` : ""}
      </label>`;
    const perCliente = clienti
      .map((c) => {
        const v = tariffe.perCliente[c];
        return `
          <div class="eco-cli">
            <span class="eco-cli-nome" title="${esc(c)}">${esc(c)}</span>
            <input type="number" min="0" step="0.5" class="eco-cli-input" data-cliente="${esc(c)}"
                   value="${v != null ? v : ""}" placeholder="${tariffe.ricavoOra}" />
          </div>`;
      })
      .join("");
    return `
      <div class="eco-box eco-tariffe">
        <div class="eco-box-head"><h3>Tariffe e costi</h3></div>
        <p class="eco-hint">Il file dei lavori contiene le ore, non gli euro: imposta qui i valori
          e tutti i conti si aggiornano.</p>
        ${campo("eco-ricavo", "Tariffa oraria di vendita (€/h)", tariffe.ricavoOra, "usata per i clienti senza tariffa dedicata")}
        ${campo("eco-costo-int", "Costo orario personale interno (€/h)", tariffe.costoOraInterno, "dipendenti presenti in anagrafica")}
        ${campo("eco-costo-est", "Costo orario esterni / interinali (€/h)", tariffe.costoOraEsterno, "nominativi non presenti in anagrafica")}
        ${campo("eco-fissi", "Costi fissi del mese (€)", tariffe.costiFissiMese, "sede, mezzi, struttura")}
        <button id="eco-reset" class="btn ghost eco-reset">Ripristina valori predefiniti</button>

        <h4 class="eco-sub-tit">Tariffa per cliente (€/h)</h4>
        <p class="eco-hint">Lascia vuoto per usare la tariffa generale (${esc(euro(tariffe.ricavoOra, 2))}/h).</p>
        <div class="eco-clienti">${perCliente || '<p class="vuoto">Nessun cliente nel mese.</p>'}</div>
      </div>`;
  }

  // --------------------------------------------------------------- eventi ---
  function aggancia(r) {
    $("#eco-prev").addEventListener("click", () => cambiaMese(-1));
    $("#eco-next").addEventListener("click", () => cambiaMese(1));
    $("#eco-csv").addEventListener("click", () => esportaCsv(r));

    cont.querySelectorAll(".eco-tab[data-scheda]").forEach((b) => {
      b.addEventListener("click", () => { scheda = b.dataset.scheda; render(); });
    });

    const campi = [
      ["#eco-ricavo", "ricavoOra"],
      ["#eco-costo-int", "costoOraInterno"],
      ["#eco-costo-est", "costoOraEsterno"],
      ["#eco-fissi", "costiFissiMese"],
    ];
    campi.forEach(([sel, campo]) => {
      $(sel).addEventListener("change", (e) => {
        tariffe = GL.tariffe.salva(GL.tariffe.conCampo(tariffe, campo, e.target.value));
        render();
      });
    });

    $("#eco-reset").addEventListener("click", () => {
      if (!confirm("Ripristinare le tariffe predefinite? Le tariffe per cliente verranno azzerate.")) return;
      tariffe = GL.tariffe.ripristina();
      render();
    });

    cont.querySelectorAll(".eco-cli-input[data-cliente]").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        tariffe = GL.tariffe.salva(GL.tariffe.conCliente(tariffe, inp.dataset.cliente, e.target.value));
        render();
      });
    });
  }

  function esportaCsv(r) {
    const def = SCHEDE.find((s) => s.id === scheda);
    const testo = scheda === "persona"
      ? csvPersone(r.perPersona)
      : GL.economia.csv(r[def.campo], def.colonna);
    const nome = `costi-ricavi-${anno}-${String(mese + 1).padStart(2, "0")}-${scheda}.csv`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + testo], { type: "text/csv;charset=utf-8" }));
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function csvPersone(righe) {
    const testa = ["Persona", "Tipo", "Giorni", "Lavori", "Ore", "Costo", "Costo orario"];
    const corpo = righe.map((p) => [
      p.nome, p.esterno ? "esterno" : "interno", p.giorni, p.servizi, p.ore, p.costo, p.costoOra,
    ]);
    return [testa, ...corpo]
      .map((r) => r.map((c) => (typeof c === "number" ? String(c).replace(".", ",") : `"${String(c).replace(/"/g, '""')}"`)).join(";"))
      .join("\n");
  }

  return { monta, render, vaiAMese };
})();
