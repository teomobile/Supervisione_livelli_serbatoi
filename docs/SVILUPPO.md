# Supervisione livelli serbatoi — Guida allo sviluppo

Per chi mantiene o estende il sistema. Descrive come è fatto e perché; il contratto API completo, la
mappatura del DB4 e le decisioni sono in [`HANDOFF-backend.md`](HANDOFF-backend.md), la guida
per chi usa l'interfaccia in [`GUIDA-UTENTE.md`](GUIDA-UTENTE.md).

---

## 1. Architettura

```
                    PLC S7-1200 serbatoi 10.229.48.92  —  DB_Gestionale (DB4, 55 byte)
                       │                                         │
          S7 PUT/GET, ogni 1 s, 1 connessione          System Platform, 1 riga/minuto
                       │                                         │
                       ▼                                         ▼
 ┌──────────────── ServiceBackend (ASP.NET Core .NET 6, IIS) ─┐   dana_verniciatura.dbo.LivelliSerbatoi
 │ TankMonitorService ──► TankLiveState (memoria)             │            │ (solo trend)
 │        └──────────────► dbo.SupTankEvent (eventi)          │            │
 │ TanksController ◄── TankDal ◄── memoria / SQL ◄────────────┼────────────┘
 │                                  dbo.SupTankConfig         │
 └──────────────────────────────┬─────────────────────────────┘
                                │ REST JSON, polling ogni 5 s
                                ▼
                     Frontend Angular (IIS, browser)
```

Tre sorgenti, ognuna per un uso:

| Dato | Sorgente | Perché |
|---|---|---|
| Stato attuale (sinottico, barra) | **PLC via S7**, letto dal backend ogni secondo e tenuto in memoria | Dato fresco; nessun ritardo dello storico |
| Eventi di allarme | **`SupTankEvent`**, scritta dal backend quando cambia un bit | Precisione di 1 s; attivi e storico coincidono |
| Trend | **`LivelliSerbatoi`**, scritta da System Platform | Storico già esistente, usato anche per altre elaborazioni |
| Configurazione serbatoi | **`SupTankConfig`** | Dati non presenti nel PLC, modificabili dal browser |

La supervisione è **in sola lettura** verso il PLC. Nessun comando: le sirene le tacita il PLC.

---

## 2. Dove sta il codice

| Parte | Percorso | Repository |
|---|---|---|
| Frontend | `Supervisione_livelli_serbatoi/frontend` | `teomobile/Supervisione_livelli_serbatoi` |
| Documentazione | `Supervisione_livelli_serbatoi/docs` | idem |
| Backend | `ServiceRestDana/ServiceBackend/ServiceBackend` | repository del ServiceBackend, condiviso con altri progetti (assi, OEE) |

### Backend: file della supervisione serbatoi

Tutti in `Models/Tanks/` (namespace `ServiceBackend.Models.Tanks`), tranne il controller.

| File | Ciclo di vita | Compito |
|---|---|---|
| `Db4Layout.cs` | statica | Struttura dei 55 byte: `Parse` (byte → `PlcSnapshot`) ed `Encode` (inverso, per il simulatore) |
| `TankPlcReader.cs` | singleton | `ITankPlcReader`: `S7TankPlcReader` (S7netplus) o `SimulatedTankPlcReader` |
| `TankMonitorService.cs` | hosted service | Ciclo di lettura del PLC, aggiornamento della memoria, apertura e chiusura eventi |
| `TankLiveState.cs` | singleton | Ultima lettura e ora dell'ultimo cambio dell'heartbeat, protette da lock |
| `TankEventStore.cs` | singleton | Lettura e scrittura di `SupTankEvent` (Dapper) |
| `TankDal.cs` | scoped | Dati per il controller: stato, allarmi, trend, configurazione |
| `TankOptions.cs` | configurazione | `TankPlcOptions` (sezione `TankPlc`) e `TankOptions` (sezione `Tanks`) |
| `TankDtos.cs` | — | DTO del contratto API e costanti `AlarmKinds` |
| `Controllers/TanksController.cs` | per richiesta | 5 endpoint, validazione dei parametri, involucro `Response` |
| `Database/*.sql` | — | Script delle tabelle e degli indici |

Registrazione in `Program.cs`, blocco "Supervisione serbatoi". Il codice serbatoi non tocca
`PlcService`, `DAL` né il resto del backend esistente: il PLC dei serbatoi è un altro PLC, con
un'altra connessione.

### Frontend

```
frontend/src/app/
  core/api/       TankApi (contratto), HttpTankApi (backend vero), MockTankApi (dati simulati)
  core/config/    caricamento di public/config.json
  core/models/    DTO, stato e colori del serbatoio, validazione della configurazione
  core/state/     SystemStatusStore e ActiveAlarmsStore (polling condiviso tra le pagine)
  core/time/      periodi predefiniti, durate
  shared/         tank-gauge (disegno del serbatoio), level-trend (grafico)
  features/       overview (sinottico), tank-detail, trends, alarms, settings
  layout/         shell: barra di stato e menu
```

Stack: Angular 21 (standalone, signals, senza zone.js), PrimeNG 21, ECharts 6, Vitest. Dettagli in
`frontend/README.md`.

---

## 3. Come funziona il backend

### 3.1 Lettura del PLC

`TankMonitorService` è l'**unico** punto che parla con il PLC. Ogni `PollIntervalMs` (1 s):

1. legge 55 byte di DB4 a partire dall'offset 0 (`ReadBytesAsync(DataType.DataBlock, 4, 0, 55)`);
2. li decodifica con `Db4Layout.Parse` e aggiorna `TankLiveState`;
3. confronta le condizioni attive con gli eventi aperti e scrive le differenze in `SupTankEvent`;
4. valuta `PLC_COMM` (heartbeat fermo oltre `HeartbeatTimeoutSec`).

Le richieste HTTP leggono solo la copia in memoria. Così le postazioni aperte non aumentano le
connessioni verso il 1214C, che ne ha poche ed è già letto anche da System Platform.

**Accesso per indirizzo assoluto.** Con PUT/GET un S7-1200 si legge solo per indirizzo, non per
nome di variabile. Per questo:

- DB4 deve restare **non ottimizzato**;
- le variabili **non si spostano**: i nuovi dati vanno aggiunti in coda (dall'offset 56.0);
- sul PLC va abilitato "Consenti accesso con comunicazione PUT/GET dal partner remoto";
- il server deve raggiungere la porta TCP 102 del PLC.

Mappa dei byte (big-endian; il bit x.0 è il meno significativo):

| Byte | Contenuto |
|---|---|
| 0–1 | `DataVersion` UInt |
| 2 bit 0 | `PLCReady` |
| 4–7 | `Heartbeat` UDInt |
| 8 + 6·i … +3 | `X_LevelPercent` Real (i = 0 per A … 7 per H) |
| 12 + 6·i bit 0/1/2/3 | `X_LevelValid` / `X_Full` / `X_TooFull` / `X_TooFullFault` |
| 54 bit 4/5/6/7 | `Horn_AB` / `Horn_CD` / `Horn_EF` / `Horn_GH` |

La stessa tabella, con gli item per System Platform, è in
[`DB4_indirizzi_assoluti.csv`](DB4_indirizzi_assoluti.csv).

### 3.2 Eventi

| Tipo | Condizione | Serbatoio |
|---|---|---|
| `TOO_FULL` | `X_TooFull = 1` | sì |
| `FULL` | `X_Full = 1` | sì |
| `TOO_FULL_FAULT` | `X_TooFullFault = 1` | sì |
| `LEVEL_INVALID` | `X_LevelValid = 0` | sì |
| `PLC_NOT_READY` | `PLCReady = 0` | no |
| `PLC_COMM` | heartbeat fermo oltre `HeartbeatTimeoutSec`, o PLC non leggibile | no |

- Condizione nuova → `INSERT` con `RaisedAt`; condizione sparita → `UPDATE ClearedAt`.
- `PLC_COMM` inizia all'**ultimo cambio dell'heartbeat**, non allo scadere del timeout.
- **Se la lettura fallisce**, gli altri eventi restano come sono (non si sa se sono rientrati);
  si riprova dopo `ReconnectDelayMs`.
- **All'avvio** il servizio carica gli eventi aperti. Alla prima lettura chiude quelli non più
  attivi, con l'ora della lettura.
- **Se il database non risponde**, la lettura del PLC continua; l'evento viene riscritto al ciclo
  successivo, e gli eventi aperti si ricaricano ogni 10 s finché non riesce.
- L'indice univoco filtrato `UX_SupTankEvent_Open` impedisce due eventi aperti uguali se girano
  due istanze del backend (per esempio Visual Studio e IIS insieme). L'errore di chiave doppia è
  ignorato.
- **Log:** errori del PLC e del database scritti solo al primo fallimento e al ripristino.

Tutti gli orari degli eventi sono **UTC**, presi dall'orologio del server del backend.

### 3.3 Trend

`TankDal.GetTankHistoryAsync` legge `LivelliSerbatoi` e raggruppa le righe del periodo in circa 600
intervalli: `AVG` delle sole misure valide, intervallo minimo 60 s. Restituisce un campione per ogni
intervallo fino ad adesso. Un intervallo senza righe valide dà `null`, e il grafico interrompe la
linea.

`DataOra` è **ora locale** del server SQL, di tipo `datetime` senza fuso: il backend la converte con
`Tanks:SourceTimeZone`. Nell'ora ripetuta del passaggio all'ora solare la conversione è ambigua.

Il nome della colonna (`{X}_LevelPercent`) è l'unico testo inserito nella query, ed è una lettera
A–H già validata.

### 3.4 Configurazione

`SupTankConfig` contiene nome, capacità, percentuale di pieno e di troppo pieno: dati che il PLC
non ha e che si modificano dalla pagina Configurazione. Sta in una tabella, e non in
`appsettings.json`, perché un'applicazione web non deve riscrivere il proprio file di
configurazione, e i valori devono sopravvivere alle pubblicazioni.

- Le percentuali servono **solo a disegnare le linee**: gli eventi li decide il PLC con i bit.
- `SaveTankConfig` ripete le validazioni del frontend, aggiorna solo le righe ricevute in una
  transazione (inserisce quelle mancanti) e restituisce le 8 righe.
- `TankDal` tiene la configurazione in cache per 30 s; la cache si svuota al salvataggio.
- Se la tabella non è leggibile, stato e trend usano i valori predefiniti (10.000 l, 85 %, 95 %)
  e si riprova dopo un minuto. Così il sinottico resta disponibile.

### 3.5 Risposte

Ogni risposta è avvolta in `Response` `{ statusCode, statusMessage, listItem }`, in camelCase.

| Caso | HTTP | `statusCode` |
|---|---|---|
| OK | 200 | 200 |
| Parametri non validi | 200 | 400, con il messaggio da mostrare |
| PLC mai letto dall'avvio del backend | 200 | 503 |
| Errore imprevisto (database, …) | 500 | 500, scritto nel log |

Le date sono `DateTimeOffset` in UTC. Il frontend calcola l'età dell'heartbeat come
`serverTime − heartbeatChangedAt`, entrambi dall'orologio del backend: l'orologio del PC client non conta.

---

## 4. Come funziona il frontend

- `SystemStatusStore` chiama `GetSystemStatus` ogni `pollingIntervalMs`. Se una chiamata fallisce,
  tiene l'ultimo dato e mostra la striscia "Backend non raggiungibile".
- `ActiveAlarmsStore` chiama `GetAlarms?activeOnly=true` con lo stesso intervallo; barra, menu e
  pagina Allarmi condividono la stessa lettura.
- Stato PLC nella barra: **Nessun dato** se l'ultimo dato è più vecchio di `staleDataAfterSec`;
  **Non pronto** se `plcReady` è falso; **Com. persa** se l'heartbeat è fermo oltre
  `heartbeatTimeoutSec`; altrimenti **OK**.
- Colore del serbatoio (`tank-state.ts`): conta solo ciò che dice il PLC (bit e validità), non i
  litri. Stile ISA-101: grigio di base, colore solo per le anomalie, sempre con una scritta.
- `MockTankApi` (`useMock: true`) genera dati in memoria e non chiama il backend: serve a
  lavorare sull'interfaccia senza backend.

### `public/config.json`

Viene letto all'avvio e copiato così com'è nella build: su IIS si modifica senza ricompilare.

L'URL del backend viene dagli environment, come negli altri progetti:

- `src/app/environments/environment.ts` (sviluppo): `https://localhost:44315`;
- `environment.prod.ts` (build di produzione): `http://10.229.48.220:89`.

Il frontend aggiunge `/api`.

| Chiave | Valore in produzione |
|---|---|
| `apiBaseUrl` | Di solito assente. Se presente (URL fino a `/api`) sostituisce quello dell'environment senza ricompilare |
| `useMock` | `false` |
| `pollingIntervalMs` | `5000` |
| `staleDataAfterSec` | `30` |
| `heartbeatTimeoutSec` | uguale a `TankPlc:HeartbeatTimeoutSec` del backend |

---

## 5. Configurazione del backend

`appsettings.json`:

```json
"TankPlc": {
  "Ip": "10.229.48.92", "Rack": 0, "Slot": 1, "DbNumber": 4,
  "PollIntervalMs": 1000, "ReconnectDelayMs": 5000, "TimeoutMs": 2000,
  "HeartbeatTimeoutSec": 20,
  "Simulate": false
},
"Tanks": {
  "ConnectionName": "DanaBackendEntities",
  "SourceTimeZone": "W. Europe Standard Time"
}
```

Altre opzioni con valore predefinito nel codice (`TankOptions`):
- `HistoryPoints` (600) e `HistoryMinBucketSec` (60);
- `MaxRangeDays` (400);
- `AlarmHistoryDefaultDays` (7);
- `ConfigCacheSec` (30).

**`HeartbeatTimeoutSec`** va scelto in base a ogni quanto il PLC incrementa `Heartbeat`: almeno 3
volte quel periodo. Va tenuto uguale nel backend e nel `config.json` del frontend. Se il PLC non
incrementa l'heartbeat, la supervisione segnala sempre "Com. persa": è un problema del programma
PLC, non della lettura.

---

## 6. Database

Tutte e tre le tabelle stanno in `dana_verniciatura`, sullo stesso server e con la stessa stringa
di connessione.

| Tabella | Chi scrive | Chi legge | Script |
|---|---|---|---|
| `LivelliSerbatoi` | System Platform | backend (trend) | `Database/LivelliSerbatoi.sql`: indice su `DataOra`, `HeartBeat` a `bigint`; da concordare |
| `SupTankEvent` | backend | backend (allarmi) | `Database/SupTankEvent.sql` |
| `SupTankConfig` | backend (pagina Configurazione) | backend | `Database/SupTankConfig.sql` |

Gli script non contengono `USE`: eseguirli con la finestra di SSMS collegata a
`dana_verniciatura`. Si possono rieseguire senza danni: quello che esiste già non viene ricreato.

Volumi: `LivelliSerbatoi` circa 525.000 righe l'anno; `SupTankEvent` qualche migliaio. Va decisa la
conservazione dello storico, per esempio un job che cancella le righe oltre 2 anni.

---

## 7. Sviluppo in locale

### Backend

Da Visual Studio, profilo **ServiceBackend** (`http://localhost:5047`, `https://localhost:44315`).
Swagger su `/swagger`.

- **Senza accesso al PLC**: `"Simulate": true`. Il simulatore produce i 55 byte, quindi passa da
  `Db4Layout.Parse` come i dati veri:
  - livelli sinusoidali, con F che supera il 95 %;
  - E con misura non valida dal minuto 10 al 12 di ogni ora;
  - D con guasto sensore nei primi 5 minuti di ogni mezz'ora;
  - heartbeat fermo nel minuto 50 di ogni ora.
- **Senza accesso al database aziendale**: un database di prova su LocalDB, con la stringa
  sovrascritta da variabile d'ambiente, senza toccare `appsettings.json`:
  ```bash
  ConnectionStrings__DanaBackendEntities="Server=(localdb)\MSSQLLocalDB;Database=SupTankTest;Integrated Security=True;TrustServerCertificate=True"
  ```
  Nel database di prova servono gli script di `Database/` e una tabella `LivelliSerbatoi` con le
  colonne `DataOra`, `X_LevelPercent`, `X_LevelValid`.

Con il debugger collegato, Visual Studio mostra una riga "Exception thrown" per ogni eccezione,
anche quando è gestita. Per esempio a ogni tentativo di riconnessione al PLC, o quando una tabella
non esiste. Il log dell'applicazione è più affidabile per capire cosa succede.

### Frontend

```bash
cd frontend
npm install
npm start   # http://localhost:4200
npm test    # Vitest
```

In `public/config.json`:
- per lavorare sull'interfaccia senza backend: `useMock: true`;
- per usare il backend locale: `useMock: false`. L'URL `https://localhost:44315` arriva da
  `environment.ts`.

`http://localhost:4200` è già nell'elenco CORS del backend.

---

## 8. Messa in produzione

### Backend (IIS)

- **Application pool sempre attivo**:
  - Start Mode `AlwaysRunning`;
  - Idle Time-out `0`;
  - Preload Enabled sul sito;
  - riciclo a orario fisso, di notte.

  Il servizio di lettura vive dentro l'applicazione: se IIS la ferma, non si registrano eventi.
- **Una sola istanza**: niente web garden, niente secondo server con lo stesso backend.
- Aggiungere l'indirizzo del sito del frontend all'elenco CORS in `Program.cs`.
- Gli aggiornamenti vanno fatti fuori dagli orari di riempimento: a backend fermo gli eventi non
  vengono registrati.

### Frontend (IIS)

1. `npm ci && npm run build`, poi copiare `dist/supervisione-serbatoi/browser/` nel sito. Se il
   sito non è alla radice, usare `--base-href`.
2. `web.config` con la regola di URL Rewrite verso `index.html` (testo in `HANDOFF-backend.md` §10).
   Serve il modulo URL Rewrite.
3. `config.json` pubblicato con `useMock: false`. L'URL del backend è quello di
   `environment.prod.ts`; per cambiarlo senza ricompilare, aggiungere `apiBaseUrl` in `config.json`.

---

## 9. Estendere il sistema

| Modifica | Dove intervenire |
|---|---|
| **Nuova variabile nel DB4** (in coda, da 56.0) | 1. `Db4Layout` (`Length` e `Parse`/`Encode`)<br>2. `PlcSnapshot` / `TankLive`<br>3. DTO in `TankDtos.cs` e nel frontend (`tank.models.ts`)<br>4. `MockTankApi` |
| **Nuovo tipo di allarme** | 1. `AlarmKinds` e `TankMonitorService.ActiveKeys`/`Message`<br>2. vincolo `CK_SupTankEvent_Kind` della tabella<br>3. frontend: `AlarmKind`, `ALARM_LABELS`, `ALARM_SEVERITY` |
| **Soglie lette dal PLC** (setpoint pieno/basso/minimo) | Leggerli in `Db4Layout` e usarli in `TankDal.Thresholds`. Le soglie basse sono già previste nel frontend (`lowWarningLiters`, `lowStopLiters`, oggi `null`) e compaiono appena hanno un valore. |
| **Comandi verso il PLC** (tacitazione, travaso) | Serve prima l'autenticazione: Windows Authentication su IIS. La scrittura passa da una connessione S7 gestita dallo stesso servizio, non da una nuova per richiesta. La pagina Travaso è già nel menu, disattivata. |
| **Trend comparato più veloce** | Endpoint che restituisce più serbatoi in una richiesta, al posto delle N richieste in parallelo. |

## 10. Limiti noti

- **Eventi persi a backend fermo**: un evento iniziato e finito mentre il backend era spento non
  viene registrato.
- **Trend**: un punto al minuto (frequenza di scrittura di System Platform); ora ambigua al cambio
  dall'ora legale a quella solare.
- **`HeartBeat` `int` in `LivelliSerbatoi`**: il contatore del PLC è UDInt, quindi oltre
  2.147.483.647 l'inserimento di System Platform fallisce. Si risolve con lo script in `Database/`.
- **Credenziali**: la stringa di connessione in `appsettings.json` usa l'utente `sa` in chiaro ed è
  nel repository. Meglio un utente dedicato con i soli permessi necessari:
  - lettura su `LivelliSerbatoi`;
  - lettura e scrittura su `SupTankEvent` e `SupTankConfig`.
