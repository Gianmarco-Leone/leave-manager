# 🏖️ Leave Manager

Un semplice gestore di ferie e permessi self-hosted, costruito con Node.js, Express e SQLite — il tutto in un singolo container Docker. Niente cloud, niente abbonamenti, niente dipendenze esterne.

---

## Cosa fa

- Tiene traccia di **giorni di ferie** e **ore di permesso/ROL** per account
- Matura automaticamente giorni e ore il **1° di ogni mese** (configurabile per utente)
- Mostra il **saldo in tempo reale** con un alert se hai giorni residui dell'anno solare precedente
- Conserva lo **storico** di ogni inserimento, con possibilità di eliminare eventuali errori
- Supporta **più account**
- Pannello admin per configurare i tassi di maturazione, aggiungere utenti e fare backfill dei mesi precedenti

---

## Requisiti

- [Docker](https://www.docker.com/) con Docker Compose

Tutto qui.

---

## Installazione

### 1. Clona il repository

```bash
git clone https://github.com/tuo-username/leave-manager.git
cd leave-manager
```

### 2. Crea il file `.env`

```bash
cp .env.example .env
```

Apri `.env` e imposta un `SESSION_SECRET` sicuro. Puoi generarne uno con:

```bash
openssl rand -hex 32
```

### 3. Avvia il container

```bash
docker compose up --build
```

Apri il browser su **http://localhost:3000**.

---

## Primo accesso

| Campo    | Valore  |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

**Cambia subito la password** dalla tab Impostazioni dopo il primo accesso.

---

## Configurazione iniziale

L'app parte con **saldo zero**. Al primo accesso vai in **Impostazioni** e:

1. Imposta il tuo nome nella sezione *Il tuo profilo*
2. Configura i tuoi **tassi di maturazione** (giorni ferie/mese e ore permesso/mese) in base al tuo contratto
3. Usa la sezione **Saldo di apertura** per caricare il tuo residuo attuale con valori esatti (es. 7,51 giorni e 13,34 ore). Scegli il mese corrente come riferimento: da quel momento in poi la maturazione automatica mensile si aggiunge normalmente
4. Per i mesi successivi usa la sezione **Maturazione manuale (backfill)** se per qualsiasi motivo il cron non ha girato (es. container spento il 1° del mese)

### Come calcolare i tassi di maturazione

| Voce contrattuale | Calcolo di esempio |
|---|---|
| Giorni ferie/mese | Giorni annui ÷ 12 (es. 26 ÷ 12 = **2,17**) |
| Ore permesso/mese | Ore annue ÷ 12 (es. 60 ÷ 12 = **5,00**) |

I valori di default nel seed (2,17 giorni/mese, 5 ore/mese) sono basati su un contratto tipico con 26 giorni di ferie annui e 60 ore di ROL annue. Modificali in base al tuo contratto dalla sezione Impostazioni.

---

## Comandi Docker utili

### Avvio e stop

```bash
# Primo avvio o aggiornamento (costruisce l'immagine)
docker compose up --build

# Avvio senza ricostruire l'immagine
docker compose up

# Avvio in background
docker compose up -d

# Stop (i dati vengono conservati)
docker compose stop

# Riavvio
docker compose restart
```

### Gestione dei dati

```bash
# Ferma e rimuove il container (il volume dati viene conservato)
docker compose down

# Ferma, rimuove il container E cancella tutti i dati — usare con cautela!
docker compose down -v
```

### Accedere al database

**Via terminale (sempre disponibile):**
```bash
docker exec -it leave-manager sh
sqlite3 /app/data/leave.db
```

Comandi SQLite utili:
```sql
.tables                            -- elenca tutte le tabelle
SELECT * FROM users;               -- vedi tutti gli utenti
SELECT * FROM monthly_accrual_log; -- vedi lo storico delle maturazioni
SELECT * FROM leave_entries;       -- vedi le ferie inserite
SELECT * FROM permission_entries;  -- vedi i permessi inseriti
.quit
```

**Copia il file del database sul tuo computer:**
```bash
docker cp leave-manager:/app/data/leave.db ~/Desktop/leave.db
```

Poi aprilo con [DB Browser for SQLite](https://sqlitebrowser.org) (gratuito, disponibile per Mac/Windows/Linux).

---

## Struttura del progetto

```
leave-manager/
├── app.js                  # Entry point Express
├── src/
│   ├── db.js               # Schema SQLite + seed iniziale
│   ├── cron.js             # Cron job maturazione mensile
│   └── routes/
│       ├── auth.js         # Login / logout / sessione
│       └── api.js          # REST API (saldo, voci, config, utenti)
├── public/
│   ├── index.html          # Pagina di login
│   └── dashboard.html      # App principale (dashboard, storico, impostazioni)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Deploy su server domestico (es. ZimaOS, Unraid, Synology)

1. Copia il progetto sul server
2. Crea il file `.env` con un `SESSION_SECRET` sicuro
3. Esegui `docker compose up -d --build`
4. Mappa la porta nel pannello del tuo server se necessario (default: `3000`)

Il database SQLite è salvato in un volume Docker nominato (`leave-data`) e persiste tra riavvii del container e rebuild dell'immagine.

---

## Licenza

MIT — facci quello che vuoi.
