/* ===========================================================
   elenco-view.js — Modalità "Elenco": una riga per lavoro, tutto il periodo
   Data · cliente · attività · orario · persone (nomi) · ore, raggruppate per
   giorno. Pensata per rispondere subito a "chi è andato da X nel mese?" e
   "dove ha lavorato Y?": i filtri li applica chi chiama, qui si disegna solo.
   Uso:  GL.elencoView.render({ contenitore, lista, evidenzia, onApri })
         evidenzia = chiave della persona filtrata (id o "x:Nome"), opzionale
         GL.elencoView.personeHtml(s, evidenzia) → nomi delle persone di un lavoro
   =========================================================== */
window.GL = window.GL || {};

GL.elencoView = (function () {
  const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function giornoSettimana(iso) {
    return GIORNI[new Date(iso + "T00:00").getDay()];
  }

  function persone(s, evidenzia) {
    const lista = s.persone || [];
    if (!lista.length) return `<i class="el-nessuno">nessuno indicato</i>`;
    return lista
      .map((p) => {
        const cls = ["el-persona", p.id ? "" : "esterna", (p.id || "x:" + p.n) === evidenzia ? "on" : ""].join(" ");
        return `<span class="${cls}" title="${p.id ? "" : "risorsa esterna / interinale"}">${esc(p.n)}</span>`;
      })
      .join("");
  }

  function ore(s) {
    if (GL.servizi.oreMancanti(s)) return `<span class="el-ore manca" title="Ore non presenti nel file">—</span>`;
    const tot = GL.servizi.oreTotali(s), aTesta = GL.servizi.orePersona(s);
    const tip = (s.risorse || 0) > 1 ? `${GL.impegni.oreFmt(aTesta)} a testa` : "";
    return `<span class="el-ore" title="${tip}">${GL.impegni.oreFmt(tot)}</span>`;
  }

  function riga(s, evidenzia) {
    const dove = s.indirizzo && !/^https?:\/\//i.test(s.indirizzo) ? `<small>${esc(s.indirizzo)}</small>` : "";
    return `
      <tr class="el-riga srv-cat-${esc(s.cat)}" data-srv="${esc(s.id)}" title="Apri la scheda del lavoro">
        <td class="el-data">${esc(s.data.slice(8))} <span>${giornoSettimana(s.data)}</span></td>
        <td class="el-cli"><b>${esc(s.cliente)}</b>${dove}</td>
        <td class="el-att">${esc(s.attivita)}</td>
        <td class="el-ora">${esc(GL.servizi.fasciaOraria(s))}</td>
        <td class="el-pers">${persone(s, evidenzia)}</td>
        <td class="el-tot">${ore(s)}</td>
      </tr>`;
  }

  function intestazioneGiorno(iso, lista) {
    const turni = lista.reduce((t, s) => t + (s.risorse || 0), 0);
    const oreTot = lista.reduce((t, s) => t + GL.servizi.oreTotali(s), 0);
    return `
      <tr class="el-giorno"><td colspan="6">
        <b>${giornoSettimana(iso)} ${GL.impegni.formattaData(iso)}</b>
        <span>${lista.length} lavori · ${turni} turni · ${GL.impegni.oreFmt(oreTot)}</span>
      </td></tr>`;
  }

  function render({ contenitore, lista, evidenzia, onApri }) {
    const giorni = Array.from(new Set(lista.map((s) => s.data).filter(Boolean))).sort();
    if (!giorni.length) {
      contenitore.innerHTML = `<p class="vuoto">Nessun lavoro nel periodo con i filtri attuali.</p>`;
      return;
    }
    const corpo = giorni.map((iso) => {
      const delGiorno = GL.servizi.delGiorno(lista, iso);
      return intestazioneGiorno(iso, delGiorno) + delGiorno.map((s) => riga(s, evidenzia)).join("");
    }).join("");

    contenitore.innerHTML = `
      <div class="el-wrap"><table class="el-tab">
        <thead><tr>
          <th>Data</th><th>Cliente</th><th>Attività</th><th>Orario</th><th>Persone</th><th>Ore</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
      </table></div>`;
    contenitore.querySelectorAll(".el-riga[data-srv]").forEach((tr) => {
      tr.addEventListener("click", () => onApri(tr.dataset.srv));
    });
  }

  return { render, personeHtml: persone };
})();
