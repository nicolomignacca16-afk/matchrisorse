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

## I lavori del mese (giugno 2026)

L'app carica i lavori dal file mensile **`GIUGNO 2026_.xlsx`** (colonne DATA, CLIENTE,
INDIRIZZO, ATTIVITÀ, ORARI, TOTALE ORE, NOMINATIVO, SOCIETÀ, RIMBORSI, NOTE):

- **1.459 righe** = 1.459 turni di persona; le righe identiche per giorno, cliente, indirizzo,
  attività e orario sono raggruppate in **879 lavori** con N risorse, per **8.924 ore** totali.
- Le persone **arrivano già assegnate dal file** (colonna NOMINATIVO): niente più assegnazione
  automatica. **61 nominativi su 82** corrispondono all'anagrafica; gli altri 21 (interinali,
  ditte esterne, nomi non presenti) sono marcati come **risorse esterne**.
- Il colore di ogni lavoro non è più preso dall'Excel ma **calcolato dalla ricorrenza** del
  cantiere nel mese: verde ≥ 15 giorni, azzurro 6–14, viola 2–5, bianco = una tantum.
- **32 lavori non hanno le ore** nel file (manca sia il totale sia l'ora di fine): contano 0 ore
  nei calcoli finché non inserisci l'ora di fine dal dettaglio del lavoro.

> Per ri-importare dopo aver aggiornato l'Excel del mese: metti il file nella cartella con lo
> stesso nome e lancia `python3 import-servizi.py`. I lavori precedenti vengono **sostituiti**.

## Come si usa (zero installazione)

1. Apri il file **`index.html`** con un doppio clic (si apre nel browser).
   - Serve una connessione internet per la mappa e per cercare gli indirizzi.
2. Scheda **Lavori e calendario** (è la vista principale: lavori e calendario sono la stessa cosa):
   - **📊 Timeline** — righe = cliente/cantiere, colonne = giorni del mese, barre = lavori.
   - **🗓 Calendario lavori** — griglia del mese; clicca un giorno per l'elenco dei lavori con
     orario, indirizzo, ore e persone.
   - **👥 Calendario persone** — stessa griglia ma con **quante persone lavorano** ogni giorno;
     clicca un giorno per vedere chi, con che orario, su quale cantiere e quante ore.
   - Filtri per categoria, attività e cliente; a destra la colonna **Coperti da esterni** con i
     turni svolti da personale non in anagrafica (da lì apri il lavoro e cerchi una risorsa interna).
   - Nel dettaglio di un lavoro puoi correggere l'**ora di fine**: le ore (e quindi costi e ricavi)
     si ricalcolano subito.
3. Scheda **Costi & ricavi** — la visione d'insieme tra entrate e uscite:
   - **Entrate**, **uscite** e **margine** del mese, ore lavorate, ore interne vs esterne.
   - Grafico giornaliero entrate/costi, e dettaglio **per cliente, per attività, per persona,
     per società** (ordinabile, esportabile in CSV per Excel).
   - A destra le **tariffe**: il file contiene le ore, non gli euro, quindi imposti la tariffa
     oraria di vendita (anche specifica per singolo cliente), il costo orario del personale
     interno, quello di esterni/interinali e gli eventuali costi fissi del mese. I valori restano
     salvati nel browser.
4. Scheda **Cerca personale**:
   - Scrivi l'indirizzo del lavoro: mentre digiti compare una **tendina di indirizzi reali**, scegli quello giusto.
   - Scegli la **mansione richiesta** e la **data e ora del lavoro**.
   - Di default vedi **tutti** i candidati: i disponibili (verde) in cima, gli occupati (targhetta **rossa**) in fondo. Spunta "Solo disponibili" per nascondere gli occupati; imposta un raggio massimo se vuoi.
   - Premi **Consiglia personale**: ottieni la classifica (disponibili prima, poi i più vicini) + i punti sulla mappa.
   - Clicca su una persona in elenco per centrarla sulla mappa.
5. Scheda **Dipendenti**:
   - **Cerca** in alto per nome, mansione, indirizzo o competenza.
   - Aggiungi / modifica / elimina dipendenti e mansioni.
   - **📅 Impegni**: mostra i lavori del mese presi dal file (in sola lettura) e le ore per
     settimana con l'alert se superano il contratto; puoi comunque aggiungere periodi manuali
     (ferie, permessi, lavori non ancora in Excel) con data e ora.
   - "Ricarica originale" ripristina l'elenco importato dall'Excel (annulla le modifiche fatte qui).

I dati vengono salvati **nel tuo browser** (localStorage): restano anche chiudendo la pagina,
ma sono legati a quel computer/browser.

## Com'è fatto

| File | Ruolo |
|------|-------|
| `index.html` | Struttura della pagina |
| `styles.css` | Aspetto grafico |
| `js/dipendenti-reali.js` | **I tuoi 79 dipendenti reali** (generato dall'Excel) |
| `js/servizi-reali.js` | **I lavori del mese** con le persone assegnate (generato dall'Excel) |
| `js/data.js` | Mansioni di riserva, dati di esempio, salvataggio locale |
| `import-dipendenti.py` | Script per (ri)generare l'anagrafica dagli Excel |
| `import-servizi.py` | Script per (ri)generare i lavori dal file mensile |
| `js/geo.js` | Geocodifica indirizzi + calcolo distanze |
| `js/impegni.js` | Periodi, ore per settimana, griglia del calendario |
| `js/servizi.js` | Modello dei lavori: ore, persone, categorie, impegni derivati |
| `js/tariffe.js` | Tariffe di vendita e costi orari (impostazioni economiche) |
| `js/economia.js` | Calcolo di entrate, uscite e margine (funzioni pure) |
| `js/economia-view.js` | Vista "Costi & ricavi" |
| `js/app.js` | Lavori e calendario, ricerca personale, dipendenti |

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
- **Disponibilità dai lavori**: l'occupazione di ogni persona è ricavata dai lavori del file
  importato (più gli eventuali periodi inseriti a mano), quindi vale per il mese caricato.
- **Costi e ricavi da tariffa**: l'Excel contiene solo le ore, non gli importi. Entrate e uscite
  sono quindi una **stima** basata sulle tariffe che imposti: per numeri esatti servirebbe
  importare le tariffe reali di contratto (per cliente/cantiere) e il costo orario per persona.
- **Dati locali**: per usarlo in più persone serve un database condiviso (es. Supabase) e login.
- **Geocodifica Nominatim**: ottima per provare, ma ha limiti d'uso. In produzione si passa a un
  servizio con chiave (LocationIQ, Mapbox, Google) per più volume e precisione.

## ⚠️ Privacy (GDPR)

Il software memorizza **indirizzi di domicilio** dei dipendenti: sono dati personali. Prima
dell'uso reale servono informativa, consenso/base giuridica e accesso limitato ai soli incaricati.

In pratica:
- I file `js/dipendenti-reali.js` e `js/servizi-reali.js` (e gli Excel) **non vanno pubblicati
  online**: contengono nomi, indirizzi di casa, clienti e cantieri. Il `.gitignore` li esclude già
  da eventuali repository: se pubblichi il sito, l'app userà i dati di esempio.
- Per pubblicare i dati veri usa **🔒 Proteggi sito** (scheda Dipendenti): genera
  `js/dati-cifrati.js` (AES-256 con la tua password), che ora include anche i lavori e le tariffe.
  **Va rigenerato ogni volta che aggiorni i dati**, altrimenti il sito online resta indietro.
- Per un uso condiviso da più persone serve un database protetto con login (vedi sotto), non i
  file locali.
