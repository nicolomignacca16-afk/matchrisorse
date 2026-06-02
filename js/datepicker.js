/* ===========================================================
   datepicker.js — Selettore data+ora personalizzato (liquid glass)
   Sostituisce gli <input type="datetime-local"> nativi del browser.
   Valore gestito in formato ISO "YYYY-MM-DDTHH:MM" (come prima).
   API: GL.datepicker.init(input, {placeholder, onChange})
        GL.datepicker.setValue(input, iso) / getValue(input) / clear(input)
   =========================================================== */
window.GL = window.GL || {};

GL.datepicker = (function () {
  const stati = new WeakMap();
  let aperto = null; // { input, el }

  function due(n) { return String(n).padStart(2, "0"); }

  function init(input, opts) {
    if (stati.has(input)) return;
    input.readOnly = true;
    input.classList.add("dp-input");
    if (opts && opts.placeholder) input.placeholder = opts.placeholder;
    const now = new Date();
    stati.set(input, {
      iso: "", giorno: "", h: 8, m: 0,
      anno: now.getFullYear(), mese: now.getMonth(),
      onChange: opts && opts.onChange,
    });
    input.addEventListener("click", (e) => { e.stopPropagation(); apri(input); });
  }

  function getValue(input) { const st = stati.get(input); return st ? st.iso : ""; }
  function clear(input) { setValue(input, ""); }

  function setValue(input, iso) {
    const st = stati.get(input);
    if (!st) return;
    if (iso) {
      st.giorno = iso.slice(0, 10);
      const t = iso.split("T")[1] || "08:00";
      st.h = parseInt(t.slice(0, 2), 10) || 0;
      st.m = parseInt(t.slice(3, 5), 10) || 0;
      const d = new Date(iso);
      st.anno = d.getFullYear();
      st.mese = d.getMonth();
    } else {
      const now = new Date();
      st.giorno = ""; st.h = 8; st.m = 0;
      st.anno = now.getFullYear(); st.mese = now.getMonth();
    }
    commit(input);
    if (aperto && aperto.input === input) render(input, aperto.el);
  }

  // Ricompone l'ISO da giorno+ora e aggiorna il campo visibile.
  function commit(input) {
    const st = stati.get(input);
    if (!st.giorno) { st.iso = ""; input.value = ""; }
    else {
      st.iso = `${st.giorno}T${due(st.h)}:${due(st.m)}`;
      input.value = GL.impegni.formattaDataOra(st.iso);
    }
    if (st.onChange) st.onChange(st.iso);
  }

  function apri(input) {
    chiudi();
    const el = document.createElement("div");
    el.className = "dp-pop";
    el.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(el);
    render(input, el);
    posiziona(input, el);
    aperto = { input, el };
  }

  function chiudi() { if (aperto) { aperto.el.remove(); aperto = null; } }

  function posiziona(input, el) {
    const r = input.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + "px";
    let top = r.bottom + 6;
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - el.offsetHeight - 6);
    el.style.top = top + "px";
  }

  function render(input, el) {
    const st = stati.get(input);
    const oggi = GL.impegni.oggiISO();
    const celle = GL.impegni.grigliaMese(st.anno, st.mese);
    const giorni = celle.map((iso) => {
      if (!iso) return `<span class="dp-empty"></span>`;
      const cls = ["dp-day"];
      if (iso === st.giorno) cls.push("sel");
      if (iso === oggi) cls.push("oggi");
      return `<button type="button" class="${cls.join(" ")}" data-iso="${iso}">${Number(iso.slice(8, 10))}</button>`;
    }).join("");
    const hOpts = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === st.h ? "selected" : ""}>${due(h)}</option>`).join("");
    const mOpts = Array.from({ length: 60 }, (_, m) => `<option value="${m}" ${m === st.m ? "selected" : ""}>${due(m)}</option>`).join("");

    el.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="-1">‹</button>
        <span class="dp-title">${GL.impegni.nomeMese(st.mese)} ${st.anno}</span>
        <button type="button" class="dp-nav" data-nav="1">›</button>
      </div>
      <div class="dp-week"><span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span></div>
      <div class="dp-grid">${giorni}</div>
      <div class="dp-time">🕐 <select class="dp-h">${hOpts}</select><b>:</b><select class="dp-m">${mOpts}</select></div>
      <div class="dp-foot">
        <button type="button" class="dp-link dp-cancella">Cancella</button>
        <button type="button" class="dp-link dp-oggi">Oggi</button>
        <button type="button" class="dp-ok">Fatto</button>
      </div>`;

    el.querySelectorAll(".dp-nav").forEach((b) =>
      b.addEventListener("click", () => {
        st.mese += Number(b.dataset.nav);
        if (st.mese < 0) { st.mese = 11; st.anno--; }
        else if (st.mese > 11) { st.mese = 0; st.anno++; }
        render(input, el);
      }));
    el.querySelectorAll(".dp-day").forEach((b) =>
      b.addEventListener("click", () => { st.giorno = b.dataset.iso; commit(input); render(input, el); }));
    el.querySelector(".dp-h").addEventListener("change", (e) => { st.h = Number(e.target.value); commit(input); });
    el.querySelector(".dp-m").addEventListener("change", (e) => { st.m = Number(e.target.value); commit(input); });
    el.querySelector(".dp-oggi").addEventListener("click", () => {
      const d = new Date();
      st.giorno = GL.impegni.oggiISO(); st.anno = d.getFullYear(); st.mese = d.getMonth();
      commit(input); render(input, el);
    });
    el.querySelector(".dp-cancella").addEventListener("click", () => {
      st.giorno = ""; st.iso = ""; input.value = "";
      if (st.onChange) st.onChange("");
      render(input, el);
    });
    el.querySelector(".dp-ok").addEventListener("click", () => chiudi());
  }

  // Chiusura al clic fuori dal popup (registrato una sola volta).
  document.addEventListener("click", (e) => {
    if (aperto && !aperto.el.contains(e.target) && e.target !== aperto.input) chiudi();
  });

  return { init, setValue, getValue, clear };
})();
