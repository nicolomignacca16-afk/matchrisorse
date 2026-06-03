/* ===========================================================
   app.js — Interfaccia: ricerca/ranking, dipendenti, calendario, periodi
   =========================================================== */
(function () {
  let MANSIONI = [];
  const $ = (sel) => document.querySelector(sel);

  // --------- Stato applicativo ---------
  let dipendenti = [];
  let map = null;
  let layerMarker = null;
  let markerPerId = {};
  let editId = null;
  let impegniDipId = null;
  let suggCorrenti = [];
  let lavoroSelezionato = null;
  let calAnno = 0, calMese = 0;
  let calGiornoSel = null;

  document.addEventListener("DOMContentLoaded", bootstrap);

  // All'avvio: se i dati sono cifrati (sito pubblicato) chiede la password,
  // altrimenti parte subito (uso locale o dati di esempio).
  function bootstrap() {
    if (window.GL_SEED && window.GL_SEED.length) return init();
    if (window.GL_CIFRATO) return mostraLogin();
    return init();
  }

  function mostraLogin() {
    const overlay = $("#login");
    overlay.hidden = false;
    $("#login-pwd").focus();
    const entra = async () => {
      const pwd = $("#login-pwd").value;
      if (!pwd) return;
      setStato($("#login-err"), "Verifico…", "");
      try {
        const dati = await GL.auth.decifra(pwd, window.GL_CIFRATO);
        window.GL_SEED = dati.seed;
        window.GL_MANSIONI = dati.mansioni;
        overlay.hidden = true;
        init();
      } catch (e) {
        setStato($("#login-err"), "Password errata. Riprova.", "errore");
      }
    };
    $("#login-btn").addEventListener("click", entra);
    $("#login-pwd").addEventListener("keydown", (e) => { if (e.key === "Enter") entra(); });
  }

  function init() {
    MANSIONI = GL.data.mansioni();
    dipendenti = GL.data.carica();
    popolaMansioniRichieste();
    const oggi = new Date();
    calAnno = oggi.getFullYear();
    calMese = oggi.getMonth();
    calGiornoSel = GL.impegni.oggiISO();
    initMappa();
    bindEventi();
    initDatePicker();
    renderListaDipendenti();
    aggiornaStatoApp();
  }

  // Selettori data+ora personalizzati (al posto dei picker nativi del browser).
  function initDatePicker() {
    GL.datepicker.init($("#input-data"), { placeholder: "Scegli data e ora" });
    GL.datepicker.init($("#imp-dal"), { placeholder: "Inizio: data e ora" });
    GL.datepicker.init($("#imp-al"), { placeholder: "Fine (facoltativa)" });
    GL.datepicker.setValue($("#input-data"), GL.impegni.oggiISO() + "T08:00");
  }

  // ============================================================
  //  Mappa
  // ============================================================
  function initMappa() {
    map = L.map("map", { zoomControl: true }).setView([45.4642, 9.19], 11);
    // Stile "Positron" (chiaro e minimal) — CARTO basemaps, gratuito, senza chiave.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      detectRetina: true,
      attribution: "© OpenStreetMap, © CARTO",
    }).addTo(map);
    layerMarker = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ============================================================
  //  Eventi e navigazione
  // ============================================================
  function bindEventi() {
    $("#tab-cerca").addEventListener("click", () => mostraVista("cerca"));
    $("#tab-dipendenti").addEventListener("click", () => mostraVista("dipendenti"));
    $("#tab-calendario").addEventListener("click", () => mostraVista("calendario"));

    $("#form-cerca").addEventListener("submit", onCerca);
    $("#input-indirizzo").addEventListener("input", onInputIndirizzo);
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#suggerimenti") && e.target.id !== "input-indirizzo") nascondiSuggerimenti();
    });

    $("#cerca-dip").addEventListener("input", (e) => renderListaDipendenti(e.target.value));
    $("#btn-aggiungi").addEventListener("click", () => apriModale(null));
    $("#btn-reset").addEventListener("click", onRipristina);

    $("#btn-annulla").addEventListener("click", chiudiModale);
    $("#btn-chiudi-x").addEventListener("click", chiudiModale);
    $("#modal-form").addEventListener("submit", onSalvaDipendente);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") chiudiModale(); });

    $("#btn-impegni-x").addEventListener("click", chiudiImpegni);
    $("#btn-impegni-chiudi").addEventListener("click", chiudiImpegni);
    $("#btn-impegni-aggiungi").addEventListener("click", aggiungiImpegno);
    $("#modal-impegni").addEventListener("click", (e) => { if (e.target.id === "modal-impegni") chiudiImpegni(); });

    // Proteggi sito (genera file cifrato)
    $("#btn-proteggi").addEventListener("click", apriPwd);
    $("#btn-pwd-x").addEventListener("click", chiudiPwd);
    $("#btn-pwd-annulla").addEventListener("click", chiudiPwd);
    $("#btn-pwd-genera").addEventListener("click", generaProtetto);
    $("#modal-pwd").addEventListener("click", (e) => { if (e.target.id === "modal-pwd") chiudiPwd(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { chiudiModale(); chiudiImpegni(); chiudiPwd(); }
    });

    $("#cal-prev").addEventListener("click", () => cambiaMese(-1));
    $("#cal-next").addEventListener("click", () => cambiaMese(1));
    $("#cal-oggi").addEventListener("click", vaiAOggi);
  }

  function mostraVista(quale) {
    $("#view-cerca").hidden = quale !== "cerca";
    $("#view-dipendenti").hidden = quale !== "dipendenti";
    $("#view-calendario").hidden = quale !== "calendario";
    $("#tab-cerca").classList.toggle("active", quale === "cerca");
    $("#tab-dipendenti").classList.toggle("active", quale === "dipendenti");
    $("#tab-calendario").classList.toggle("active", quale === "calendario");
    if (quale === "cerca") setTimeout(() => map.invalidateSize(), 100);
    else if (quale === "dipendenti") renderListaDipendenti($("#cerca-dip").value);
    else if (quale === "calendario") renderCalendario();
  }

  function popolaMansioniRichieste() {
    $("#mansioni-richieste").innerHTML = MANSIONI.map(
      (m, i) => `<label><input type="checkbox" value="${esc(m)}" ${i === 0 ? "checked" : ""}/> ${esc(m)}</label>`
    ).join("");
  }

  // ============================================================
  //  Ricerca + ranking
  // ============================================================
  async function onCerca(e) {
    e.preventDefault();
    nascondiSuggerimenti();
    const stato = $("#form-stato");
    const btn = $("#btn-cerca");
    const mansioniRichieste = Array.from($("#mansioni-richieste").querySelectorAll("input:checked")).map((i) => i.value);
    const soloDisponibili = $("#check-disponibili").checked;
    const raggio = parseFloat($("#input-raggio").value);
    const quando = GL.datepicker.getValue($("#input-data")) || (GL.impegni.oggiISO() + "T08:00");

    if (!mansioniRichieste.length) return setStato(stato, "⚠️ Seleziona almeno una mansione richiesta.", "errore");

    setStato(stato, "Cerco l'indirizzo…", "");
    btn.disabled = true;
    try {
      const lavoro = lavoroSelezionato || (await GL.geo.geocodifica($("#input-indirizzo").value));
      const gruppi = calcolaGruppi(lavoro, mansioniRichieste, soloDisponibili, raggio, quando);
      renderMappa(lavoro, unioneCandidati(gruppi));
      renderRisultati(gruppi, quando);
      setStato(stato, "📍 Lavoro: " + (lavoro.etichetta || "posizione trovata"), "ok");
    } catch (err) {
      setStato(stato, "⚠️ " + err.message, "errore");
    } finally {
      btn.disabled = false;
    }
  }

  // Per ogni mansione richiesta, i candidati ordinati (disponibili prima, poi per distanza).
  function calcolaGruppi(lavoro, mansioniRichieste, soloDisponibili, raggio, quando) {
    return mansioniRichieste.map((mansione) => ({
      mansione,
      candidati: dipendenti
        .filter((d) => d.mansioni.includes(mansione))
        .map((d) => {
          const occupato = GL.impegni.occupatoIstante(d, quando);
          const imp = occupato ? GL.impegni.impegnoIstante(d, quando) : null;
          return {
            ...d,
            distanza: GL.geo.distanzaKm(lavoro, d),
            occupato,
            noteImpegno: imp ? (imp.note || "occupato") + " (" + GL.impegni.descrivi(imp) + ")" : "",
          };
        })
        .filter((d) => (soloDisponibili ? !d.occupato : true))
        .filter((d) => (raggio > 0 ? d.distanza <= raggio : true))
        .sort((a, b) => {
          const ao = a.occupato ? 1 : 0;
          const bo = b.occupato ? 1 : 0;
          return ao !== bo ? ao - bo : a.distanza - b.distanza;
        }),
    }));
  }

  // Unione senza duplicati dei candidati di tutti i gruppi (per i marker sulla mappa).
  function unioneCandidati(gruppi) {
    const visti = {};
    const out = [];
    gruppi.forEach((g) => g.candidati.forEach((c) => {
      if (!visti[c.id]) { visti[c.id] = true; out.push(c); }
    }));
    return out;
  }

  function renderRisultati(gruppi, quando) {
    const cont = $("#risultati");
    const meta = $("#risultati-meta");
    const tot = gruppi.reduce((s, g) => s + g.candidati.length, 0);
    const plur = gruppi.length === 1 ? "mansione richiesta" : "mansioni richieste";
    meta.textContent = `${GL.impegni.formattaDataOra(quando)} · ${gruppi.length} ${plur}`;
    if (!tot) {
      cont.innerHTML = `<div class="vuoto">Nessun dipendente trovato con questi criteri.</div>`;
      return;
    }
    cont.innerHTML = gruppi
      .map((g) => `
        <div class="ris-gruppo">
          <div class="ris-gruppo-tit">${esc(g.mansione)} · ${g.candidati.length}</div>
          ${g.candidati.length
            ? g.candidati.map((d, i) => cardCandidato(d, i)).join("")
            : `<div class="vuoto">Nessun candidato per questa mansione con questi criteri.</div>`}
        </div>`)
      .join("");
    cont.querySelectorAll(".ris-card").forEach((el) => {
      el.addEventListener("click", () => {
        const m = markerPerId[el.dataset.id];
        if (m) { map.setView(m.getLatLng(), 14, { animate: true }); m.openTooltip(); }
      });
    });
  }

  function cardCandidato(d, i) {
    const occ = d.occupato;
    const badge = occ ? `<span class="badge occ">Occupato</span>` : `<span class="badge disp">Disponibile</span>`;
    const tel = d.telefono ? `📞 ${esc(d.telefono)}` : "";
    const dist = (d.approssimato ? "~" : "") + GL.geo.formatta(d.distanza);
    const comp = d.competenze ? `<div class="ris-comp">🛠 ${esc(d.competenze)}</div>` : "";
    const note = occ && d.noteImpegno ? `<div class="ris-comp">📅 ${esc(d.noteImpegno)}</div>` : "";
    return `
      <div class="ris-card ${occ ? "occupato" : ""}" data-id="${d.id}">
        <div class="ris-head">
          <span class="ris-nome"><span class="ris-rank">${i + 1}</span>${esc(d.nome)}</span>
          <span class="ris-dist" title="${d.approssimato ? "indirizzo approssimato al comune" : "distanza in linea d'aria"}">${dist}</span>
        </div>
        <div class="ris-mansioni">${esc(d.mansioni.join(" · "))}</div>
        ${comp}${note}
        <div class="ris-foot">${badge}<span>${tel}</span></div>
      </div>`;
  }

  function renderMappa(lavoro, lista) {
    layerMarker.clearLayers();
    markerPerId = {};
    const pin = L.divIcon({ className: "", html: '<div class="pin-lavoro">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] });
    L.marker([lavoro.lat, lavoro.lng], { icon: pin })
      .addTo(layerMarker)
      .bindTooltip("Luogo del lavoro", { className: "tt", direction: "top", offset: [0, -28] });

    const punti = [[lavoro.lat, lavoro.lng]];
    lista.forEach((d) => {
      const colore = d.occupato ? "#dc2626" : "#16a34a";
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 9, color: "#fff", weight: 2, fillColor: colore, fillOpacity: 1,
      })
        .addTo(layerMarker)
        .bindTooltip(
          `<b>${esc(d.nome)}</b><br>${esc(d.mansioni.join(", "))}<br>${(d.approssimato ? "~" : "") + GL.geo.formatta(d.distanza)} · ${d.occupato ? "Occupato" : "Disponibile"}`,
          { className: "tt", direction: "top" }
        );
      markerPerId[d.id] = marker;
      punti.push([d.lat, d.lng]);
    });
    if (punti.length > 1) map.fitBounds(punti, { padding: [50, 50], maxZoom: 14 });
    else map.setView([lavoro.lat, lavoro.lng], 13);
  }

  // ----- Autocompletamento indirizzo del lavoro -----
  const onInputIndirizzo = debounce(async () => {
    lavoroSelezionato = null;
    const q = $("#input-indirizzo").value.trim();
    if (q.length < 4) return nascondiSuggerimenti();
    const sugg = await GL.geo.suggerisci(q);
    renderSuggerimenti(sugg);
  }, 500);

  function renderSuggerimenti(lista) {
    const box = $("#suggerimenti");
    suggCorrenti = lista || [];
    if (!suggCorrenti.length) return nascondiSuggerimenti();
    box.innerHTML = suggCorrenti.map((s, i) => `<div class="sugg" data-i="${i}">${esc(s.etichetta)}</div>`).join("");
    box.hidden = false;
    box.querySelectorAll(".sugg").forEach((el) => {
      el.addEventListener("click", () => {
        const s = suggCorrenti[Number(el.dataset.i)];
        $("#input-indirizzo").value = s.etichetta;
        lavoroSelezionato = s;
        nascondiSuggerimenti();
      });
    });
  }

  function nascondiSuggerimenti() {
    const box = $("#suggerimenti");
    box.hidden = true;
    box.innerHTML = "";
  }

  // ============================================================
  //  Dipendenti (elenco + ricerca + CRUD)
  // ============================================================
  function renderListaDipendenti(filtro) {
    const cont = $("#lista-dipendenti");
    const oggi = GL.impegni.oggiISO();
    const q = (filtro || "").trim().toLowerCase();
    const lista = q
      ? dipendenti.filter((d) =>
          (d.nome + " " + d.mansioni.join(" ") + " " + (d.competenze || "") + " " + d.indirizzo).toLowerCase().includes(q))
      : dipendenti;

    if (!dipendenti.length) {
      cont.innerHTML = `<div class="vuoto">Nessun dipendente. Usa "+ Aggiungi dipendente".</div>`;
      return;
    }
    if (!lista.length) {
      cont.innerHTML = `<div class="vuoto">Nessun dipendente trovato per "${esc(filtro)}".</div>`;
      return;
    }

    cont.innerHTML = lista
      .map((d) => {
        const impOggi = GL.impegni.impegniGiorno(d, oggi);
        const occ = impOggi.length > 0;
        const badge = occ
          ? `<span class="badge occ">Occupato oggi</span>`
          : `<span class="badge disp">Disponibile oggi</span>`;
        const nPeriodi = (d.impegni || []).length;
        const tags = d.mansioni.map((m) => `<span class="tag">${esc(m)}</span>`).join("");
        const approx = d.approssimato
          ? ` <span class="approx" title="Via non trovata: posizione approssimata al comune">≈ approssimato</span>`
          : "";
        const notaOcc = occ
          ? `<div class="dip-info">📅 Oggi: ${impOggi.map((i) => esc((i.note || "occupato") + " " + fasciaOggi(i, oggi))).join(" · ")}</div>`
          : "";
        const contratto = [
          d.codiceContratto,
          d.orarioContrattuale ? d.orarioContrattuale + "h" : "",
          d.dataAssunzione ? "assunto " + GL.impegni.formattaData(d.dataAssunzione) : "",
          d.nrProroghe ? d.nrProroghe + " proroghe" : "",
        ].filter(Boolean).join(" · ");
        const certs = (d.formazione || [])
          .map((c) => {
            const st = statoScadenza(c.scadenza);
            const lbl = c.scadenza ? `${esc(c.nome)} · ${GL.impegni.formattaData(c.scadenza)}` : esc(c.nome);
            const tip = st === "scaduto" ? "scaduto" : st === "presto" ? "in scadenza" : "valido";
            return `<span class="cert cert-${st}" title="${tip}">${lbl}</span>`;
          })
          .join("");
        const formBlock = (d.formazione && d.formazione.length)
          ? `<div class="dip-form"><div class="dip-form-tit">🎓 Formazione e certificati</div><div class="dip-certs">${certs}</div></div>`
          : `<div class="dip-form-vuoto">🎓 Nessun certificato registrato</div>`;
        return `
        <div class="dip-card">
          <h3>${esc(d.nome)}</h3>
          <div class="dip-info">📍 ${esc(d.indirizzo)}${approx}</div>
          ${d.telefono ? `<div class="dip-info">📞 ${esc(d.telefono)}</div>` : ""}
          ${contratto ? `<div class="dip-info">🗂 ${esc(contratto)}</div>` : ""}
          ${d.dataFineRapporto ? `<div class="dip-info">⏳ Fine rapporto: ${GL.impegni.formattaData(d.dataFineRapporto)}</div>` : ""}
          ${d.competenze ? `<div class="dip-info">🛠 ${esc(d.competenze)}</div>` : ""}
          <div class="dip-info">${badge}</div>
          ${notaOcc}
          <div class="dip-tags">${tags || '<span class="dip-info">Nessuna mansione</span>'}</div>
          ${formBlock}
          <div class="dip-actions">
            <button class="btn ghost" data-azione="impegni" data-id="${d.id}">📅 Periodi${nPeriodi ? " (" + nPeriodi + ")" : ""}</button>
            <button class="btn ghost" data-azione="modifica" data-id="${d.id}">Modifica</button>
            <button class="btn ghost link-danger" data-azione="elimina" data-id="${d.id}">Elimina</button>
          </div>
        </div>`;
      })
      .join("");

    cont.querySelectorAll("button[data-azione]").forEach((b) => {
      b.addEventListener("click", () => onAzioneDipendente(b.dataset.azione, b.dataset.id));
    });
  }

  // Orario di un impegno limitato a "oggi": "08:00–12:00" se tutto in giornata, altrimenti "tutto il giorno".
  function fasciaOggi(i, oggi) {
    if (GL.impegni.dataParte(i.dal) === oggi && GL.impegni.dataParte(i.al) === oggi) {
      return GL.impegni.oraParte(i.dal) + "–" + GL.impegni.oraParte(i.al);
    }
    return "tutto il giorno";
  }

  // Stato di una scadenza certificato: scaduto / presto (entro 60 gg) / valido.
  function statoScadenza(scad) {
    if (!scad) return "valido";
    const oggi = GL.impegni.oggiISO();
    if (scad < oggi) return "scaduto";
    const giorni = Math.round((new Date(scad) - new Date(oggi)) / 86400000);
    return giorni <= 60 ? "presto" : "valido";
  }

  // --- Helper per il calendario "ricco" ---
  function iniziali(nome) {
    const p = (nome || "").trim().split(/\s+/);
    const a = p[0] ? p[0][0] : "";
    const b = p.length > 1 ? p[p.length - 1][0] : "";
    return ((a + b).toUpperCase()) || "?";
  }
  // Colore (tonalità) stabile per persona, dal nome → avatar colorati e riconoscibili.
  function tonoPersona(nome) {
    let h = 0;
    for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360;
    return h;
  }
  // Livello "heatmap" della giornata in base a quanti sono occupati.
  function livelloCarico(n) {
    if (n === 0) return 0;
    if (n <= 2) return 1;
    if (n <= 5) return 2;
    if (n <= 9) return 3;
    return 4;
  }

  function onAzioneDipendente(azione, id) {
    if (azione === "modifica") return apriModale(dipendenti.find((d) => d.id === id));
    if (azione === "elimina") return eliminaDipendente(id);
    if (azione === "impegni") return apriImpegni(id);
  }

  function eliminaDipendente(id) {
    const d = dipendenti.find((x) => x.id === id);
    if (!confirm(`Eliminare "${d?.nome}"?`)) return;
    dipendenti = dipendenti.filter((x) => x.id !== id);
    persistiERirenderizza();
  }

  function onRipristina() {
    if (!confirm("Ricaricare l'elenco originale importato? Le modifiche fatte qui andranno perse.")) return;
    dipendenti = GL.data.ripristinaEsempi();
    aggiornaStatoApp();
    renderListaDipendenti();
  }

  function persistiERirenderizza() {
    GL.data.salva(dipendenti);
    aggiornaStatoApp();
    renderListaDipendenti($("#cerca-dip").value);
  }

  // ----- Modale aggiungi/modifica -----
  function apriModale(dip) {
    editId = dip ? dip.id : null;
    $("#modal-title").textContent = dip ? "Modifica dipendente" : "Aggiungi dipendente";
    $("#f-nome").value = dip ? dip.nome : "";
    $("#f-telefono").value = dip ? dip.telefono || "" : "";
    $("#f-indirizzo").value = dip ? dip.indirizzo : "";
    $("#f-competenze").value = dip ? dip.competenze || "" : "";
    $("#modal-stato").textContent = "";

    const selez = dip ? dip.mansioni : [];
    $("#f-mansioni").innerHTML = MANSIONI.map(
      (m) => `<label><input type="checkbox" value="${esc(m)}" ${selez.includes(m) ? "checked" : ""}/> ${esc(m)}</label>`
    ).join("");

    $("#modal").hidden = false;
  }

  function chiudiModale() {
    $("#modal").hidden = true;
    editId = null;
  }

  async function onSalvaDipendente(e) {
    e.preventDefault();
    const stato = $("#modal-stato");
    const nome = $("#f-nome").value.trim();
    const telefono = $("#f-telefono").value.trim();
    const indirizzo = $("#f-indirizzo").value.trim();
    const competenze = $("#f-competenze").value.trim();
    const mansioni = Array.from($("#f-mansioni").querySelectorAll("input:checked")).map((i) => i.value);

    if (!nome || !indirizzo) return setStato(stato, "Nome e indirizzo sono obbligatori.", "errore");
    if (!mansioni.length) return setStato(stato, "Seleziona almeno una mansione.", "errore");

    setStato(stato, "Geocodifico l'indirizzo…", "");
    try {
      const pos = await GL.geo.geocodifica(indirizzo);
      const base = { nome, telefono, indirizzo, competenze, mansioni, lat: pos.lat, lng: pos.lng, approssimato: false };
      if (editId) {
        dipendenti = dipendenti.map((d) => (d.id === editId ? { ...d, ...base } : d));
      } else {
        dipendenti = [...dipendenti, { id: GL.data.nuovoId(), impegni: [], ...base }];
      }
      GL.data.salva(dipendenti);
      chiudiModale();
      aggiornaStatoApp();
      renderListaDipendenti($("#cerca-dip").value);
    } catch (err) {
      setStato(stato, "⚠️ " + err.message, "errore");
    }
  }

  // ============================================================
  //  Periodi di occupazione (impegni con data + ora)
  // ============================================================
  function apriImpegni(id) {
    impegniDipId = id;
    const d = dipendenti.find((x) => x.id === id);
    $("#impegni-titolo").textContent = "Periodi di occupazione — " + d.nome;
    GL.datepicker.clear($("#imp-dal"));
    GL.datepicker.clear($("#imp-al"));
    $("#imp-note").value = "";
    $("#impegni-stato").textContent = "";
    renderImpegniLista();
    $("#modal-impegni").hidden = false;
  }

  function chiudiImpegni() {
    $("#modal-impegni").hidden = true;
    impegniDipId = null;
  }

  function renderImpegniLista() {
    const d = dipendenti.find((x) => x.id === impegniDipId);
    const cont = $("#impegni-lista");
    if (!d) return;
    const adesso = GL.impegni.adessoISO();
    const imp = (d.impegni || []).slice().sort((a, b) => (a.dal < b.dal ? -1 : 1));
    if (!imp.length) {
      cont.innerHTML = `<p class="vuoto">Nessun periodo inserito: la persona risulta sempre disponibile.</p>`;
      return;
    }
    cont.innerHTML = imp
      .map((i) => {
        const attivo = adesso >= i.dal && adesso <= i.al;
        return `
        <div class="imp-riga ${attivo ? "attivo" : ""}">
          <span>📅 <b>${GL.impegni.descrivi(i)}</b>${i.note ? " · " + esc(i.note) : ""}${attivo ? ' <span class="badge occ">in corso</span>' : ""}</span>
          <button class="btn ghost link-danger" data-imp="${i.id}">Rimuovi</button>
        </div>`;
      })
      .join("");
    cont.querySelectorAll("button[data-imp]").forEach((b) => {
      b.addEventListener("click", () => rimuoviImpegno(b.dataset.imp));
    });
  }

  function aggiungiImpegno() {
    const stato = $("#impegni-stato");
    const dal = GL.datepicker.getValue($("#imp-dal")); // "YYYY-MM-DDTHH:MM" o ""
    let al = GL.datepicker.getValue($("#imp-al"));
    const note = $("#imp-note").value.trim();
    if (!dal) return setStato(stato, "Inserisci almeno la data e l'ora di inizio.", "errore");
    if (!al) al = GL.impegni.dataParte(dal) + "T23:59"; // fine non indicata = fino a fine giornata
    if (al < dal) return setStato(stato, "La fine è precedente all'inizio.", "errore");

    dipendenti = dipendenti.map((d) =>
      d.id === impegniDipId
        ? { ...d, impegni: [...(d.impegni || []), { id: GL.impegni.nuovoId(), dal, al, note }] }
        : d
    );
    GL.data.salva(dipendenti);
    GL.datepicker.clear($("#imp-dal"));
    GL.datepicker.clear($("#imp-al"));
    $("#imp-note").value = "";
    setStato(stato, "✅ Periodo aggiunto.", "ok");
    renderImpegniLista();
    renderListaDipendenti($("#cerca-dip").value);
  }

  function rimuoviImpegno(impId) {
    dipendenti = dipendenti.map((d) =>
      d.id === impegniDipId ? { ...d, impegni: (d.impegni || []).filter((i) => i.id !== impId) } : d
    );
    GL.data.salva(dipendenti);
    renderImpegniLista();
    renderListaDipendenti($("#cerca-dip").value);
  }

  // ============================================================
  //  Protezione sito: genera il file cifrato da pubblicare
  // ============================================================
  function apriPwd() {
    $("#pwd-1").value = "";
    $("#pwd-2").value = "";
    setStato($("#pwd-stato"), "", "");
    $("#modal-pwd").hidden = false;
  }
  function chiudiPwd() { $("#modal-pwd").hidden = true; }

  async function generaProtetto() {
    const stato = $("#pwd-stato");
    const p1 = $("#pwd-1").value;
    const p2 = $("#pwd-2").value;
    if (p1.length < 6) return setStato(stato, "Usa una password di almeno 6 caratteri.", "errore");
    if (p1 !== p2) return setStato(stato, "Le due password non coincidono.", "errore");
    setStato(stato, "Cifro i dati…", "");
    try {
      const payload = { seed: dipendenti, mansioni: GL.data.mansioni() };
      const blob = await GL.auth.cifra(p1, payload);
      const contenuto =
        "/* File CIFRATO (AES-256) — sicuro da pubblicare online. Generato dall'app. */\n" +
        "window.GL_CIFRATO = " + JSON.stringify(blob) + ";\n";
      scarica("dati-cifrati.js", contenuto);
      setStato(stato, "✅ Generato 'dati-cifrati.js' (scaricato). Ora il sito è pubblicabile.", "ok");
    } catch (e) {
      setStato(stato, "⚠️ " + e.message, "errore");
    }
  }

  function scarica(nome, testo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([testo], { type: "text/javascript" }));
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ============================================================
  //  Calendario
  // ============================================================
  function cambiaMese(delta) {
    calMese += delta;
    if (calMese < 0) { calMese = 11; calAnno--; }
    else if (calMese > 11) { calMese = 0; calAnno++; }
    renderCalendario();
  }

  function vaiAOggi() {
    const o = new Date();
    calAnno = o.getFullYear();
    calMese = o.getMonth();
    calGiornoSel = GL.impegni.oggiISO();
    renderCalendario();
  }

  function renderCalendario() {
    $("#cal-titolo").textContent = GL.impegni.nomeMese(calMese) + " " + calAnno;
    const oggi = GL.impegni.oggiISO();
    const celle = GL.impegni.grigliaMese(calAnno, calMese);
    $("#cal-griglia").innerHTML = celle
      .map((iso) => {
        if (!iso) return `<div class="cal-cella vuota"></div>`;
        const occList = dipendenti.filter((d) => GL.impegni.occupatoGiorno(d, iso));
        const n = occList.length;
        const cls = ["cal-cella", "lvl-" + livelloCarico(n)];
        if (iso === oggi) cls.push("oggi");
        if (iso === calGiornoSel) cls.push("sel");
        const chips = occList.slice(0, 4)
          .map((d) => `<span class="cal-ini" style="background:hsl(${tonoPersona(d.nome)} 58% 52%)" title="${esc(d.nome)}">${esc(iniziali(d.nome))}</span>`)
          .join("");
        const extra = n > 4 ? `<span class="cal-ini cal-ini-extra">+${n - 4}</span>` : "";
        return `
        <div class="${cls.join(" ")}" data-iso="${iso}">
          <div class="cal-cella-top">
            <span class="cal-num">${Number(iso.split("-")[2])}</span>
            ${n ? `<span class="cal-occ-badge">${n}</span>` : ""}
          </div>
          ${n ? `<div class="cal-inis">${chips}${extra}</div>` : `<span class="cal-lib-badge">liberi</span>`}
        </div>`;
      })
      .join("");
    $("#cal-griglia").querySelectorAll(".cal-cella[data-iso]").forEach((el) => {
      el.addEventListener("click", () => { calGiornoSel = el.dataset.iso; renderCalendario(); });
    });
    renderDettaglioGiorno();
  }

  function renderDettaglioGiorno() {
    const cont = $("#cal-dettaglio");
    if (!calGiornoSel) { cont.innerHTML = ""; return; }
    const occ = dipendenti.filter((d) => GL.impegni.occupatoGiorno(d, calGiornoSel));
    const liberi = dipendenti.length - occ.length;
    let html = `<h3>${GL.impegni.formattaData(calGiornoSel)} · <span class="cal-sum-occ">${occ.length} occupati</span> · <span class="cal-sum-lib">${liberi} disponibili</span></h3>`;
    if (!occ.length) {
      html += `<p class="vuoto">Tutti disponibili in questa data. 🎉</p>`;
    } else {
      html += `<div class="cal-persone">` + occ
        .map((d) => {
          const slots = GL.impegni.impegniGiorno(d, calGiornoSel)
            .map((i) => `<span class="cal-slot">${esc(fasciaOggi(i, calGiornoSel))}${i.note ? " · " + esc(i.note) : ""}</span>`)
            .join("");
          return `<div class="cal-persona">
            <span class="cal-avatar" style="background:hsl(${tonoPersona(d.nome)} 58% 52%)">${esc(iniziali(d.nome))}</span>
            <div class="cal-persona-info">
              <div class="cal-persona-nome">${esc(d.nome)}</div>
              <div class="cal-persona-mans">${esc(d.mansioni[0] || "")}</div>
              <div class="cal-slots">${slots}</div>
            </div>
          </div>`;
        })
        .join("") + `</div>`;
    }
    cont.innerHTML = html;
  }

  // ============================================================
  //  Utility
  // ============================================================
  function aggiornaStatoApp() {
    const sa = $("#stato-app");
    if (sa) sa.textContent = `build 15 · ${dipendenti.length} dipendenti · ${MANSIONI.length} mansioni`;
  }

  function setStato(el, testo, classe) {
    el.textContent = testo;
    el.className = "form-stato" + (classe ? " " + classe : "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
})();
