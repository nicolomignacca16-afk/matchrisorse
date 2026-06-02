# Gestionale Logistica — Consiglio Personale

Prototipo di software per aziende di facility. Dato l'**indirizzo di un lavoro**, consiglia
il **personale più adatto** in base a **mansione**, **vicinanza** (distanza dal domicilio) e
**disponibilità**.

## I tuoi dati reali (già importati)

L'app è già caricata con i **79 dipendenti attivi** presi dal tuo file
`file dipendenti completo con indirizzo,mansione ecc.xlsx`:

- Esclusi **12** con rapporto già terminato (Data fine rapporto passata).
- **12 mansioni reali** nel menù (pulizie uffici, magazzino/imballaggio, edilizia, facchinaggio, lavanderia, amministrativi…).
- **Competenze** importate dove presenti e mostrate sulle schede.
- **Dati completi** dalla anagrafica e dal file cantieri: tipo contratto, orario, data di assunzione, eventuale fine rapporto e numero di proroghe.
- **Formazione e certificati** (da `FILE FORMAZIONI RISORSE.xlsx`): idoneità sanitaria, formazione rischio, primo soccorso, antincendio, preposto, carrellista, PLE, DPI 3° liv., RLS — con **data di scadenza** colorata (🔴 scaduto, 🟠 in scadenza entro 60 gg, 🟢 valido). Sono **solo visibili** (non criteri di ricerca). 66 dipendenti su 79 hanno la scheda formazione; per 13 non c'è corrispondenza nel file (nomi assenti o scritti diversamente).
- **10 indirizzi** non trovati a livello di via: posizionati sul comune e marcati con
  "≈ approssimato" (la distanza mostra una "~"). Correggili da **Dipendenti → Modifica** per renderli esatti.
- Tutti impostati su **Disponibile**: aggiorna lo stato man mano che assegni il personale.

> Per ri-importare dopo aver aggiornato l'Excel: `python3 import-dipendenti.py`, poi nell'app
> premi **Ricarica originale**. (Posso farlo io quando vuoi.)

## Come si usa (zero installazione)

1. Apri il file **`index.html`** con un doppio clic (si apre nel browser).
   - Serve una connessione internet per la mappa e per cercare gli indirizzi.
2. Scheda **Cerca personale**:
   - Scrivi l'indirizzo del lavoro: mentre digiti compare una **tendina di indirizzi reali**, scegli quello giusto.
   - Scegli la **mansione richiesta** e la **data e ora del lavoro**.
   - Di default vedi **tutti** i candidati: i disponibili (verde) in cima, gli occupati (targhetta **rossa**) in fondo. Spunta "Solo disponibili" per nascondere gli occupati; imposta un raggio massimo se vuoi.
   - Premi **Consiglia personale**: ottieni la classifica (disponibili prima, poi i più vicini) + i punti sulla mappa.
   - Clicca su una persona in elenco per centrarla sulla mappa.
3. Scheda **Dipendenti**:
   - **Cerca** in alto per nome, mansione, indirizzo o competenza.
   - Aggiungi / modifica / elimina dipendenti e mansioni.
   - **📅 Periodi**: per ogni persona inserisci i periodi di occupazione con **data e ora** (inizio e fine) e nota/cantiere. Puoi mettere **più lavori nello stesso giorno** (es. 08:00–12:00 e 14:00–17:00); da qui deriva la disponibilità.
   - "Ricarica originale" ripristina l'elenco importato dall'Excel (annulla le modifiche fatte qui).
4. Scheda **Calendario**:
   - Vista mensile: ogni giorno mostra **quante persone sono occupate**.
   - Clicca un giorno per vedere **chi** è occupato e con quale nota/cantiere. Usa ‹ › per cambiare mese e "Oggi" per tornare al giorno corrente.

I dati vengono salvati **nel tuo browser** (localStorage): restano anche chiudendo la pagina,
ma sono legati a quel computer/browser.

## Com'è fatto

| File | Ruolo |
|------|-------|
| `index.html` | Struttura della pagina |
| `styles.css` | Aspetto grafico |
| `js/dipendenti-reali.js` | **I tuoi 79 dipendenti reali** (generato dall'Excel) |
| `js/data.js` | Mansioni di riserva, dati di esempio, salvataggio locale |
| `import-dipendenti.py` | Script per (ri)generare i dati reali dall'Excel |
| `js/geo.js` | Geocodifica indirizzi + calcolo distanze |
| `js/impegni.js` | Periodi di occupazione, disponibilità per data, calendario |
| `js/app.js` | Ricerca, classifica, dipendenti, periodi e calendario |

Tecnologie: HTML/CSS/JavaScript puro + [Leaflet](https://leafletjs.com) per la mappa +
[OpenStreetMap/Nominatim](https://nominatim.org) per la geocodifica (gratuiti, senza chiave).

## Pubblicarlo online (gratis)

Essendo solo file statici, puoi metterlo online in pochi minuti:
- **Netlify Drop** — trascini la cartella su [app.netlify.com/drop](https://app.netlify.com/drop).
- **GitHub Pages** o **Vercel** — carichi la cartella e ottieni un link condivisibile.

## Limiti del prototipo e prossimi passi

- **Distanza in linea d'aria**: ora si usa la distanza diretta. Prossimo upgrade: **tempo di
  percorrenza reale** in auto (API di routing: OSRM/Mapbox/Google) — la struttura è già pronta
  per lo scambio in `js/geo.js`.
- **Disponibilità da periodi**: una persona è "occupata" in una data se rientra in un suo periodo
  di occupazione. Evoluzione: collegare i periodi direttamente ai lavori/cantieri assegnati.
- **Dati locali**: per usarlo in più persone serve un database condiviso (es. Supabase) e login.
- **Geocodifica Nominatim**: ottima per provare, ma ha limiti d'uso. In produzione si passa a un
  servizio con chiave (LocationIQ, Mapbox, Google) per più volume e precisione.

## ⚠️ Privacy (GDPR)

Il software memorizza **indirizzi di domicilio** dei dipendenti: sono dati personali. Prima
dell'uso reale servono informativa, consenso/base giuridica e accesso limitato ai soli incaricati.

In pratica:
- Il file `js/dipendenti-reali.js` (e gli Excel) **non vanno pubblicati online**. Il `.gitignore`
  li esclude già da eventuali repository: se pubblichi il sito, l'app userà i dati di esempio.
- Per un uso condiviso da più persone serve un database protetto con login (vedi sotto), non i
  file locali.
