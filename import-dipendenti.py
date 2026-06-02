#!/usr/bin/env python3
"""
Importa i dipendenti da TUTTI i file Excel e genera js/dipendenti-reali.js.

Unisce, per ogni persona (chiave: Cognome + Primo nome):
  - anagrafica completa: "file dipendenti completo con indirizzo,mansione ecc.xlsx"
    (Comune, Indirizzo, CAP, Data fine rapporto, Orario Contrattuale,
     Codice Contratto, Telefono, Mansione, COMPETENZE)
  - formazione e certificati (con scadenze): "FILE FORMAZIONI RISORSE.xlsx"
  - data assunzione e proroghe: "dipendenti-cantieri.xlsx"

Geocodifica gli indirizzi (con cache su /tmp, quindi i rilanci sono veloci).
Uso:  pip3 install pandas openpyxl ; python3 import-dipendenti.py
"""
import os, json, time, datetime, urllib.request, urllib.parse
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
EXCEL = os.path.join(HERE, "file dipendenti completo con indirizzo,mansione ecc.xlsx")
FORMAZIONI = os.path.join(HERE, "FILE FORMAZIONI RISORSE.xlsx")
CANTIERI = os.path.join(HERE, "dipendenti-cantieri.xlsx")
OUT = os.path.join(HERE, "js", "dipendenti-reali.js")
CACHE = "/tmp/geocode_cache.json"
TODAY = pd.Timestamp(datetime.date.today())
UA = "GestionaleLogistica/1.0 (prototipo facility)"

# Colonne dei certificati/formazione -> etichetta leggibile
CERT_COLS = [
    ("IDONEITA'", "Idoneità sanitaria"),
    ("F. ALTO", "Form. alto rischio"),
    ("F.MEDIO", "Form. medio rischio"),
    ("BASSO", "Form. basso rischio"),
    ("1 SOCCORSO", "Primo soccorso"),
    ("ANTINCENDIO", "Antincendio"),
    ("PREPOSTO", "Preposto"),
    ("CARRELLISTA", "Carrellista"),
    ("PLE", "PLE (piattaforme)"),
    ("DPI 3 LIV. QUOTA", "DPI 3° liv. quota"),
    ("RLS", "RLS"),
]

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def geocode_raw(q):
    if q in cache:
        return cache[q]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"format": "json", "limit": 1, "countrycodes": "it", "q": q})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except Exception:
        data = []
    cache[q] = data
    json.dump(cache, open(CACHE, "w"))
    time.sleep(1.1)
    return data


def geocode(via, cap, comune):
    for i, q in enumerate([f"{via}, {cap} {comune}, Italia", f"{cap} {comune}, Italia", f"{comune}, Italia"]):
        if not q.replace(",", "").replace("Italia", "").strip():
            continue
        res = geocode_raw(q)
        if res:
            return float(res[0]["lat"]), float(res[0]["lon"]), (i > 0)
    return None, None, True


def chiave(cognome, nome):
    return (str(cognome).strip().upper(), str(nome).strip().upper())


def isodate(v):
    # dayfirst=True: le date italiane sono giorno/mese/anno
    dt = pd.to_datetime(v, errors="coerce", dayfirst=True)
    return dt.strftime("%Y-%m-%d") if pd.notna(dt) else ""


def carica_formazione():
    if not os.path.exists(FORMAZIONI):
        return {}
    df = pd.read_excel(FORMAZIONI, sheet_name=0)
    out = {}
    for _, r in df.iterrows():
        lst = []
        for col, label in CERT_COLS:
            if col not in df.columns or pd.isna(r.get(col)):
                continue
            lst.append({"nome": label, "scadenza": isodate(r.get(col))})
        out[chiave(r["Cognome"], r["Primo nome"])] = lst
    return out


def carica_cantieri():
    if not os.path.exists(CANTIERI):
        return {}
    df = pd.read_excel(CANTIERI, sheet_name=0)
    out = {}
    for _, r in df.iterrows():
        out[chiave(r["Cognome"], r["Primo nome"])] = {
            "dataAssunzione": isodate(r.get("Data Assunzione")),
            "nrProroghe": None if pd.isna(r.get("Nr. Totale Proroghe")) else int(r.get("Nr. Totale Proroghe")),
        }
    return out


def main():
    formByKey = carica_formazione()
    cantByKey = carica_cantieri()

    df = pd.read_excel(EXCEL, sheet_name="Dipendenti")
    fine = pd.to_datetime(df["Data fine rapporto"], errors="coerce")
    attivi = df[fine.isna() | (fine >= TODAY)].reset_index(drop=True)
    print(f"Righe: {len(df)} — attivi: {len(attivi)} — esclusi: {len(df) - len(attivi)}")

    mansioni = list(attivi["Mansione"].fillna("Non specificata").value_counts().index)
    records, exact, approx, senza_form = [], 0, 0, []

    for i, row in attivi.iterrows():
        def val(c):
            return "" if pd.isna(row[c]) else str(row[c]).strip()
        cap = "" if pd.isna(row["CAP"]) else str(int(row["CAP"]))
        comune, via = val("Comune").title(), val("Indirizzo").title()
        lat, lng, ap = geocode(via, cap, comune)
        if lat is None:
            continue
        approx += int(ap); exact += int(not ap)
        key = chiave(row["Cognome"], row["Primo nome"])
        formazione = formByKey.get(key, [])
        if not formazione:
            senza_form.append(f"{val('Primo nome').title()} {val('Cognome').title()}")
        cant = cantByKey.get(key, {})
        orario = "" if pd.isna(row["Orario Contrattuale"]) else str(int(row["Orario Contrattuale"]))
        records.append({
            "id": f"r{i+1}",
            "nome": f"{val('Primo nome').title()} {val('Cognome').title()}".strip(),
            "telefono": val("Nr. telefono privato"),
            "mansioni": [val("Mansione") or "Non specificata"],
            "competenze": val("COMPETENZE"),
            "indirizzo": ", ".join(p for p in [via, f"{cap} {comune}".strip()] if p),
            "lat": round(lat, 6), "lng": round(lng, 6),
            "approssimato": ap, "stato": "Disponibile", "impegni": [],
            # --- info aggiuntive (solo visibili) ---
            "orarioContrattuale": orario,
            "codiceContratto": val("Codice Contratto Impiego"),
            "dataFineRapporto": isodate(row["Data fine rapporto"]),
            "dataAssunzione": cant.get("dataAssunzione", ""),
            "nrProroghe": cant.get("nrProroghe"),
            "formazione": formazione,
        })

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Dati REALI importati dagli Excel — generato automaticamente.\n")
        f.write("   ATTENZIONE: dati personali (nomi, indirizzi, telefoni, certificati). NON pubblicare online. */\n")
        f.write("window.GL_MANSIONI = " + json.dumps(mansioni, ensure_ascii=False) + ";\n")
        f.write("window.GL_SEED = " + json.dumps(records, ensure_ascii=False, indent=1) + ";\n")

    print(f"Generato {OUT}")
    print(f"Importati: {len(records)} — esatti: {exact} — approssimati: {approx} — mansioni: {len(mansioni)}")
    print(f"Con formazione: {len(records) - len(senza_form)} — senza match formazione: {len(senza_form)}")
    if senza_form:
        print("  Senza formazione:", ", ".join(senza_form))


if __name__ == "__main__":
    main()
