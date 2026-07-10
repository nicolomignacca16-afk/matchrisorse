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

  // --- Stato vista Servizi (calendario dei lavori) ---
  let servizi = [];
  let srvAnno = 0, srvMese = 0, srvGiornoSel = null;
  let srvFiltroCat = null;  // null = tutte le categorie
  let srvFiltroAtt = "";     // "" = tutte le attività
  let srvModo = "timeline";  // "mese" | "timeline" — Timeline è la vista predefinita

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
    initServiziStato();
    initMappa();
    bindEventi();
    initDatePicker();
    renderListaDipendenti();
    initServizi();
    aggiornaStatoApp();
  }

  // Prepara lo stato della vista Servizi: mese con dati + primo giorno che ha servizi.
  // Versione del motore/dati di assegnazione: va incrementata quando cambiano la
  // logica di assegnazione, le durate stimate o l'elenco servizi (ID diversi).
  // Così, al reload, le assegnazioni "vecchie" salvate nel browser vengono rigenerate.
  const ENGINE_VERSION = "2026-07-10c";
  const ENGINE_VERSION_KEY = "gl_servizi_engine_v";

  function initServiziStato() {
    servizi = GL.servizi.carica();
    const mi = GL.servizi.meseIniziale();
    srvAnno = mi.anno;
    srvMese = mi.mese;
    srvGiornoSel = primoGiornoConServizi() || GL.impegni.iso(new Date(srvAnno, srvMese, 1));
    // Assegna in automatico se non c'è nulla di salvato OPPURE se le assegnazioni
    // salvate sono state generate da una versione precedente (dati/logica cambiati).
    let verSalvata = null;
    try { verSalvata = localStorage.getItem(ENGINE_VERSION_KEY); } catch (e) { /* ignora */ }
    const giaAssegnato = servizi.some((s) => (s.assegnati || []).length);
    if (!giaAssegnato || verSalvata !== ENGINE_VERSION) {
      assegnaAutomatico({ soloVuoti: false, salva: true });
      try { localStorage.setItem(ENGINE_VERSION_KEY, ENGINE_VERSION); } catch (e) { /* ignora */ }
    }
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

    $("#btn-persona-x").addEventListener("click", chiudiPersona);
    $("#modal-persona").addEventListener("click", (e) => { if (e.target.id === "modal-persona") chiudiPersona(); });

    $("#btn-servizio-x").addEventListener("click", chiudiServizio);
    $("#modal-servizio").addEventListener("click", (e) => { if (e.target.id === "modal-servizio") chiudiServizio(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { chiudiModale(); chiudiImpegni(); chiudiPwd(); chiudiPersona(); chiudiServizio(); }
    });

    $("#cal-prev").addEventListener("click", () => cambiaMese(-1));
    $("#cal-next").addEventListener("click", () => cambiaMese(1));
    $("#cal-oggi").addEventListener("click", vaiAOggi);

    // Vista Servizi
    $("#srv-prev").addEventListener("click", () => cambiaMeseServizi(-1));
    $("#srv-next").addEventListener("click", () => cambiaMeseServizi(1));
    $("#srv-att").addEventListener("change", (e) => { srvFiltroAtt = e.target.value; renderServizi(); });
    $("#srv-modo-mese").addEventListener("click", () => cambiaModoServizi("mese"));
    $("#srv-modo-timeline").addEventListener("click", () => cambiaModoServizi("timeline"));
    $("#srv-assegna").addEventListener("click", onAssegnaRisorse);
    $("#srv-pulisci").addEventListener("click", onPulisciAssegnazioni);
  }

  function mostraVista(quale) {
    $("#view-servizi").hidden = quale !== "servizi";
    $("#view-cerca").hidden = quale !== "cerca";
    $("#view-dipendenti").hidden = quale !== "dipendenti";
    $("#view-calendario").hidden = quale !== "calendario";
    $("#tab-servizi").classList.toggle("active", quale === "servizi");
    $("#tab-cerca").classList.toggle("active", quale === "cerca");
    $("#tab-dipendenti").classList.toggle("active", quale === "dipendenti");
    $("#tab-calendario").classList.toggle("active", quale === "calendario");
    if (quale === "cerca") setTimeout(() => map.invalidateSize(), 100);
    else if (quale === "servizi") renderServizi();
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
          ? `<div class="dip-info">📅 Oggi: ${impOggi.map((i) => esc(titoloImpegno(i) + " " + fasciaOggi(i, oggi))).join(" · ")}</div>`
          : "";
        const sovra = GL.impegni.settimaneSovraccarico(d);
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
    const imp = (d.impegni || []).slice().sort((a, b) => (a.dal < b.dal ? -1 : 1));
    if (!imp.length) {
      cont.innerHTML = `<p class="vuoto">Nessun periodo inserito: la persona risulta sempre disponibile.</p>`;
    } else {
      cont.innerHTML = imp
        .map((i) => {
          const attivo = adesso >= i.dal && adesso <= i.al;
          const nota = i.note && i.titolo ? " · " + esc(i.note) : "";
          return `
          <div class="imp-riga ${attivo ? "attivo" : ""}">
            <span>📅 <b>${esc(titoloImpegno(i))}</b> · ${GL.impegni.descrivi(i)}${nota}${attivo ? ' <span class="badge occ">in corso</span>' : ""}</span>
            <button class="btn ghost link-danger" data-imp="${i.id}">Rimuovi</button>
          </div>`;
        })
        .join("");
      cont.querySelectorAll("button[data-imp]").forEach((b) => {
        b.addEventListener("click", () => rimuoviImpegno(b.dataset.imp));
      });
    }
    renderRiepilogoOre();
  }

  // Riepilogo ore assegnate per settimana, con alert se superano il contratto.
  function renderRiepilogoOre() {
    const d = dipendenti.find((x) => x.id === impegniDipId);
    const cont = $("#impegni-ore");
    if (!d) { cont.innerHTML = ""; return; }
    const contr = parseFloat(d.orarioContrattuale);
    const m = GL.impegni.orePerSettimana(d);
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
      const payload = { seed: dipendenti, mansioni: GL.data.mansioni(), servizi: servizi.map(scartaAssegnati) };
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
            .map((i) => `<span class="cal-slot">${esc(fasciaOggi(i, calGiornoSel))} · ${esc(titoloImpegno(i))}</span>`)
            .join("");
          return `<div class="cal-persona" data-id="${d.id}" title="Clicca per il dettaglio">
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
    cont.querySelectorAll(".cal-persona[data-id]").forEach((el) => {
      el.addEventListener("click", () => apriPersona(el.dataset.id, calGiornoSel));
    });
  }

  // Dettaglio persona (dal calendario): titolo lavoro, durata, dove.
  function apriPersona(id, giorno) {
    const d = dipendenti.find((x) => x.id === id);
    if (!d) return;
    const imp = GL.impegni.impegniGiorno(d, giorno);
    const lavori = imp
      .map((i) => `
        <div class="pd-lavoro">
          <div class="pd-titolo">🏷️ ${esc(titoloImpegno(i))}</div>
          <div class="pd-riga">⏳ Dal ${esc(GL.impegni.formattaDataOra(i.dal))} <b>fino al ${esc(GL.impegni.formattaDataOra(i.al))}</b> <span class="pd-dur">(${GL.impegni.oreFmt(GL.impegni.oreImpegno(i))})</span></div>
          <div class="pd-riga">📍 Dove: ${esc(i.note || "luogo non indicato")}</div>
        </div>`)
      .join("");
    $("#persona-dettaglio").innerHTML = `
      <div class="pd-head">
        <span class="cal-avatar" style="background:hsl(${tonoPersona(d.nome)} 58% 52%)">${esc(iniziali(d.nome))}</span>
        <div>
          <h2>${esc(d.nome)}</h2>
          <div class="pd-mans">${esc(d.mansioni.join(" · "))}</div>
        </div>
      </div>
      <div class="pd-riga">📞 ${esc(d.telefono || "—")}</div>
      <div class="pd-riga">🏠 Domicilio: ${esc(d.indirizzo)}</div>
      <h3 class="pd-sub">Impegni del ${GL.impegni.formattaData(giorno)}</h3>
      ${lavori || '<p class="vuoto">Nessun impegno in questa data.</p>'}`;
    $("#modal-persona").hidden = false;
  }
  function chiudiPersona() { $("#modal-persona").hidden = true; }

  // ============================================================
  //  Servizi (calendario dei lavori — logica ribaltata: parte dal servizio)
  // ============================================================
  // Toglie il campo runtime "assegnati" prima di cifrare/pubblicare.
  function scartaAssegnati(s) { const { assegnati, ...rest } = s; return rest; }

  // Prepara le parti statiche della vista (una volta sola): legenda e filtri.
  function initServizi() {
    renderLegendaServizi();
    renderFiltriCategoria();
    const sel = $("#srv-att");
    const opts = GL.servizi.attivitaDistinte(servizi)
      .map((a) => `<option value="${esc(a)}">${esc(a)}</option>`)
      .join("");
    sel.innerHTML = `<option value="">Tutte</option>` + opts;
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

  function due(n) { return String(n).padStart(2, "0"); }

  // Un servizio passa i filtri correnti (categoria + attività)?
  function passaFiltri(s) {
    if (srvFiltroCat && s.cat !== srvFiltroCat) return false;
    if (srvFiltroAtt && s.attivita !== srvFiltroAtt) return false;
    return true;
  }

  function cambiaModoServizi(modo) {
    srvModo = modo;
    $("#srv-modo-mese").classList.toggle("active", modo === "mese");
    $("#srv-modo-timeline").classList.toggle("active", modo === "timeline");
    $("#srv-vista-mese").hidden = modo !== "mese";
    $("#srv-vista-timeline").hidden = modo !== "timeline";
    renderServizi();
  }

  function renderServizi() {
    $("#srv-titolo").textContent = GL.impegni.nomeMese(srvMese) + " " + srvAnno;
    renderRiepilogoServizi();
    if (srvModo === "timeline") {
      renderTimeline();
    } else {
      renderGrigliaServizi();
      renderDettaglioServizi();
    }
    renderScoperti();
  }

  // Colonna a destra: riepilogo dei lavori scoperti (mancano risorse) nel mese,
  // rispettando i filtri correnti, raggruppati per giorno.
  function renderScoperti() {
    const cont = $("#srv-scoperti");
    const mese = `${srvAnno}-${due(srvMese + 1)}`;
    const scoperti = servizi
      .filter((s) => s.data && s.data.startsWith(mese) && passaFiltri(s))
      .map((s) => ({ s, manca: s.risorse - Math.min((s.assegnati || []).length, s.risorse) }))
      .filter((x) => x.manca > 0);

    const totManca = scoperti.reduce((t, x) => t + x.manca, 0);
    let html =
      `<div class="sc-head">` +
        `<h3>Lavori scoperti</h3>` +
        `<span class="sc-kpi ${totManca ? "warn" : "ok"}">${totManca ? "⚠️ " + totManca + " risorse mancanti" : "✅ tutto coperto"}</span>` +
      `</div>`;

    if (!scoperti.length) {
      html += `<p class="sc-vuoto">Nessun lavoro scoperto in ${GL.impegni.nomeMese(srvMese)}${srvFiltroCat || srvFiltroAtt ? " con i filtri attuali" : ""}. 🎉</p>`;
      cont.innerHTML = html;
      return;
    }

    // Raggruppa per giorno.
    const perGiorno = {};
    scoperti.forEach((x) => { (perGiorno[x.s.data] = perGiorno[x.s.data] || []).push(x); });
    const giorni = Object.keys(perGiorno).sort();

    html += giorni.map((g) => {
      const items = perGiorno[g].sort((a, b) => b.manca - a.manca);
      const mancaGiorno = items.reduce((t, x) => t + x.manca, 0);
      const righe = items.map(({ s, manca }) => {
        const cat = GL.servizi.catMeta(s.cat);
        return `
          <button class="sc-item srv-cat-${s.cat}" data-srv="${s.id}" title="Apri il dettaglio del servizio">
            <span class="sc-item-dot"></span>
            <span class="sc-item-txt">
              <span class="sc-item-cli">${esc(s.cliente)}</span>
              <span class="sc-item-sub">${esc(s.attivita)}${s.ora ? " · " + esc(s.ora) : ""}</span>
            </span>
            <span class="sc-item-manca">−${manca}</span>
          </button>`;
      }).join("");
      return `
        <div class="sc-giorno">
          <div class="sc-giorno-tit"><b>${esc(GL.impegni.formattaData(g))}</b><span>${mancaGiorno} mancanti</span></div>
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

  // ---- Assegnazione automatica delle risorse ai lavori ----
  function dipById(id) { return dipendenti.find((d) => d.id === id) || null; }

  const CONTRATTO_ORE_DEFAULT = 40; // monte ore settimanale se il dipendente non lo indica
  // Durata stimata di un servizio per tipo di attività (l'Excel non ha l'ora di fine).
  // Valori realistici e volutamente contenuti: così una persona può incastrare più
  // lavori nella giornata restando entro il proprio monte ore settimanale.
  const DURATE_ATTIVITA = {
    "Pulizie": 2,
    "Facchinaggio": 3,
    "Montaggio": 4,
    "Magazziniere": 4,
    "Confezionamento": 3,
    "Assist. ascensori": 3,
    "Assistenza": 2,
  };
  const ORE_SERVIZIO_DEFAULT = 3;
  function oraInMin(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  // Durata del servizio in ore: esatta se c'è l'ora di fine (inserita nel gestionale),
  // altrimenti stima per tipo di attività.
  function durataServizio(s) {
    const inizio = oraInMin(s.ora), fine = oraInMin(s.oraFine);
    if (inizio != null && fine != null && fine > inizio) return (fine - inizio) / 60;
    return DURATE_ATTIVITA[s.attivita] || ORE_SERVIZIO_DEFAULT;
  }
  // È stata inserita un'ora di fine valida per questo servizio?
  function haOraFine(s) {
    const inizio = oraInMin(s.ora), fine = oraInMin(s.oraFine);
    return inizio != null && fine != null && fine > inizio;
  }

  // Intervallo orario occupato da un servizio, in minuti dall'inizio giornata.
  // Se manca l'ora di inizio, il servizio è "non temporizzato" e occupa tutto il giorno.
  function intervalloServizio(s) {
    if (!s.ora || !/^\d{1,2}:\d{2}$/.test(s.ora)) return { start: 0, end: 1440, untimed: true };
    const [h, m] = s.ora.split(":").map(Number);
    const start = h * 60 + m;
    return { start, end: start + durataServizio(s) * 60, untimed: false };
  }
  // Due intervalli si sovrappongono? (i non temporizzati sono in conflitto per prudenza)
  function sovrappone(a, b) {
    if (a.untimed || b.untimed) return true;
    return a.start < b.end && b.start < a.end;
  }
  function contrattoOre(d) {
    const v = parseFloat(d.orarioContrattuale);
    return v && !isNaN(v) ? v : CONTRATTO_ORE_DEFAULT;
  }

  // Assegna a ogni servizio le risorse richieste: mansione compatibile, senza
  // sovrapposizioni di orario nello stesso giorno e senza superare il MONTE ORE
  // SETTIMANALE del dipendente; bilancia il carico.
  function assegnaAutomatico({ soloVuoti = true, salva = true } = {}) {
    const occ = {};       // "YYYY-MM-DD" -> Map(idDip -> [intervalli])
    const oreSett = {};   // idDip -> { "lunedìISO" -> ore assegnate quella settimana }

    if (!soloVuoti) servizi.forEach((s) => { s.assegnati = []; });
    // Semina lo stato con le assegnazioni già presenti (che vogliamo mantenere).
    servizi.forEach((s) => {
      if (!s.data) return;
      const iv = intervalloServizio(s);
      const wk = GL.impegni.lunediISO(s.data);
      const mappa = occ[s.data] = occ[s.data] || new Map();
      const dur = durataServizio(s);
      (s.assegnati || []).forEach((id) => {
        (mappa.get(id) || mappa.set(id, []).get(id)).push(iv);
        (oreSett[id] = oreSett[id] || {})[wk] = (oreSett[id]?.[wk] || 0) + dur;
      });
    });

    const ordinati = servizi.slice().sort(ordineAssegnazione);
    ordinati.forEach((s) => {
      if (!s.data) return;
      s.assegnati = s.assegnati || [];
      if (s.assegnati.length >= s.risorse) return;
      const iv = intervalloServizio(s);
      const dur = durataServizio(s);
      const wk = GL.impegni.lunediISO(s.data);
      const mappa = occ[s.data] = occ[s.data] || new Map();

      const candidati = GL.servizi.candidatiPerAttivita(dipendenti, s.attivita)
        .filter((d) => !s.assegnati.includes(d.id))
        // niente sovrapposizioni di orario nello stesso giorno
        .filter((d) => !(mappa.get(d.id) || []).some((x) => sovrappone(x, iv)))
        // rispetta il monte ore settimanale
        .filter((d) => (oreSett[d.id]?.[wk] || 0) + dur <= contrattoOre(d) + 0.001)
        // preferisci chi ha usato meno ore nella settimana (bilanciamento)
        .sort((a, b) => (oreSett[a.id]?.[wk] || 0) - (oreSett[b.id]?.[wk] || 0));

      for (const d of candidati) {
        if (s.assegnati.length >= s.risorse) break;
        s.assegnati.push(d.id);
        (mappa.get(d.id) || mappa.set(d.id, []).get(d.id)).push(iv);
        (oreSett[d.id] = oreSett[d.id] || {})[wk] = (oreSett[d.id]?.[wk] || 0) + dur;
      }
    });
    if (salva) GL.servizi.salvaAssegnazioni(servizi);
  }

  // Ordine di priorità nell'assegnazione: prima per data, poi per categoria
  // (fisso mensile prima), poi i lavori che chiedono più persone.
  function ordineAssegnazione(a, b) {
    if (a.data !== b.data) return (a.data || "9999").localeCompare(b.data || "9999");
    const pr = { verde: 0, azzurro: 1, viola: 2, bianco: 3 };
    const pa = pr[a.cat] ?? 9, pb = pr[b.cat] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.risorse || 0) - (a.risorse || 0);
  }

  function onAssegnaRisorse() {
    assegnaAutomatico({ soloVuoti: true, salva: true });
    renderServizi();
    const done = servizi.reduce((t, s) => t + Math.min((s.assegnati || []).length, s.risorse), 0);
    const tot = servizi.reduce((t, s) => t + s.risorse, 0);
    flashRiepilogo(`✅ Assegnate ${done}/${tot} risorse`);
  }

  function onPulisciAssegnazioni() {
    if (!confirm("Rimuovere tutte le assegnazioni fatte?")) return;
    servizi.forEach((s) => { s.assegnati = []; });
    GL.servizi.salvaAssegnazioni(servizi);
    renderServizi();
  }

  // Messaggio temporaneo accanto al riepilogo.
  let flashTimer = null;
  function flashRiepilogo(testo) {
    const el = document.createElement("span");
    el.className = "srv-flash";
    el.textContent = testo;
    $("#srv-riepilogo").appendChild(el);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.remove(), 3500);
  }

  function renderRiepilogoServizi() {
    const delMese = servizi.filter((s) => s.data && s.data.startsWith(`${srvAnno}-${due(srvMese + 1)}`) && passaFiltri(s));
    const nServ = delMese.length;
    const nRis = delMese.reduce((t, s) => t + (s.risorse || 0), 0);
    $("#srv-riepilogo").innerHTML =
      `<span class="srv-kpi"><b>${nServ}</b> servizi</span>` +
      `<span class="srv-kpi"><b>${nRis}</b> risorse richieste</span>`;
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
    let html = `<h3>${GL.impegni.formattaData(srvGiornoSel)} · <span class="srv-sum">${lista.length} servizi · ${totRis} risorse</span></h3>`;
    if (!lista.length) {
      html += `<p class="vuoto">Nessun servizio in questa data con i filtri attuali.</p>`;
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
    const nAss = (s.assegnati || []).length;
    const completo = nAss >= s.risorse;
    const ora = s.ora ? `⏰ ${esc(s.ora)}` : `⏰ <i>orario da definire</i>`;
    const soc = s.societa ? `<div class="srv-rowline">🏢 ${esc(s.societa)}</div>` : "";
    const note = s.note ? `<div class="srv-rowline srv-note">📝 ${esc(s.note)}</div>` : "";
    return `
      <div class="srv-card srv-cat-${s.cat}" data-srv="${s.id}" title="Apri il dettaglio del servizio">
        <div class="srv-card-stripe"></div>
        <div class="srv-card-body">
          <div class="srv-card-top">
            <span class="srv-cliente">${esc(s.cliente)}</span>
            <span class="srv-badge srv-cat-${s.cat}">${esc(cat.nome)}</span>
          </div>
          <div class="srv-rowline"><span class="srv-att">${esc(s.attivita)}</span> · ${ora}</div>
          <div class="srv-rowline">📍 ${esc(s.indirizzo || "indirizzo da definire")}</div>
          ${soc}${note}
          ${avatarsAssegnati(s)}
          <div class="srv-card-foot">
            <span class="srv-risorse ${completo ? "ok" : ""}">👥 ${nAss}/${s.risorse} risorse assegnate</span>
            <button class="btn ghost" data-trova="${s.id}">🔎 Trova personale</button>
          </div>
        </div>
      </div>`;
  }

  // Riga con gli avatar dei dipendenti assegnati al servizio (+ eventuali mancanti).
  function avatarsAssegnati(s) {
    const ass = (s.assegnati || []).map(dipById).filter(Boolean);
    const mancano = Math.max(0, s.risorse - ass.length);
    if (!ass.length && !mancano) return "";
    const chips = ass
      .map((d) => `<span class="srv-av" style="background:hsl(${tonoPersona(d.nome)} 58% 52%)" title="${esc(d.nome)}">${esc(iniziali(d.nome))}</span>`)
      .join("");
    const vuoti = Array.from({ length: mancano })
      .map(() => `<span class="srv-av vuoto" title="Risorsa da assegnare">?</span>`)
      .join("");
    return `<div class="srv-avatars">${chips}${vuoti}</div>`;
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
          const nAss = Math.min((s.assegnati || []).length, s.risorse);
          const completo = nAss >= s.risorse;
          const et = `${s.attivita}${s.ora ? " " + s.ora : ""} · ${nAss}/${s.risorse}👥`;
          barre.push(
            `<div class="tl-bar srv-cat-${s.cat} ${completo ? "ok" : "manca"}" style="grid-column:${giorno};grid-row:${li + 1}" data-srv="${s.id}" title="${esc(cli)} — ${esc(et)}"><span>${esc(et)}</span></div>`
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

  // Modale dettaglio servizio: mostra le risorse assegnate con NOME COMPLETO.
  function apriServizio(id) {
    const s = servizi.find((x) => x.id === id);
    if (!s) return;
    const cat = GL.servizi.catMeta(s.cat);
    const ass = (s.assegnati || []).map(dipById).filter(Boolean);
    const mancano = Math.max(0, s.risorse - ass.length);
    const completo = mancano === 0;

    const righeDip = ass
      .map((d) => `
        <div class="sd-dip">
          <span class="cal-avatar" style="background:hsl(${tonoPersona(d.nome)} 58% 52%)">${esc(iniziali(d.nome))}</span>
          <div class="sd-dip-info">
            <div class="sd-dip-nome">${esc(d.nome)}</div>
            <div class="sd-dip-meta">${esc(d.mansioni[0] || "—")}${d.telefono ? " · 📞 " + esc(d.telefono) : ""}</div>
            <div class="sd-dip-meta">🏠 ${esc(d.indirizzo || "—")}</div>
          </div>
        </div>`)
      .join("");
    const righeVuote = Array.from({ length: mancano })
      .map(() => `
        <div class="sd-dip vuoto">
          <span class="cal-avatar sd-av-vuoto">?</span>
          <div class="sd-dip-info"><div class="sd-dip-nome">Risorsa da assegnare</div>
          <div class="sd-dip-meta">nessun dipendente libero (mansione, orario o monte ore settimanale)</div></div>
        </div>`)
      .join("");

    const durata = durataServizio(s);
    const durataTxt = haOraFine(s)
      ? `durata ${oreLabel(durata)}`
      : `durata stimata ${oreLabel(durata)}`;
    const oraLine = s.ora
      ? `⏰ Inizio <b>${esc(s.ora)}</b> · Fine
         <input type="time" id="sd-orafine" class="sd-orafine" value="${esc(s.oraFine || "")}" />
         <span class="sd-durata ${haOraFine(s) ? "reale" : ""}">${durataTxt}</span>`
      : `⏰ orario da definire`;

    $("#servizio-dettaglio").innerHTML = `
      <div class="sd-head">
        <h2>${esc(s.cliente)}</h2>
        <span class="srv-badge srv-cat-${s.cat}">${esc(cat.nome)}</span>
      </div>
      <div class="sd-riga"><span class="srv-att">${esc(s.attivita)}</span></div>
      <div class="sd-riga sd-orario">${oraLine}</div>
      <div class="sd-riga">📅 ${s.data ? GL.impegni.formattaData(s.data) : "data da definire"}</div>
      <div class="sd-riga">📍 ${esc(s.indirizzo || "indirizzo da definire")}</div>
      ${s.societa ? `<div class="sd-riga">🏢 ${esc(s.societa)}</div>` : ""}
      ${s.note ? `<div class="sd-riga sd-note">📝 ${esc(s.note)}</div>` : ""}
      <h3 class="sd-sub">Risorse assegnate <span class="srv-risorse ${completo ? "ok" : ""}">${ass.length}/${s.risorse}</span></h3>
      <div class="sd-dips">${righeDip || ""}${righeVuote}</div>
      <div class="modal-actions">
        <button id="sd-trova" type="button" class="btn primary">🔎 Trova / cambia personale</button>
      </div>`;
    $("#sd-trova").addEventListener("click", () => { chiudiServizio(); trovaPersonaleServizio(s.id); });
    const inpFine = $("#sd-orafine");
    if (inpFine) inpFine.addEventListener("change", () => onCambiaOraFine(s.id, inpFine.value));
    $("#modal-servizio").hidden = false;
  }
  function chiudiServizio() { $("#modal-servizio").hidden = true; }

  // Formatta le ore: 3 -> "3h", 2.5 -> "2h30".
  function oreLabel(h) {
    const H = Math.floor(h + 1e-9);
    const M = Math.round((h - H) * 60);
    return M ? `${H}h${String(M).padStart(2, "0")}` : `${H}h`;
  }

  // L'utente inserisce/aggiorna l'ora di fine di un servizio nel gestionale.
  // Con la fine reale la durata diventa esatta → riassegno per rispettare il monte ore.
  function onCambiaOraFine(id, valore) {
    const s = servizi.find((x) => x.id === id);
    if (!s) return;
    const inizio = oraInMin(s.ora), fine = oraInMin(valore);
    if (valore && (fine == null || inizio == null || fine <= inizio)) {
      const el = $(".sd-durata");
      if (el) { el.textContent = "⚠️ la fine deve essere dopo l'inizio"; el.classList.add("errore"); }
      return;
    }
    servizi = servizi.map((x) => (x.id === id ? { ...x, oraFine: valore || "" } : x));
    GL.servizi.salvaOreFine(servizi);
    assegnaAutomatico({ soloVuoti: false, salva: true }); // ricalcola con le nuove durate
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

    const nota = `Servizio «${s.cliente}» — ${s.attivita}${s.ora ? " ore " + s.ora : ""}. ` +
      (indirizzoValido ? "Premi «Consiglia personale»." : "Indirizzo non testuale: inseriscilo a mano, poi «Consiglia personale».");
    setStato($("#form-stato"), nota, "");
    $("#input-indirizzo").focus();
  }

  // ============================================================
  //  Utility
  // ============================================================
  function aggiornaStatoApp() {
    const sa = $("#stato-app");
    if (sa) sa.textContent = `build 18 · ${dipendenti.length} dipendenti · ${servizi.length} servizi · ${MANSIONI.length} mansioni`;
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
