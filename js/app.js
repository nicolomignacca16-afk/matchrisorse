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

  // --- Stato vista Lavori (timeline, calendario lavori, calendario persone) ---
  let servizi = [];
  let impDerivati = {};      // idDipendente -> impegni ricavati dai lavori del file
  let srvAnno = 0, srvMese = 0, srvGiornoSel = null;
  let srvFiltroCat = null;   // null = tutte le categorie
  let srvFiltroAtt = "";      // "" = tutte le attività
  let srvFiltroCli = "";      // "" = tutti i clienti
  let srvModo = "timeline";   // "timeline" | "mese" | "persone"

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
        if (dati.servizi) window.GL_SERVIZI_REALI = dati.servizi;
        if (dati.tariffe) window.GL_TARIFFE = dati.tariffe;
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
    initServiziStato();
    initMappa();
    bindEventi();
    initDatePicker();
    renderListaDipendenti();
    initServizi();
    GL.economiaView.monta({ contenitore: $("#view-economia"), servizi: () => servizi });
    aggiornaStatoApp();
  }

  // Prepara lo stato della vista Lavori: mese con dati + primo giorno con lavori.
  // Le persone sono già assegnate nel file importato (colonna NOMINATIVO): da lì
  // si ricavano anche gli impegni di ogni dipendente (calendario e disponibilità).
  function initServiziStato() {
    servizi = GL.servizi.carica();
    impDerivati = GL.servizi.impegniPerDipendente(servizi);
    const mi = GL.servizi.meseIniziale();
    srvAnno = mi.anno;
    srvMese = mi.mese;
    srvGiornoSel = primoGiornoConServizi() || GL.impegni.iso(new Date(srvAnno, srvMese, 1));
    // Pulizia delle assegnazioni automatiche generate dalle versioni precedenti:
    // ora le risorse arrivano dal file, non servono più.
    try {
      localStorage.removeItem("gl_servizi_v1");
      localStorage.removeItem("gl_servizi_orefine_v1");
      localStorage.removeItem("gl_servizi_engine_v");
    } catch (e) { /* spazio non disponibile: ininfluente */ }
  }

  // --- Impegni di un dipendente: quelli inseriti a mano + quelli dai lavori ---
  function impegniDi(d) {
    const manuali = (d && d.impegni) || [];
    const daLavori = (d && impDerivati[d.id]) || [];
    return manuali.length ? manuali.concat(daLavori) : daLavori;
  }
  function impegniGiornoDi(d, giorno) {
    return impegniDi(d)
      .filter((i) => GL.impegni.dataParte(i.dal) <= giorno && giorno <= GL.impegni.dataParte(i.al))
      .sort((a, b) => (a.dal < b.dal ? -1 : 1));
  }
  function occupatoIstanteDi(d, istante) {
    return impegniDi(d).some((i) => istante >= i.dal && istante <= i.al);
  }
  function impegnoIstanteDi(d, istante) {
    return impegniDi(d).find((i) => istante >= i.dal && istante <= i.al) || null;
  }

  function primoGiornoConServizi() {
    const date = servizi.map((s) => s.data).filter(Boolean).sort();
    return date.length ? date[0] : null;
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
    $("#tab-servizi").addEventListener("click", () => mostraVista("servizi"));
    $("#tab-economia").addEventListener("click", () => mostraVista("economia"));
    $("#tab-cerca").addEventListener("click", () => mostraVista("cerca"));
    $("#tab-dipendenti").addEventListener("click", () => mostraVista("dipendenti"));

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

    $("#btn-persona-x").addEventListener("click", chiudiPersona);
    $("#modal-persona").addEventListener("click", (e) => { if (e.target.id === "modal-persona") chiudiPersona(); });

    $("#btn-servizio-x").addEventListener("click", chiudiServizio);
    $("#modal-servizio").addEventListener("click", (e) => { if (e.target.id === "modal-servizio") chiudiServizio(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { chiudiModale(); chiudiImpegni(); chiudiPwd(); chiudiPersona(); chiudiServizio(); }
    });

    // Vista Lavori (timeline / calendario lavori / calendario persone)
    $("#srv-prev").addEventListener("click", () => cambiaMeseServizi(-1));
    $("#srv-next").addEventListener("click", () => cambiaMeseServizi(1));
    $("#srv-oggi").addEventListener("click", vaiAOggi);
    $("#srv-att").addEventListener("change", (e) => { srvFiltroAtt = e.target.value; renderServizi(); });
    $("#srv-cli").addEventListener("change", (e) => { srvFiltroCli = e.target.value; renderServizi(); });
    $("#srv-modo-mese").addEventListener("click", () => cambiaModoServizi("mese"));
    $("#srv-modo-timeline").addEventListener("click", () => cambiaModoServizi("timeline"));
    $("#srv-modo-persone").addEventListener("click", () => cambiaModoServizi("persone"));
  }

  function mostraVista(quale) {
    $("#view-servizi").hidden = quale !== "servizi";
    $("#view-economia").hidden = quale !== "economia";
    $("#view-cerca").hidden = quale !== "cerca";
    $("#view-dipendenti").hidden = quale !== "dipendenti";
    $("#tab-servizi").classList.toggle("active", quale === "servizi");
    $("#tab-economia").classList.toggle("active", quale === "economia");
    $("#tab-cerca").classList.toggle("active", quale === "cerca");
    $("#tab-dipendenti").classList.toggle("active", quale === "dipendenti");
    if (quale === "cerca") setTimeout(() => map.invalidateSize(), 100);
    else if (quale === "servizi") renderServizi();
    else if (quale === "economia") GL.economiaView.render();
    else if (quale === "dipendenti") renderListaDipendenti($("#cerca-dip").value);
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
          const occupato = occupatoIstanteDi(d, quando);
          const imp = occupato ? impegnoIstanteDi(d, quando) : null;
          return {
            ...d,
            distanza: GL.geo.distanzaKm(lavoro, d),
            occupato,
            noteImpegno: imp ? titoloImpegno(imp) + " (" + GL.impegni.descrivi(imp) + ")" : "",
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
        const impOggi = impegniGiornoDi(d, oggi);
        const occ = impOggi.length > 0;
        const badge = occ
          ? `<span class="badge occ">Occupato oggi</span>`
          : `<span class="badge disp">Disponibile oggi</span>`;
        const nLavori = (impDerivati[d.id] || []).length;
        const nPeriodi = (d.impegni || []).length;
        const tags = d.mansioni.map((m) => `<span class="tag">${esc(m)}</span>`).join("");
        const approx = d.approssimato
          ? ` <span class="approx" title="Via non trovata: posizione approssimata al comune">≈ approssimato</span>`
          : "";
        const notaOcc = occ
          ? `<div class="dip-info">📅 Oggi: ${impOggi.map((i) => esc(titoloImpegno(i) + " " + fasciaOggi(i, oggi))).join(" · ")}</div>`
          : "";
        const sovra = GL.impegni.settimaneSovraccarico(impegniDi(d), d.orarioContrattuale);
        const alertOre = sovra.length
          ? `<div class="alert-ore">⚠️ Ore settimanali superate: ${GL.impegni.oreFmt(Math.max(...sovra.map((s) => s.ore)))} su ${esc(d.orarioContrattuale)}h${sovra.length > 1 ? " · " + sovra.length + " settimane" : ""}</div>`
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
          ${alertOre}
          ${notaOcc}
          <div class="dip-tags">${tags || '<span class="dip-info">Nessuna mansione</span>'}</div>
          ${formBlock}
          <div class="dip-actions">
            <button class="btn ghost" data-azione="impegni" data-id="${d.id}">📅 Impegni${nLavori + nPeriodi ? " (" + (nLavori + nPeriodi) + ")" : ""}</button>
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

  // Etichetta principale di un impegno: titolo del lavoro, poi nota, poi generico.
  function titoloImpegno(i) {
    return i.titolo || i.note || "Occupato";
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
    $("#imp-titolo").value = "";
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
    const daLavori = (impDerivati[d.id] || []).slice();
    const manuali = (d.impegni || []).slice().sort((a, b) => (a.dal < b.dal ? -1 : 1));

    const riga = (i, rimovibile) => {
      const attivo = adesso >= i.dal && adesso <= i.al;
      const nota = i.note ? " · " + esc(i.note) : "";
      const azione = rimovibile
        ? `<button class="btn ghost link-danger" data-imp="${i.id}">Rimuovi</button>`
        : `<span class="imp-fonte" title="Arriva dal file dei lavori importato">da file lavori</span>`;
      return `
        <div class="imp-riga ${attivo ? "attivo" : ""} ${rimovibile ? "" : "auto"}">
          <span>📅 <b>${esc(titoloImpegno(i))}</b> · ${GL.impegni.descrivi(i)}${nota}${attivo ? ' <span class="badge occ">in corso</span>' : ""}</span>
          ${azione}
        </div>`;
    };

    let html = "";
    if (!manuali.length && !daLavori.length) {
      html = `<p class="vuoto">Nessun impegno: la persona risulta sempre disponibile.</p>`;
    } else {
      if (manuali.length) html += manuali.map((i) => riga(i, true)).join("");
      if (daLavori.length) {
        html += `<div class="imp-sez">Lavori del mese importati (${daLavori.length})</div>`;
        html += daLavori.map((i) => riga(i, false)).join("");
      }
    }
    cont.innerHTML = html;
    cont.querySelectorAll("button[data-imp]").forEach((b) => {
      b.addEventListener("click", () => rimuoviImpegno(b.dataset.imp));
    });
    renderRiepilogoOre();
  }

  // Riepilogo ore per settimana (lavori del file + periodi manuali), con alert
  // se superano l'orario contrattuale.
  function renderRiepilogoOre() {
    const d = dipendenti.find((x) => x.id === impegniDipId);
    const cont = $("#impegni-ore");
    if (!d) { cont.innerHTML = ""; return; }
    const contr = parseFloat(d.orarioContrattuale);
    const m = GL.impegni.orePerSettimana(impegniDi(d));
    const settimane = Object.keys(m).sort();
    if (!settimane.length) { cont.innerHTML = ""; return; }
    cont.innerHTML =
      `<div class="ore-tit">Ore per settimana${contr ? " (contratto: " + contr + "h)" : ""}</div>` +
      settimane
        .map((wk) => {
          const over = contr && m[wk] > contr + 0.001;
          return `<div class="ore-riga ${over ? "over" : ""}">Sett. del ${GL.impegni.formattaData(wk)}: <b>${GL.impegni.oreFmt(m[wk])}</b>${contr ? " / " + contr + "h" : ""}${over ? " ⚠️ superate" : ""}</div>`;
        })
        .join("");
  }

  function aggiungiImpegno() {
    const stato = $("#impegni-stato");
    const dal = GL.datepicker.getValue($("#imp-dal")); // "YYYY-MM-DDTHH:MM" o ""
    let al = GL.datepicker.getValue($("#imp-al"));
    const titolo = $("#imp-titolo").value.trim();
    const note = $("#imp-note").value.trim();
    if (!dal) return setStato(stato, "Inserisci almeno la data e l'ora di inizio.", "errore");
    if (!al) al = GL.impegni.dataParte(dal) + "T23:59"; // fine non indicata = fino a fine giornata
    if (al < dal) return setStato(stato, "La fine è precedente all'inizio.", "errore");

    dipendenti = dipendenti.map((d) =>
      d.id === impegniDipId
        ? { ...d, impegni: [...(d.impegni || []), { id: GL.impegni.nuovoId(), dal, al, titolo, note }] }
        : d
    );
    GL.data.salva(dipendenti);
    GL.datepicker.clear($("#imp-dal"));
    GL.datepicker.clear($("#imp-al"));
    $("#imp-titolo").value = "";
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
      const payload = {
        seed: dipendenti,
        mansioni: GL.data.mansioni(),
        servizi,
        tariffe: GL.tariffe.carica(),
      };
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
  //  Calendario persone (modalità della vista Lavori)
  //  Le persone occupate si ricavano dai lavori del file, non da liste separate.
  // ============================================================
  function renderCalendarioPersone() {
    const oggi = GL.impegni.oggiISO();
    const celle = GL.impegni.grigliaMese(srvAnno, srvMese);
    const filtrati = servizi.filter(passaFiltri);
    $("#cal-griglia").innerHTML = celle
      .map((iso) => {
        if (!iso) return `<div class="cal-cella vuota"></div>`;
        const persone = GL.servizi.personeGiorno(filtrati, iso);
        const n = persone.length;
        const cls = ["cal-cella", "lvl-" + livelloCarico(n)];
        if (iso === oggi) cls.push("oggi");
        if (iso === srvGiornoSel) cls.push("sel");
        const chips = persone.slice(0, 4)
          .map((p) => `<span class="cal-ini" style="background:hsl(${tonoPersona(p.nome)} 58% 52%)" title="${esc(p.nome)}">${esc(iniziali(p.nome))}</span>`)
          .join("");
        const extra = n > 4 ? `<span class="cal-ini cal-ini-extra">+${n - 4}</span>` : "";
        return `
        <div class="${cls.join(" ")}" data-iso="${iso}">
          <div class="cal-cella-top">
            <span class="cal-num">${Number(iso.split("-")[2])}</span>
            ${n ? `<span class="cal-occ-badge">${n}</span>` : ""}
          </div>
          ${n ? `<div class="cal-inis">${chips}${extra}</div>` : `<span class="cal-lib-badge">nessuno</span>`}
        </div>`;
      })
      .join("");
    $("#cal-griglia").querySelectorAll(".cal-cella[data-iso]").forEach((el) => {
      el.addEventListener("click", () => { srvGiornoSel = el.dataset.iso; renderServizi(); });
    });
    renderDettaglioPersone();
  }

  function renderDettaglioPersone() {
    const cont = $("#cal-dettaglio");
    if (!srvGiornoSel) { cont.innerHTML = ""; return; }
    const filtrati = servizi.filter(passaFiltri);
    const persone = GL.servizi.personeGiorno(filtrati, srvGiornoSel);
    const interni = persone.filter((p) => p.dipId).length;
    const liberi = dipendenti.length - interni;
    const ore = persone.reduce((t, p) => t + p.ore, 0);
    let html = `<h3>${GL.impegni.formattaData(srvGiornoSel)} · <span class="cal-sum-occ">${persone.length} al lavoro</span>` +
      ` · <span class="cal-sum-lib">${liberi} dipendenti liberi</span> · <span class="cal-sum-ore">${GL.impegni.oreFmt(ore)} totali</span></h3>`;
    if (!persone.length) {
      html += `<p class="vuoto">Nessun lavoro in questa data con i filtri attuali.</p>`;
    } else {
      html += `<div class="cal-persone">` + persone
        .map((p) => {
          const d = p.dipId ? dipById(p.dipId) : null;
          const slots = p.servizi
            .map((s) => `<span class="cal-slot">${esc(GL.servizi.fasciaOraria(s))} · ${esc(s.cliente)}</span>`)
            .join("");
          const sotto = d ? esc(d.mansioni[0] || "") : "risorsa esterna / interinale";
          return `<div class="cal-persona ${d ? "" : "esterna"}" data-chiave="${esc(p.chiave)}" title="Clicca per il dettaglio">
            <span class="cal-avatar" style="background:hsl(${tonoPersona(p.nome)} 58% 52%)">${esc(iniziali(p.nome))}</span>
            <div class="cal-persona-info">
              <div class="cal-persona-nome">${esc(p.nome)}</div>
              <div class="cal-persona-mans">${sotto} · ${GL.impegni.oreFmt(p.ore)}</div>
              <div class="cal-slots">${slots}</div>
            </div>
          </div>`;
        })
        .join("") + `</div>`;
    }
    cont.innerHTML = html;
    cont.querySelectorAll(".cal-persona[data-chiave]").forEach((el) => {
      el.addEventListener("click", () => apriPersona(el.dataset.chiave, srvGiornoSel));
    });
  }

  // Dettaglio persona: anagrafica (se presente) + lavori del giorno + totale mese.
  function apriPersona(chiave, giorno) {
    const d = chiave.startsWith("x:") ? null : dipById(chiave);
    const delGiorno = GL.servizi.delGiorno(servizi, giorno)
      .filter((s) => (s.persone || []).some((p) => (p.id || "x:" + p.n) === chiave));
    const nome = d ? d.nome : (delGiorno[0]?.persone.find((p) => "x:" + p.n === chiave)?.n || chiave.slice(2));

    const tuttiSuoi = GL.servizi.serviziPersona(GL.servizi.delMese(servizi, srvAnno, srvMese), chiave);
    const oreMese = tuttiSuoi.reduce((t, s) => t + GL.servizi.orePersona(s), 0);

    const lavori = delGiorno
      .map((s) => `
        <div class="pd-lavoro">
          <div class="pd-titolo">🏷️ ${esc(s.cliente)} — ${esc(s.attivita)}</div>
          <div class="pd-riga">⏳ ${esc(GL.servizi.fasciaOraria(s))} <span class="pd-dur">(${GL.impegni.oreFmt(GL.servizi.orePersona(s))})</span>${s.pausa ? " · pausa " + esc(s.pausa) : ""}</div>
          <div class="pd-riga">📍 Dove: ${esc(s.indirizzo || "luogo non indicato")}</div>
          ${s.note ? `<div class="pd-riga">📝 ${esc(s.note)}</div>` : ""}
        </div>`)
      .join("");

    const anagrafica = d
      ? `<div class="pd-riga">📞 ${esc(d.telefono || "—")}</div>
         <div class="pd-riga">🏠 Domicilio: ${esc(d.indirizzo)}</div>`
      : `<div class="pd-riga pd-esterna">👤 Non presente in anagrafica: risorsa esterna / interinale.</div>`;

    $("#persona-dettaglio").innerHTML = `
      <div class="pd-head">
        <span class="cal-avatar" style="background:hsl(${tonoPersona(nome)} 58% 52%)">${esc(iniziali(nome))}</span>
        <div>
          <h2>${esc(nome)}</h2>
          <div class="pd-mans">${d ? esc(d.mansioni.join(" · ")) : "risorsa esterna"}</div>
        </div>
      </div>
      ${anagrafica}
      <div class="pd-riga">📊 ${GL.impegni.nomeMese(srvMese)}: <b>${tuttiSuoi.length} lavori</b> · ${GL.impegni.oreFmt(oreMese)}</div>
      <h3 class="pd-sub">Lavori del ${GL.impegni.formattaData(giorno)}</h3>
      ${lavori || '<p class="vuoto">Nessun lavoro in questa data.</p>'}`;
    $("#modal-persona").hidden = false;
  }
  function chiudiPersona() { $("#modal-persona").hidden = true; }

  // ============================================================
  //  Lavori (timeline, calendario lavori, calendario persone)
  // ============================================================
  // Prepara le parti statiche della vista (una volta sola): legenda e filtri.
  function initServizi() {
    renderLegendaServizi();
    renderFiltriCategoria();
    $("#srv-att").innerHTML = `<option value="">Tutte</option>` +
      GL.servizi.attivitaDistinte(servizi).map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
    $("#srv-cli").innerHTML = `<option value="">Tutti</option>` +
      GL.servizi.clientiDistinti(servizi).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    renderServizi();
  }

  function renderLegendaServizi() {
    $("#srv-legenda").innerHTML = GL.servizi.CATEGORIE
      .map((c) => `
        <span class="srv-leg srv-cat-${c.id}" title="${esc(c.desc)}">
          <span class="srv-leg-dot"></span>
          <b>${esc(c.nome)}</b><span class="srv-leg-desc"> — ${esc(c.desc)}</span>
        </span>`)
      .join("");
  }

  function renderFiltriCategoria() {
    const cont = $("#srv-filtri-cat");
    const chip = (id, nome) =>
      `<button class="srv-chip ${id ? "srv-cat-" + id : ""} ${srvFiltroCat === id ? "on" : ""}" data-cat="${id || ""}">${esc(nome)}</button>`;
    cont.innerHTML =
      chip(null, "Tutte") + GL.servizi.CATEGORIE.map((c) => chip(c.id, c.nome)).join("");
    cont.querySelectorAll(".srv-chip").forEach((b) => {
      b.addEventListener("click", () => {
        srvFiltroCat = b.dataset.cat || null;
        renderFiltriCategoria();
        renderServizi();
      });
    });
  }

  function cambiaMeseServizi(delta) {
    srvMese += delta;
    if (srvMese < 0) { srvMese = 11; srvAnno--; }
    else if (srvMese > 11) { srvMese = 0; srvAnno++; }
    // Se il giorno selezionato non è più nel mese mostrato, deselezionalo.
    if (srvGiornoSel && !srvGiornoSel.startsWith(`${srvAnno}-${due(srvMese + 1)}`)) srvGiornoSel = null;
    renderServizi();
  }

  function vaiAOggi() {
    const o = new Date();
    srvAnno = o.getFullYear();
    srvMese = o.getMonth();
    srvGiornoSel = GL.impegni.oggiISO();
    renderServizi();
  }

  function due(n) { return String(n).padStart(2, "0"); }

  // Un lavoro passa i filtri correnti (categoria + attività + cliente)?
  function passaFiltri(s) {
    if (srvFiltroCat && s.cat !== srvFiltroCat) return false;
    if (srvFiltroAtt && s.attivita !== srvFiltroAtt) return false;
    if (srvFiltroCli && s.cliente !== srvFiltroCli) return false;
    return true;
  }
  function filtriAttivi() { return Boolean(srvFiltroCat || srvFiltroAtt || srvFiltroCli); }

  function cambiaModoServizi(modo) {
    srvModo = modo;
    ["mese", "timeline", "persone"].forEach((m) => {
      $("#srv-modo-" + m).classList.toggle("active", modo === m);
    });
    $("#srv-vista-mese").hidden = modo !== "mese";
    $("#srv-vista-timeline").hidden = modo !== "timeline";
    $("#srv-vista-persone").hidden = modo !== "persone";
    renderServizi();
  }

  function renderServizi() {
    $("#srv-titolo").textContent = GL.impegni.nomeMese(srvMese) + " " + srvAnno;
    renderRiepilogoServizi();
    if (srvModo === "timeline") renderTimeline();
    else if (srvModo === "persone") renderCalendarioPersone();
    else { renderGrigliaServizi(); renderDettaglioServizi(); }
    renderEsterni();
  }

  // Colonna a destra: lavori coperti da personale esterno / interinale
  // (nominativi non presenti in anagrafica), raggruppati per giorno.
  function renderEsterni() {
    const cont = $("#srv-esterni");
    const delMese = GL.servizi.delMese(servizi, srvAnno, srvMese).filter(passaFiltri);
    const conEsterni = delMese
      .map((s) => ({ s, esterni: (s.persone || []).filter((p) => !p.id) }))
      .filter((x) => x.esterni.length);

    const totEsterni = conEsterni.reduce((t, x) => t + x.esterni.length, 0);
    const oreEsterne = conEsterni.reduce((t, x) => t + x.esterni.length * GL.servizi.orePersona(x.s), 0);
    let html =
      `<div class="sc-head">` +
        `<h3>Coperti da esterni</h3>` +
        `<span class="sc-kpi ${totEsterni ? "warn" : "ok"}">${totEsterni ? "⚠️ " + totEsterni + " turni · " + GL.impegni.oreFmt(oreEsterne) : "✅ tutto personale interno"}</span>` +
      `</div>`;

    if (!conEsterni.length) {
      html += `<p class="sc-vuoto">Nessun lavoro affidato a esterni in ${GL.impegni.nomeMese(srvMese)}${filtriAttivi() ? " con i filtri attuali" : ""}. 🎉</p>`;
      cont.innerHTML = html;
      return;
    }
    html += `<p class="sc-nota">Turni svolti da nominativi non presenti in anagrafica. Apri il lavoro e usa «Trova personale» per cercare una risorsa interna.</p>`;

    const perGiorno = {};
    conEsterni.forEach((x) => { (perGiorno[x.s.data] = perGiorno[x.s.data] || []).push(x); });
    const giorni = Object.keys(perGiorno).sort();

    html += giorni.map((g) => {
      const items = perGiorno[g].sort((a, b) => b.esterni.length - a.esterni.length);
      const nGiorno = items.reduce((t, x) => t + x.esterni.length, 0);
      const righe = items.map(({ s, esterni }) => `
          <button class="sc-item srv-cat-${s.cat}" data-srv="${s.id}" title="${esc(esterni.map((p) => p.n).join(", "))}">
            <span class="sc-item-dot"></span>
            <span class="sc-item-txt">
              <span class="sc-item-cli">${esc(s.cliente)}</span>
              <span class="sc-item-sub">${esc(s.attivita)}${s.ora ? " · " + esc(s.ora) : ""} — ${esc(esterni.map((p) => p.n).join(", "))}</span>
            </span>
            <span class="sc-item-manca">${esterni.length}</span>
          </button>`).join("");
      return `
        <div class="sc-giorno">
          <div class="sc-giorno-tit"><b>${esc(GL.impegni.formattaData(g))}</b><span>${nGiorno} esterni</span></div>
          ${righe}
        </div>`;
    }).join("");

    cont.innerHTML = html;
    cont.querySelectorAll(".sc-item[data-srv]").forEach((b) => {
      b.addEventListener("click", () => {
        srvGiornoSel = servizi.find((s) => s.id === b.dataset.srv)?.data || srvGiornoSel;
        apriServizio(b.dataset.srv);
      });
    });
  }

  function dipById(id) { return dipendenti.find((d) => d.id === id) || null; }

  function renderRiepilogoServizi() {
    const delMese = GL.servizi.delMese(servizi, srvAnno, srvMese).filter(passaFiltri);
    const nServ = delMese.length;
    const nRis = delMese.reduce((t, s) => t + (s.risorse || 0), 0);
    const ore = delMese.reduce((t, s) => t + GL.servizi.oreTotali(s), 0);
    const persone = new Set();
    delMese.forEach((s) => (s.persone || []).forEach((p) => persone.add(p.id || "x:" + p.n)));
    $("#srv-riepilogo").innerHTML =
      `<span class="srv-kpi"><b>${nServ}</b> lavori</span>` +
      `<span class="srv-kpi"><b>${nRis}</b> turni</span>` +
      `<span class="srv-kpi"><b>${persone.size}</b> persone</span>` +
      `<span class="srv-kpi"><b>${GL.impegni.oreFmt(ore)}</b> lavorate</span>`;
  }

  function renderGrigliaServizi() {
    const celle = GL.impegni.grigliaMese(srvAnno, srvMese);
    $("#srv-griglia").innerHTML = celle
      .map((iso) => {
        if (!iso) return `<div class="srv-cella vuota"></div>`;
        const lista = GL.servizi.delGiorno(servizi, iso).filter(passaFiltri);
        const n = lista.length;
        const cls = ["srv-cella"];
        if (iso === srvGiornoSel) cls.push("sel");
        if (!n) cls.push("scarico");
        const conteggi = GL.servizi.contaPerCategoria(lista, iso);
        const barre = GL.servizi.CATEGORIE
          .filter((c) => conteggi[c.id] > 0)
          .map((c) => `<span class="srv-bar srv-cat-${c.id}" style="flex:${conteggi[c.id]}" title="${esc(c.nome)}: ${conteggi[c.id]}"></span>`)
          .join("");
        return `
        <div class="${cls.join(" ")}" data-iso="${iso}">
          <div class="srv-cella-top">
            <span class="srv-num">${Number(iso.split("-")[2])}</span>
            ${n ? `<span class="srv-count">${n}</span>` : ""}
          </div>
          ${n ? `<div class="srv-barre">${barre}</div>` : `<span class="srv-lib">—</span>`}
        </div>`;
      })
      .join("");
    $("#srv-griglia").querySelectorAll(".srv-cella[data-iso]").forEach((el) => {
      el.addEventListener("click", () => { srvGiornoSel = el.dataset.iso; renderServizi(); });
    });
  }

  function renderDettaglioServizi() {
    const cont = $("#srv-dettaglio");
    if (!srvGiornoSel) {
      cont.innerHTML = `<p class="vuoto">Seleziona un giorno per vedere i servizi.</p>`;
      return;
    }
    const lista = GL.servizi.delGiorno(servizi, srvGiornoSel).filter(passaFiltri);
    const totRis = lista.reduce((t, s) => t + (s.risorse || 0), 0);
    const totOre = lista.reduce((t, s) => t + GL.servizi.oreTotali(s), 0);
    let html = `<h3>${GL.impegni.formattaData(srvGiornoSel)} · <span class="srv-sum">${lista.length} lavori · ${totRis} turni · ${GL.impegni.oreFmt(totOre)}</span></h3>`;
    if (!lista.length) {
      html += `<p class="vuoto">Nessun lavoro in questa data con i filtri attuali.</p>`;
      cont.innerHTML = html;
      return;
    }
    html += `<div class="srv-lista">` + lista.map(cardServizio).join("") + `</div>`;
    cont.innerHTML = html;
    cont.querySelectorAll(".srv-card[data-srv]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button[data-trova]")) return; // il bottone ha la sua azione
        apriServizio(card.dataset.srv);
      });
    });
    cont.querySelectorAll("button[data-trova]").forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); trovaPersonaleServizio(b.dataset.trova); });
    });
  }

  function cardServizio(s) {
    const cat = GL.servizi.catMeta(s.cat);
    const esterni = (s.persone || []).filter((p) => !p.id).length;
    const ora = GL.servizi.oraValida(s.ora)
      ? `⏰ ${esc(GL.servizi.fasciaOraria(s))}`
      : `⏰ <i>orario da definire</i>`;
    const oreTxt = GL.servizi.oreMancanti(s)
      ? `<span class="srv-ore manca" title="Ore non presenti nel file: inserisci l'ora di fine">ore da inserire</span>`
      : `<span class="srv-ore">${GL.impegni.oreFmt(GL.servizi.orePersona(s))} a testa · ${GL.impegni.oreFmt(GL.servizi.oreTotali(s))} totali</span>`;
    const soc = s.societa ? `<div class="srv-rowline">🏢 ${esc(s.societa)}</div>` : "";
    const note = s.note ? `<div class="srv-rowline srv-note">📝 ${esc(s.note)}</div>` : "";
    return `
      <div class="srv-card srv-cat-${s.cat}" data-srv="${s.id}" title="Apri il dettaglio del lavoro">
        <div class="srv-card-stripe"></div>
        <div class="srv-card-body">
          <div class="srv-card-top">
            <span class="srv-cliente">${esc(s.cliente)}</span>
            <span class="srv-badge srv-cat-${s.cat}">${esc(cat.nome)}</span>
          </div>
          <div class="srv-rowline"><span class="srv-att">${esc(s.attivita)}</span> · ${ora}</div>
          <div class="srv-rowline">📍 ${esc(s.indirizzo || "indirizzo da definire")}</div>
          ${soc}${note}
          ${avatarsPersone(s)}
          <div class="srv-card-foot">
            <span class="srv-risorse ${esterni ? "" : "ok"}">👥 ${s.risorse} ${s.risorse === 1 ? "persona" : "persone"}${esterni ? ` · ${esterni} esterni` : ""}</span>
            ${oreTxt}
            <button class="btn ghost" data-trova="${s.id}">🔎 Trova personale</button>
          </div>
        </div>
      </div>`;
  }

  // Riga con gli avatar delle persone che svolgono il lavoro (esterni tratteggiati).
  function avatarsPersone(s) {
    const persone = s.persone || [];
    if (!persone.length) return "";
    return `<div class="srv-avatars">` + persone
      .map((p) => `<span class="srv-av ${p.id ? "" : "esterno"}" style="background:hsl(${tonoPersona(p.n)} 58% 52%)" title="${esc(p.n)}${p.id ? "" : " (esterno)"}">${esc(iniziali(p.n))}</span>`)
      .join("") + `</div>`;
  }

  // ---- Modalità Timeline (Gantt): righe = cliente, colonne = giorni ----
  function renderTimeline() {
    const cont = $("#srv-vista-timeline");
    const giorniNelMese = new Date(srvAnno, srvMese + 1, 0).getDate();
    const giorni = [];
    for (let g = 1; g <= giorniNelMese; g++) {
      const d = new Date(srvAnno, srvMese, g);
      const dow = ["D", "L", "M", "M", "G", "V", "S"][d.getDay()];
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      giorni.push({ g, iso: GL.impegni.iso(d), dow, weekend });
    }
    const N = giorni.length;
    const colTempl = `repeat(${N}, 46px)`;

    // Servizi del mese che passano i filtri, raggruppati per cliente.
    const mese = `${srvAnno}-${due(srvMese + 1)}`;
    const delMese = servizi.filter((s) => s.data && s.data.startsWith(mese) && passaFiltri(s));
    const perCliente = {};
    delMese.forEach((s) => { (perCliente[s.cliente] = perCliente[s.cliente] || []).push(s); });
    const clienti = Object.keys(perCliente).sort((a, b) => a.localeCompare(b));

    if (!clienti.length) {
      cont.innerHTML = `<p class="vuoto">Nessun servizio in ${GL.impegni.nomeMese(srvMese)} ${srvAnno} con i filtri attuali.</p>`;
      return;
    }

    // Intestazione: angolo + una cella per giorno.
    const headCelle = giorni
      .map((d) => `<div class="tl-h ${d.weekend ? "we" : ""}"><b>${d.g}</b><span>${d.dow}</span></div>`)
      .join("");
    let html =
      `<div class="tl-scroll"><div class="tl">` +
      `<div class="tl-headrow">` +
        `<div class="tl-corner">CLIENTE / CANTIERE</div>` +
        `<div class="tl-headtrack" style="grid-template-columns:${colTempl}">${headCelle}</div>` +
      `</div>`;

    clienti.forEach((cli) => {
      const lanes = disponiInCorsie(perCliente[cli]);
      const nLane = Math.max(1, lanes.length);
      // Sfondo: una cella per giorno che copre tutte le corsie.
      const bg = giorni
        .map((d) => `<div class="tl-bg ${d.weekend ? "we" : ""}" style="grid-column:${d.g};grid-row:1/${nLane + 1}"></div>`)
        .join("");
      const barre = [];
      lanes.forEach((lane, li) => {
        lane.forEach((s) => {
          const giorno = Number(s.data.split("-")[2]);
          const esterni = (s.persone || []).filter((p) => !p.id).length;
          const et = `${s.attivita}${s.ora ? " " + s.ora : ""} · ${s.risorse}👥`;
          const tip = `${cli} — ${et}\n${(s.persone || []).map((p) => p.n).join(", ")}`;
          barre.push(
            `<div class="tl-bar srv-cat-${s.cat} ${esterni ? "manca" : "ok"}" style="grid-column:${giorno};grid-row:${li + 1}" data-srv="${s.id}" title="${esc(tip)}"><span>${esc(et)}</span></div>`
          );
        });
      });
      html +=
        `<div class="tl-row">` +
          `<div class="tl-cli" title="${esc(cli)}">${esc(cli)}</div>` +
          `<div class="tl-track" style="grid-template-columns:${colTempl};grid-template-rows:repeat(${nLane}, 26px)">${bg}${barre.join("")}</div>` +
        `</div>`;
    });
    html += `</div></div>`;
    cont.innerHTML = html;
    cont.querySelectorAll(".tl-bar[data-srv]").forEach((el) => {
      el.addEventListener("click", () => apriServizio(el.dataset.srv));
    });
  }

  // Distribuisce i servizi di un cliente in corsie così che due lavori nello
  // stesso giorno non si sovrappongano (una corsia = un servizio per giorno).
  function disponiInCorsie(lista) {
    const ordinati = lista.slice().sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const lanes = [];
    ordinati.forEach((s) => {
      let lane = lanes.find((L) => !L.some((x) => x.data === s.data));
      if (!lane) { lane = []; lanes.push(lane); }
      lane.push(s);
    });
    return lanes;
  }

  // Modale dettaglio lavoro: chi lo svolge (nomi completi) e quante ore.
  function apriServizio(id) {
    const s = servizi.find((x) => x.id === id);
    if (!s) return;
    const cat = GL.servizi.catMeta(s.cat);
    const persone = s.persone || [];
    const esterni = persone.filter((p) => !p.id).length;

    const righePersone = persone
      .map((p) => {
        const d = p.id ? dipById(p.id) : null;
        const meta = d
          ? `${esc(d.mansioni[0] || "—")}${d.telefono ? " · 📞 " + esc(d.telefono) : ""}`
          : `risorsa esterna / interinale`;
        const casa = d ? `<div class="sd-dip-meta">🏠 ${esc(d.indirizzo || "—")}</div>` : "";
        return `
        <div class="sd-dip ${d ? "" : "esterna"}">
          <span class="cal-avatar" style="background:hsl(${tonoPersona(p.n)} 58% 52%)">${esc(iniziali(p.n))}</span>
          <div class="sd-dip-info">
            <div class="sd-dip-nome">${esc(p.n)}</div>
            <div class="sd-dip-meta">${meta}</div>
            ${casa}
          </div>
        </div>`;
      })
      .join("");

    const ore = GL.servizi.orePersona(s);
    const durataTxt = GL.servizi.oreMancanti(s)
      ? `⚠️ ore non presenti nel file: inserisci l'ora di fine`
      : `${GL.impegni.oreFmt(ore)} a persona · ${GL.impegni.oreFmt(GL.servizi.oreTotali(s))} totali`;
    const oraLine = GL.servizi.oraValida(s.ora)
      ? `⏰ Inizio <b>${esc(s.ora)}</b> · Fine
         <input type="time" id="sd-orafine" class="sd-orafine" value="${esc(s.oraFine || "")}" />
         <span class="sd-durata ${GL.servizi.oreMancanti(s) ? "" : "reale"}">${durataTxt}</span>`
      : `⏰ orario da definire`;

    $("#servizio-dettaglio").innerHTML = `
      <div class="sd-head">
        <h2>${esc(s.cliente)}</h2>
        <span class="srv-badge srv-cat-${s.cat}">${esc(cat.nome)}</span>
      </div>
      <div class="sd-riga"><span class="srv-att">${esc(s.attivita)}</span></div>
      <div class="sd-riga sd-orario">${oraLine}</div>
      ${s.pausa ? `<div class="sd-riga">☕ Pausa ${esc(s.pausa)}</div>` : ""}
      <div class="sd-riga">📅 ${s.data ? GL.impegni.formattaData(s.data) : "data da definire"}</div>
      <div class="sd-riga">📍 ${esc(s.indirizzo || "indirizzo da definire")}</div>
      ${s.societa ? `<div class="sd-riga">🏢 ${esc(s.societa)}</div>` : ""}
      ${s.rimborsi ? `<div class="sd-riga">🎫 Rimborsi: ${esc(GL.economia.euro(s.rimborsi, 2))}</div>` : ""}
      ${s.note ? `<div class="sd-riga sd-note">📝 ${esc(s.note)}</div>` : ""}
      <h3 class="sd-sub">Persone sul lavoro
        <span class="srv-risorse ${esterni ? "" : "ok"}">${persone.length}${esterni ? ` · ${esterni} esterni` : ""}</span>
      </h3>
      <div class="sd-dips">${righePersone || '<p class="vuoto">Nessuna persona indicata nel file.</p>'}</div>
      <div class="modal-actions">
        <button id="sd-trova" type="button" class="btn primary">🔎 Trova personale interno</button>
      </div>`;
    $("#sd-trova").addEventListener("click", () => { chiudiServizio(); trovaPersonaleServizio(s.id); });
    const inpFine = $("#sd-orafine");
    if (inpFine) inpFine.addEventListener("change", () => onCambiaOraFine(s.id, inpFine.value));
    $("#modal-servizio").hidden = false;
  }
  function chiudiServizio() { $("#modal-servizio").hidden = true; }

  // L'utente corregge l'ora di fine: le ore del lavoro vengono ricalcolate
  // (pausa esclusa) e con esse tutti i conteggi, compresi costi e ricavi.
  function onCambiaOraFine(id, valore) {
    const s = servizi.find((x) => x.id === id);
    if (!s) return;
    const ore = valore ? GL.servizi.durataDaOrari(s.ora, valore, s.pausa) : null;
    if (valore && !ore) {
      const el = $(".sd-durata");
      if (el) { el.textContent = "⚠️ ora di fine non valida"; el.classList.add("errore"); }
      return;
    }
    servizi = servizi.map((x) =>
      x.id === id
        ? { ...x, oraFine: valore || "", ore: ore ? Math.round(ore * 100) / 100 : x.ore, oreStimate: false }
        : x
    );
    GL.servizi.salvaOreFine(servizi);
    impDerivati = GL.servizi.impegniPerDipendente(servizi);
    renderServizi();
    apriServizio(id); // riapri aggiornato
  }

  // Ponte: dal servizio salta a "Cerca personale" con indirizzo, data/ora e mansioni precompilati.
  function trovaPersonaleServizio(id) {
    const s = servizi.find((x) => x.id === id);
    if (!s) return;
    mostraVista("cerca");

    // Indirizzo: se è un link Maps non lo usiamo come testo di ricerca.
    const indirizzoValido = s.indirizzo && !/^https?:\/\//i.test(s.indirizzo);
    $("#input-indirizzo").value = indirizzoValido ? s.indirizzo : "";
    lavoroSelezionato = null;
    nascondiSuggerimenti();

    // Data e ora del lavoro.
    if (s.data) GL.datepicker.setValue($("#input-data"), s.data + "T" + (s.ora || "08:00"));

    // Mansioni: spunta quelle che corrispondono all'attività del servizio.
    const match = GL.servizi.mansioniPerAttivita(s.attivita, MANSIONI);
    const boxes = Array.from($("#mansioni-richieste").querySelectorAll("input[type=checkbox]"));
    if (match.length) boxes.forEach((b) => { b.checked = match.includes(b.value); });

    const nota = `Lavoro «${s.cliente}» — ${s.attivita}${s.ora ? " ore " + s.ora : ""}. ` +
      (indirizzoValido ? "Premi «Consiglia personale»." : "Indirizzo non testuale: inseriscilo a mano, poi «Consiglia personale».");
    setStato($("#form-stato"), nota, "");
    $("#input-indirizzo").focus();
  }

  // ============================================================
  //  Utility
  // ============================================================
  function aggiornaStatoApp() {
    const sa = $("#stato-app");
    if (!sa) return;
    const meta = window.GL_SERVIZI_META || {};
    const ore = servizi.reduce((t, s) => t + GL.servizi.oreTotali(s), 0);
    sa.textContent = `build 19 · ${dipendenti.length} dipendenti · ${servizi.length} lavori` +
      `${meta.risorse ? " · " + meta.risorse + " turni" : ""} · ${GL.impegni.oreFmt(ore)}`;
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
