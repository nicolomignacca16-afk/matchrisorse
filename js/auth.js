/* ===========================================================
   auth.js — Cifratura/decifratura dei dati con password (WebCrypto)
   AES-256-GCM + PBKDF2 (200k iterazioni, SHA-256).
   La password non è mai salvata: serve solo per derivare la chiave.
   Espone GL.auth.cifra(password, oggetto) e GL.auth.decifra(password, blob)
   =========================================================== */
window.GL = window.GL || {};

GL.auth = (function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function unb64(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  }

  async function chiave(password, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // Cifra un oggetto JS -> stringa JSON {salt, iv, ct} (base64). Sicura da pubblicare.
  async function cifra(password, oggetto) {
    if (!crypto || !crypto.subtle) throw new Error("Cifratura non disponibile in questo browser.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await chiave(password, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(oggetto)));
    return JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }

  // Decifra il blob con la password. Lancia un errore se la password è errata.
  async function decifra(password, blobStr) {
    const o = JSON.parse(blobStr);
    const k = await chiave(password, unb64(o.salt));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, k, unb64(o.ct));
    return JSON.parse(dec.decode(pt));
  }

  return { cifra, decifra };
})();
