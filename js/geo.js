/* ===========================================================
   geo.js — Geocodifica indirizzi e calcolo distanze
   Espone tutto sotto il namespace globale GL.geo
   =========================================================== */
window.GL = window.GL || {};

GL.geo = (function () {
  const BASE = "https://nominatim.openstreetmap.org/search";
  // Riquadro di preferenza: Lombardia (migliora i risultati nella vostra zona,
  // senza escludere il resto d'Italia). Formato: lonSx,latAlto,lonDx,latBasso.
  const VIEWBOX = "8.4,46.7,10.8,44.6";

  function buildUrl(q, limit) {
    return (
      BASE +
      "?format=json&addressdetails=1&limit=" + limit +
      "&countrycodes=it&viewbox=" + VIEWBOX + "&bounded=0&q=" +
      encodeURIComponent(q)
    );
  }

  async function fetchNominatim(url) {
    let res;
    try {
      res = await fetch(url, { headers: { "Accept-Language": "it" } });
    } catch (e) {
      throw new Error("Connessione assente: serve internet per cercare l'indirizzo.");
    }
    if (!res.ok) throw new Error("Servizio mappe non disponibile, riprova tra poco.");
    return res.json();
  }

  function mappaRisultato(d) {
    return { lat: parseFloat(d.lat), lng: parseFloat(d.lon), etichetta: d.display_name };
  }

  // Miglior risultato singolo (fallback e geocodifica nel modale dipendenti).
  async function geocodifica(indirizzo) {
    const q = (indirizzo || "").trim();
    if (!q) throw new Error("Inserisci un indirizzo.");
    const dati = await fetchNominatim(buildUrl(q, 1));
    if (!dati.length)
      throw new Error("Indirizzo non trovato. Prova a essere più preciso (via, numero, città).");
    return mappaRisultato(dati[0]);
  }

  // Lista di indirizzi candidati: l'utente sceglie quello corretto (autocompletamento).
  async function suggerisci(indirizzo) {
    const q = (indirizzo || "").trim();
    if (q.length < 4) return [];
    try {
      const dati = await fetchNominatim(buildUrl(q, 6));
      return dati.map(mappaRisultato);
    } catch (e) {
      return [];
    }
  }

  // Distanza in linea d'aria (formula di Haversine), in chilometri.
  function distanzaKm(a, b) {
    const R = 6371; // raggio terrestre km
    const dLat = gradi(b.lat - a.lat);
    const dLng = gradi(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(gradi(a.lat)) * Math.cos(gradi(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function gradi(deg) {
    return (deg * Math.PI) / 180;
  }

  // Formatta una distanza per la UI (es. "850 m" oppure "3,4 km").
  function formatta(km) {
    if (km < 1) return Math.round(km * 1000) + " m";
    return km.toFixed(1).replace(".", ",") + " km";
  }

  return { geocodifica, suggerisci, distanzaKm, formatta };
})();
