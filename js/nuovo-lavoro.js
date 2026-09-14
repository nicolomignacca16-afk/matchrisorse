/* ===========================================================
   nuovo-lavoro.js — Inserimento di un lavoro su più giorni e più persone
   Un solo modulo: cliente, attività, orario, i giorni del mese (chip
   selezionabili) e le persone (spunte). Al salvataggio nasce un servizio per
   ogni giorno scelto, con tutte le persone indicate. I lavori inseriti qui
   restano nel browser (localStorage) accanto a quelli importati dall'Excel.
   Uso:  GL.nuovoLavoro.monta({ dipendenti, servizi, mese, onSalvato })
         dipendenti/servizi/mese = funzioni che restituiscono lo stato corrente
   =========================================================== */
window.GL = window.GL || {};

GL.nuovoLavoro = (function () {
  const $ = (sel) => document.querySelector(sel);
  let opzioni = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function due(n) { return String(n).padStart(2, "0"); }

  function monta(o) {
    opzioni = o;
    $("#btn-nuovo-x").addEventListener("click", chiudi);
    $("#btn-nuovo-annulla").addEventListener("click", chiudi);
    $("#btn-nuovo-salva").addEventListener("click", salva);
    $("#modal-nuovo").addEventListener("click", (e) => { if (e.target.id === "modal-nuovo") chiudi(); });
    $("#nl-cerca").addEventListener("input", (e) => filtraPersone(e.target.value));
  }

  // ------------------------------------------------------------ apertura ---
  function apri() {
    const servizi = opzioni.servizi();
    const { anno, mese } = opzioni.mese();
    $("#nl-cliente").value = ""; $("#nl-indirizzo").value = ""; $("#nl-attivita").value = "";
    $("#nl-ora").value = "08:00"; $("#nl-orafine").value = ""; $("#nl-esterni").value = ""; $("#nl-note").value = "";
    $("#nl-cerca").value = "";
    $("#nl-stato").textContent = "";
    $("#nl-clienti").innerHTML = GL.servizi.clientiDistinti(servizi).map((c) => `<option value="${esc(c)}">`).join("");
    $("#nl-attivita-lista").innerHTML = GL.servizi.attivitaDistinte(servizi).map((a) => `<option value="${esc(a)}">`).join("");
    $("#nl-mese").textContent = `${GL.impegni.nomeMese(mese)} ${anno}`;
    renderGiorni(anno, mese);
    renderPersone();
    $("#modal-nuovo").hidden = false;
    $("#nl-cliente").focus();
  }

  function chiudi() { $("#modal-nuovo").hidden = true; }

  function renderGiorni(anno, mese) {
    const ultimo = new Date(anno, mese + 1, 0).getDate();
    const chips = [];
    for (let g = 1; g <= ultimo; g++) {
      const dow = new Date(anno, mese, g).getDay();
      const iso = `${anno}-${due(mese + 1)}-${due(g)}`;
      chips.push(`<button type="button" class="srv-pchip ${dow === 0 || dow === 6 ? "we" : ""}" data-iso="${iso}">${g}</button>`);
    }
    const cont = $("#nl-giorni");
    cont.innerHTML = chips.join("");
    cont.querySelectorAll(".srv-pchip").forEach((b) => b.addEventListener("click", () => b.classList.toggle("on")));
  }

  function renderPersone() {
    $("#nl-persone").innerHTML = opzioni.dipendenti()
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((d) => `<label data-nome="${esc(d.nome.toLowerCase())}"><input type="checkbox" value="${esc(d.id)}" /> ${esc(d.nome)}<small> · ${esc((d.mansioni || [])[0] || "")}</small></label>`)
      .join("");
  }

  // La ricerca nasconde chi non corrisponde ma non tocca le spunte già messe.
  function filtraPersone(testo) {
    const q = testo.trim().toLowerCase();
    $("#nl-persone").querySelectorAll("label").forEach((l) => {
      l.hidden = Boolean(q) && !l.dataset.nome.includes(q) && !l.querySelector("input").checked;
    });
  }

  // --------------------------------------------------------- salvataggio ---
  function leggiForm() {
    const dipendenti = opzioni.dipendenti();
    const interni = Array.from($("#nl-persone").querySelectorAll("input:checked"))
      .map((i) => dipendenti.find((d) => d.id === i.value))
      .filter(Boolean)
      .map((d) => ({ n: d.nome, id: d.id }));
    const esterni = $("#nl-esterni").value.split(",").map((s) => s.trim()).filter(Boolean)
      .map((n) => ({ n, id: null }));
    return {
      cliente: $("#nl-cliente").value.trim(),
      indirizzo: $("#nl-indirizzo").value.trim(),
      attivita: $("#nl-attivita").value.trim(),
      ora: $("#nl-ora").value,
      oraFine: $("#nl-orafine").value,
      note: $("#nl-note").value.trim(),
      date: Array.from($("#nl-giorni").querySelectorAll(".srv-pchip.on")).map((b) => b.dataset.iso),
      persone: interni.concat(esterni),
    };
  }

  function valida(f) {
    if (!f.cliente) return "Indica il cliente.";
    if (!f.attivita) return "Indica l'attività.";
    if (!GL.servizi.oraValida(f.ora)) return "Indica l'ora di inizio.";
    if (f.oraFine && !GL.servizi.durataDaOrari(f.ora, f.oraFine, "")) return "L'ora di fine non è valida.";
    if (!f.date.length) return "Seleziona almeno un giorno.";
    if (!f.persone.length) return "Seleziona almeno una persona.";
    return "";
  }

  function salva() {
    const stato = $("#nl-stato");
    const f = leggiForm();
    const errore = valida(f);
    if (errore) { stato.textContent = "⚠️ " + errore; stato.className = "form-stato errore"; return; }
    try {
      const nuovi = GL.servizi.nuoviServizi(f);
      GL.servizi.aggiungiManuali(nuovi);
    } catch (e) {
      console.error("Salvataggio lavoro fallito:", e);
      stato.textContent = "⚠️ Non sono riuscito a salvare: " + e.message; stato.className = "form-stato errore";
      return;
    }
    chiudi();
    opzioni.onSalvato(f.date[0]);
  }

  return { monta, apri };
})();
