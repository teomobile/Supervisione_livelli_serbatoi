# Supervisione livelli serbatoi — riepilogo per completare il backend

Stato al 21/10/2026. Il **frontend è completo**; il **backend è scritto** (§7.12) e provato con PLC
simulato e un database di prova, **non ancora** con il PLC e il database reali. Sorgenti: dati in diretta
dal **PLC 10.229.48.92 via S7**, storico dei livelli dalla tabella `dana_verniciatura.dbo.LivelliSerbatoi`,
eventi di allarme scritti dal backend in `SupTankEvent`. Questo documento contiene architettura, contratto
API, mappatura del DB PLC, decisioni prese e punti aperti.

> Il codice delle sezioni 7.6–7.9 è la bozza da cui è partita l'implementazione: il codice in uso è nel
> ServiceBackend (§7.12), che se ne discosta in alcuni punti.

---

## 1. Contesto

Capitolato (sintesi):

- PLC **Siemens S7-1200 (CPU 1214C DC/DC/DC)** nel quadro vicino ai serbatoi esterni; acquisisce i
  livelli dei serbatoi **A–H** con radar analogici e gestisce il "troppo pieno" (sensore + sirene).
- **Supervisione web** su rete aziendale: livelli in tempo reale, soglie di guardia/allarme, grafici
  nel tempo, archiviazione per elaborazioni successive.
- **Predisposizione** per il futuro travaso automatico dell'olio dai serbatoi di stoccaggio **G-H** ai
  serbatoi di produzione **A-B** (pompe), anche comandato da remoto.

Architettura concordata:

```
PLC S7-1200 serbatoi, 10.229.48.92 (DB_Gestionale, DB4)
   ├─ S7, lettura ogni 1 s ─► ServiceBackend ASP.NET Core (.NET 6): stato in diretta + eventi di allarme
   └─ System Platform ─► SQL dana_verniciatura.dbo.LivelliSerbatoi (1 riga/minuto) ─► ServiceBackend: trend
                                    ServiceBackend ─► servizi REST (TanksController) ─► frontend Angular
```

Il backend **legge** il PLC (diretta) e la tabella `LivelliSerbatoi` (storico). La stessa connessione S7 potrà in futuro **scrivere** sul PLC (soglie,
tacitazione sirene, travaso), dopo l'introduzione dell'autenticazione (§9).

## 2. Repository

- GitHub: `teomobile/Supervisione_livelli_serbatoi`, branch `claude/plc-tank-supervision-system-pdae5j`
  (nessuna pull request aperta).
- `frontend/` — progetto Angular completo, con `frontend/README.md` (dettagli tecnici del frontend).
- `docs/HANDOFF-backend.md` — questo documento.
- Il backend (ServiceBackend) **non è** in questo repository: è nel repository del ServiceBackend
  (`ServiceRestDana/ServiceBackend`), file della supervisione serbatoi elencati in §7.12.

Commit principali (dal più vecchio):

| Commit | Contenuto |
|---|---|
| `4695f6b` | Progetto Angular: sinottico, dettaglio, allarmi, mock, tema |
| `2d6fe78`, `f08ba11` | Sinottico: una zona per riga, riquadri più grandi |
| `231d288` | Dettaglio allineato; lettura della classe `Response` del backend |
| `44fb38a` | Capacità 10.000 l |
| `fc4733c` | Stato serbatoio guidato dai bit PLC; soglie facoltative |
| `10a7db2`, `2d15566` | Stati nella colonna dati; "Pieno" in arancio |
| `fc08378`, `1b092c2` | Soglie disegnate (pieno 85 %, troppo pieno 95 %) |
| `2ebd5c9` | Pagina Trend comparato |
| `2f512d5` | Pagina Configurazione |
| `e8d6b9f` | Pagina Allarmi estesa, contatori in barra e menu |

## 3. Frontend (già fatto)

### Stack

| Componente | Versione | Note |
|---|---|---|
| Angular | 21.2 | standalone, signals, senza zone.js; **Angular 19 è fuori supporto** |
| PrimeNG | 21.1 | tema Aura personalizzato, sobrio |
| ECharts / ngx-echarts | 6.1 / 21.0 | caricato solo quando serve un grafico |
| TypeScript | 5.9 | |
| Test | Vitest 4.0 (bloccato a `~4.0.8`: con 4.1 npm 10 va in errore in installazione) | 21 test |
| Node | ≥ 20.19 / 22.12 (va bene 22.17) | Angular 22 richiederebbe Node 22.22.3+ |

Avvio: `cd frontend && npm install && npm start` → http://localhost:4200. Usare `npm start` o
`npx ng`, non il CLI 19 globale.

### Configurazione a runtime: `frontend/public/config.json`

```json
{
  "apiBaseUrl": "http://localhost:5000/api",
  "useMock": true,
  "pollingIntervalMs": 5000,
  "staleDataAfterSec": 30,
  "heartbeatTimeoutSec": 180
}
```

Letto all'avvio, modificabile su IIS senza ricompilare. **Per collegare il backend vero:**
`"useMock": false` e `apiBaseUrl` = URL del ServiceBackend fino a `/api`.

### Pagine

| Rotta | Pagina | Cosa fa | Endpoint usati |
|---|---|---|---|
| `/sinottico` | Sinottico | 8 serbatoi per zona sirena (A-B Produzione, C-D, E-F, G-H Stoccaggio); serbatoio grafico con linee "Max"/"Pieno", litri, %, Capacità, Radar, Pieno, Sensore max, ora del dato; stato sirena per zona | `GetSystemStatus` ogni 5 s |
| `/serbatoi/:code` | Dettaglio | stato attuale, trend 8h/24h/7g/30g/intervallo, min/max/variazione, eventi del periodo, CSV | `GetTankHistory`, `GetAlarms` |
| `/trend` | Trend comparato | più serbatoi sullo stesso grafico, litri o %, tabella riepilogo, CSV largo | `GetTankHistory` × N in parallelo |
| `/allarmi` | Allarmi | Attivi (aggiornamento automatico) e Storico, gravità, filtri serbatoio/tipo, durata, CSV | `GetAlarms` |
| `/configurazione` | Configurazione | nome, capacità, % pieno, % troppo pieno per serbatoio; "applica a tutti"; bozza, validazione, conferma | `GetTankConfig`, `SaveTankConfig` |
| `/travaso` | — | voce di menu disattivata (predisposizione) | — |

Barra in alto, sempre visibile: stato PLC (OK / Non pronto / Com. persa / Nessun dato), età
dell'ultimo dato, allarmi attivi, sirene, orologio. Se il backend non risponde compare una barra gialla
e restano visibili gli ultimi valori.

### Regole di visualizzazione (stile HMI ISA-101: colore solo per le anomalie)

| Condizione | Origine | Resa |
|---|---|---|
| Normale | — | grigio |
| Pieno | `X_Full` | etichetta **arancio** fissa "Pieno" |
| Troppo pieno | `X_TooFull` | **rosso lampeggiante**, bordo riquadro rosso, allarme |
| Guasto sensore max | `X_TooFullFault` | giallo, avviso |
| Misura non valida | `X_LevelValid = false` | viola tratteggiato, livello "----", avviso |
| Livello basso / minimo | soglie (oggi assenti) | giallo / rosso, solo se il backend manda le soglie |

Il frontend non calcola pieno/troppo pieno dai litri: **usa i bit del PLC**. Le soglie in litri
servono solo a disegnare le linee.

### Allarmi: gravità e ordinamento

| Tipo (`kind`) | Etichetta | Gravità |
|---|---|---|
| `TOO_FULL` | Troppo pieno | Allarme |
| `LOW_STOP` | Livello minimo | Allarme |
| `PLC_NOT_READY` | PLC non pronto (`PLCReady = 0`) | Allarme |
| `PLC_COMM` | Comunicazione PLC | Allarme |
| `FULL` | Pieno (`X_Full`) | Avviso |
| `TOO_FULL_FAULT` | Guasto sensore max | Avviso |
| `LEVEL_INVALID` | Misura non valida | Avviso |
| `LOW_WARNING` | Livello basso | Avviso |

Il riconoscimento (ack) non è implementato di proposito: senza autenticazione non si sa chi ha
riconosciuto, e tacitare le sirene richiede una scrittura sul PLC.

## 4. Contratto API da implementare

Controller **`TanksController`**, rotta `api/Tanks/...`, stesso stile degli altri controller.
Ogni risposta è avvolta nella classe esistente `ServiceBackend.Model.Response`:

```json
{ "statusCode": 200, "statusMessage": "OK", "listItem": { } }
```

Regole che il frontend si aspetta (`frontend/src/app/core/api/backend-response.ts`):

- JSON in **camelCase** (default di ASP.NET Core). Se il progetto ha `PropertyNamingPolicy = null` o
  Newtonsoft con impostazioni predefinite, i nomi arrivano in PascalCase e il frontend non li legge.
  Verifica: aprire `/api/Axles/GetAllAlarms` nel browser e controllare se c'è `statusCode` o `StatusCode`.
- `statusCode` fuori da 200–299 = errore, mostrato con `statusMessage`.
- `listItem` nullo = errore per stato/storico/configurazione; lista vuota per gli allarmi.
- HTTP 200 anche per gli errori applicativi va bene (è la convenzione esistente); un HTTP 500 è
  comunque gestito come errore.
- **Date in ISO 8601 con fuso** (`2026-10-02T08:00:00Z` o `+02:00`). Una `DateTime` con
  `Kind = Unspecified` viene serializzata senza fuso e il browser la interpreta come ora locale:
  usare `DateTimeOffset` oppure `DateTime.SpecifyKind(..., DateTimeKind.Utc)` dopo la conversione.
- Codici come stringhe: serbatoio `"A"`…`"H"`, zona `"AB"|"CD"|"EF"|"GH"`, tipo allarme come in §3.

| Metodo | Parametri query / corpo | `listItem` |
|---|---|---|
| `GET Tanks/GetSystemStatus` | — | `SystemStatus` |
| `GET Tanks/GetTankHistory` | `code`, `from`, `to` (ISO 8601 UTC) | `TankHistory` |
| `GET Tanks/GetAlarms` | `activeOnly` (bool), `from?`, `to?`, `code?` | `AlarmEvent[]` |
| `GET Tanks/GetTankConfig` | — | `TankConfig[]` (8 righe A–H) |
| `POST Tanks/SaveTankConfig` | corpo: `TankConfig[]` con le sole righe modificate | `TankConfig[]` completo aggiornato |

Frequenza: per ogni browser aperto, `GetSystemStatus` e `GetAlarms?activeOnly=true` ogni 5 s.

### DTO (definiti nel frontend in `frontend/src/app/core/models/`)

```ts
type TankCode = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H';
type ZoneCode = 'AB'|'CD'|'EF'|'GH';

interface TankThresholds {          // litri; null = non disponibile
  fillLiters: number | null;        // soglia di pieno (X_Full)
  tooFullLiters: number | null;     // quota sensore troppo pieno (X_TooFull)
  lowWarningLiters: number | null;  // oggi sempre null (non nel DB4)
  lowStopLiters: number | null;     // oggi sempre null (non nel DB4)
}
interface TankStatus {
  code: TankCode; name: string; zone: ZoneCode; capacityLiters: number;
  levelPercent: number | null; levelLiters: number | null;   // null se misura non disponibile
  levelValid: boolean; full: boolean; tooFull: boolean; tooFullFault: boolean;
  thresholds: TankThresholds;
  timestamp: string;                // ora del dato storicizzato
}
interface PlcStatus { plcReady: boolean; heartbeat: number; heartbeatChangedAt: string; dataVersion: number; }
interface ZoneHorn { zone: ZoneCode; active: boolean; }
interface SystemStatus { plc: PlcStatus; tanks: TankStatus[]; horns: ZoneHorn[]; serverTime: string; }

interface LevelSample { timestamp: string; levelLiters: number | null; levelPercent: number | null; }
interface TankHistory { code: TankCode; capacityLiters: number; thresholds: TankThresholds; samples: LevelSample[]; }

type AlarmKind = 'TOO_FULL'|'FULL'|'TOO_FULL_FAULT'|'LEVEL_INVALID'|'LOW_WARNING'|'LOW_STOP'|'PLC_NOT_READY'|'PLC_COMM';
interface AlarmEvent { id: number; kind: AlarmKind; tankCode: TankCode | null; message: string;
                       raisedAt: string; clearedAt: string | null; }   // clearedAt null = attivo

interface TankConfig { code: TankCode; name: string; capacityLiters: number;
                       fullPercent: number; tooFullPercent: number; updatedAt: string | null; }
```

Dettagli che contano:

- `heartbeatChangedAt` + `serverTime`: il frontend calcola l'età dell'heartbeat **sull'ora del
  server** (non del PC client). Oltre `heartbeatTimeoutSec` (20 s) mostra "Com. persa".
- `levelLiters = levelPercent × capacityLiters / 100`, capacità dalla configurazione.
- `thresholds.fillLiters = capacity × fullPercent / 100`; `tooFullLiters = capacity × tooFullPercent / 100`.
- Storico: circa **600 punti** per intervallo (il frontend non ricampiona). Campioni con misura non
  valida → `levelLiters`/`levelPercent` null (il grafico interrompe la linea).
- `name` del `TankStatus` = nome dalla configurazione (default "Serbatoio X").

## 5. Dati del PLC

### 5.1 DB_Gestionale (DB4) nel PLC

DB **non ottimizzato** (offset assoluti), `DataVersion` UInt a 0.0.

| Offset | Nome | Tipo | Campo DTO |
|---|---|---|---|
| 0.0 | `DataVersion` | UInt | `plc.dataVersion` |
| 2.0 | `PLCReady` | Bool | `plc.plcReady` |
| 4.0 | `Heartbeat` | UDInt | `plc.heartbeat` (+ ora ultimo cambio → `heartbeatChangedAt`) |
| A: 8.0 / 12.0 / 12.1 / 12.2 / 12.3 | `A_LevelPercent` Real, `A_LevelValid`, `A_Full`, `A_TooFull`, `A_TooFullFault` Bool | | `levelPercent`, `levelValid`, `full`, `tooFull`, `tooFullFault` |
| B | 14.0 / 18.0–18.3 | | idem |
| C | 20.0 / 24.0–24.3 | | idem |
| D | 26.0 / 30.0–30.3 | | idem |
| E | 32.0 / 36.0–36.3 | | idem |
| F | 38.0 / 42.0–42.3 | | idem |
| G | 44.0 / 48.0–48.3 | | idem |
| H | 50.0 / 54.0–54.3 | | idem |
| 54.4 / 54.5 / 54.6 / 54.7 | `Horn_AB`, `Horn_CD`, `Horn_EF`, `Horn_GH` | Bool | `horns[]` |

Nel DB4 **non ci sono**: valori di soglia, livello basso/minimo, comandi (tacitazione, travaso),
stato "Rabbocco" (presente nel vecchio supervisore per il serbatoio A).

### 5.2 Tabella `dana_verniciatura.dbo.LivelliSerbatoi` (solo storico)

System Platform scrive **una riga al minuto** (potrà variare) con i valori del DB4. Il backend la usa
**solo per i trend**: stato attuale e allarmi vengono dal PLC (§7.1).

| Colonna | Tipo | Origine DB4 | Uso nel backend |
|---|---|---|---|
| `Id` | bigint identity, PK clustered | — | — |
| `DataOra` | datetime, default `getdate()` | — | asse dei tempi del trend (ora **locale** del server SQL, confermato) |
| `X_LevelPercent` | float | `X_LevelPercent` | valore del trend |
| `X_LevelValid` | bit | `X_LevelValid` | esclude dal trend le misure non valide |
| `DataVersion`, `PlcReady`, `HeartBeat` | int, bit, int | idem | non usati (diretta dal PLC) |
| `X_Full`, `X_TooFull` | bit | idem | non usati (eventi dal PLC) |
| `Horn_AB`, `Horn_CD`, `Horn_Ef`, `Horn_GH` | bit | `Horn_*` | non usati (diretta dal PLC) |

`X` = A…H. Tutte le colonne ammettono NULL.

Differenze rispetto al DB4 e conseguenze:

| Punto | Conseguenza | Proposta |
|---|---|---|
| Manca `X_TooFullFault` (8 colonne) | nessuna sul supervisore: il dato si legge dal PLC e gli eventi li registra il backend | facoltativo, per completezza dello storico |
| `DataOra` in ora locale, tipo `datetime` | conversione in UTC nel backend; l'ora doppia del cambio da ora legale a solare è ambigua | conversione con `TimeZoneInfo` (§7.8); in futuro `datetime2` in UTC o `datetimeoffset` |
| `HeartBeat` int, nel PLC UDInt | oltre 2.147.483.647 l'inserimento fallisce o il valore diventa negativo | portare a `bigint` |
| Nessun indice su `DataOra` | il trend su 30 giorni legge tutta la tabella | indice su `DataOra` (§7.11) |
| Una riga **al minuto** (potrà variare) | il trend ha un punto al minuto; non riguarda sinottico e allarmi | nessuna modifica al codice se cambia |

```sql
-- Colonne mancanti rispetto al DB4 e heartbeat a 64 bit
ALTER TABLE dbo.LivelliSerbatoi ADD
    A_TooFullFault bit NULL, B_TooFullFault bit NULL, C_TooFullFault bit NULL, D_TooFullFault bit NULL,
    E_TooFullFault bit NULL, F_TooFullFault bit NULL, G_TooFullFault bit NULL, H_TooFullFault bit NULL;
ALTER TABLE dbo.LivelliSerbatoi ALTER COLUMN HeartBeat bigint NULL;
```

L'`ALTER TABLE` su `HeartBeat` evita che l'inserimento di System Platform fallisca quando il contatore del PLC supera il limite di `int`.

## 6. Decisioni prese

| Tema | Decisione |
|---|---|
| Capacità | 10.000 l per serbatoio, cilindro verticale, parametrizzabile per serbatoio |
| Soglia pieno | 85 % per tutti, parametrizzabile (solo per il disegno; l'evento lo decide il PLC) |
| Troppo pieno | 95 % per tutti, parametrizzabile (quota del sensore) |
| Soglie basse | rimandate: richiedono modifiche al PLC |
| Modifiche al PLC | rimandate; elenco dei punti aperti preparato per il softwarista (§9) |
| Dove salvare la configurazione | **tabella SQL** (non `appsettings.json`, che un'API non deve riscrivere); `appsettings.json` solo per i valori iniziali |
| Autenticazione | nessuna per ora (rete interna). Quando si scriverà sul PLC: Windows Authentication su IIS, non JWT |
| Aggiornamento dati | polling ogni 5 s (SignalR non serve finché i dati vengono dallo storico) |
| Grafici | ECharts, non il chart di PrimeNG (Chart.js regge male migliaia di punti) |
| Dati in diretta | letti dal **PLC 10.229.48.92 via S7** dal backend, una connessione in background; il PLC del `PlcService` esistente non si tocca |
| Storico livelli | tabella `LivelliSerbatoi` scritta da System Platform, una riga al minuto |
| Storico allarmi | tabella `SupTankEvent` scritta dal backend quando cambia un bit (precisione ~1 s) |

## 7. Backend da scrivere

### 7.1 Sorgenti dati

```
PLC 10.229.48.92 (DB4) ──S7, 1 connessione──► TankMonitorService (backend, ogni 1 s)
                                                 ├─► TankLiveState (in memoria) ──► GetSystemStatus
                                                 └─► dbo.SupTankEvent (inizio/fine eventi) ──► GetAlarms
System Platform ──1 riga/minuto──► dbo.LivelliSerbatoi ──────────────────────────► GetTankHistory
                                   dbo.SupTankConfig ◄──────────────────────────► GetTankConfig / SaveTankConfig
```

| Endpoint | Sorgente |
|---|---|
| `GetSystemStatus` | ultima lettura del PLC tenuta in memoria + `SupTankConfig` |
| `GetAlarms?activeOnly=true` | `SupTankEvent` con `ClearedAt IS NULL` |
| `GetAlarms` (storico) | `SupTankEvent` nel periodo |
| `GetTankHistory` | `LivelliSerbatoi`, righe nel periodo raggruppate in ~600 intervalli |
| `GetTankConfig` / `SaveTankConfig` | `SupTankConfig` |

Regole:

- **Una sola connessione al PLC**, aperta da un servizio in background. Le richieste HTTP non parlano
  mai con il PLC: leggono la copia in memoria. Con più postazioni aperte il 1214C non riceve più
  connessioni (ha un numero limitato di connessioni S7, già usate anche da System Platform).
- Il PLC 10.229.48.92 è **diverso** da quello letto dal `PlcService` esistente, che non va toccato:
  classi e connessione nuove, separate.
- Gli eventi li scrive il backend quando vede cambiare un bit: allarmi attivi e storico coincidono,
  con la precisione della lettura (1 s) e non di quella della tabella (1 minuto).
- Orari: le letture dal PLC e gli eventi usano l'orologio del server del backend, in UTC.
  `DataOra` di `LivelliSerbatoi` è ora locale del server SQL e va convertita (§7.8, `TankDal`).

### 7.2 Lettura del DB4 via S7

Requisiti lato PLC e rete:

- sul 1214C abilitare **"Consenti accesso con comunicazione PUT/GET dal partner remoto"**
  (Protezione e sicurezza → Meccanismi di connessione);
- DB4 **non ottimizzato** (già così): si legge per indirizzo assoluto;
- il server del backend deve raggiungere **10.229.48.92 sulla porta TCP 102**;
- S7-1200: rack 0, slot 1 (in configurazione).

Libreria: **S7netplus**, già usata dal `PlcService` esistente (nessun pacchetto nuovo). Il servizio
serbatoi crea **un proprio oggetto `Plc`** verso 10.229.48.92: non condivide l'istanza del `PlcService`,
che punta a un altro PLC e non va toccata (un oggetto `Plc` di S7netplus non va usato da più thread).

La bozza usa `OpenAsync`, `ReadBytesAsync` con `CancellationToken` e le proprietà `ReadTimeout` /
`WriteTimeout`: verificare che ci siano nella versione di S7netplus del progetto; nelle versioni più
vecchie si usano i metodi sincroni `Open()` / `ReadBytes(...)` dentro `Task.Run`.

Una lettura = **55 byte** del DB4 (offset 0–54), poi si decodificano. Tutti i valori S7 sono big-endian:

| Byte | Contenuto |
|---|---|
| 0–1 | `DataVersion` UInt |
| 2, bit 0 | `PLCReady` |
| 4–7 | `Heartbeat` UDInt |
| `8 + 6·i` … +3 | `X_LevelPercent` Real del serbatoio *i* (A = 0 … H = 7) |
| `12 + 6·i`, bit 0/1/2/3 | `X_LevelValid` / `X_Full` / `X_TooFull` / `X_TooFullFault` |
| 54, bit 4/5/6/7 | `Horn_AB` / `Horn_CD` / `Horn_EF` / `Horn_GH` |

Controllo: A = 8.0 e 12.0–12.3, H = 50.0 e 54.0–54.3, come nella tabella del DB4 (§5.1).

### 7.3 Servizio in background ed eventi

`TankMonitorService` (`BackgroundService`), ciclo ogni `PollIntervalMs` (1 s):

1. Se non connesso, apre la connessione; legge i 55 byte; aggiorna `TankLiveState`.
2. Calcola le condizioni attive dalla lettura:

| Tipo | Condizione | Serbatoio |
|---|---|---|
| `TOO_FULL` | `X_TooFull` | sì |
| `FULL` | `X_Full` | sì |
| `TOO_FULL_FAULT` | `X_TooFullFault` | sì |
| `LEVEL_INVALID` | `X_LevelValid = 0` | sì |
| `PLC_NOT_READY` | `PLCReady = 0` | no |
| `PLC_COMM` | heartbeat fermo da più di `HeartbeatTimeoutSec`, o PLC non leggibile | no |

3. Confronta con gli eventi aperti: condizione nuova → `INSERT` con `RaisedAt`; condizione sparita →
   `UPDATE ClearedAt`.
4. Se la lettura fallisce: chiude la connessione, segna l'errore, riprova dopo `ReconnectDelayMs`. Gli
   altri eventi restano come sono (non si sa se sono rientrati); si valuta solo `PLC_COMM`.
5. Un errore nel database non ferma la lettura del PLC: l'evento viene riscritto al giro successivo.

All'avvio il servizio carica gli eventi aperti dalla tabella e alla prima lettura chiude quelli non più
attivi, con l'ora della lettura: **mentre il backend è fermo gli eventi non vengono registrati**, e un
evento rientrato in quel periodo risulta chiuso al riavvio.

Il servizio funziona solo se l'applicazione è in esecuzione: su IIS va tenuta **sempre attiva** (§7.10).

### 7.4 Tabella di configurazione

Nello stesso database della tabella dei livelli:

```sql
USE [dana_verniciatura];
GO

CREATE TABLE dbo.SupTankConfig (
    Code            CHAR(1)       NOT NULL PRIMARY KEY,
    Name            NVARCHAR(30)  NOT NULL,
    CapacityLiters  FLOAT         NOT NULL,
    FullPercent     FLOAT         NOT NULL,
    TooFullPercent  FLOAT         NOT NULL,
    UpdatedAt       DATETIME2     NULL,       -- UTC
    CONSTRAINT CK_SupTankConfig_Code     CHECK (Code IN ('A','B','C','D','E','F','G','H')),
    CONSTRAINT CK_SupTankConfig_Capacity CHECK (CapacityLiters BETWEEN 100 AND 100000),
    CONSTRAINT CK_SupTankConfig_Percent  CHECK (FullPercent > 0 AND TooFullPercent <= 100
                                                AND FullPercent < TooFullPercent)
);

INSERT INTO dbo.SupTankConfig (Code, Name, CapacityLiters, FullPercent, TooFullPercent)
VALUES ('A','Serbatoio A',10000,85,95), ('B','Serbatoio B',10000,85,95),
       ('C','Serbatoio C',10000,85,95), ('D','Serbatoio D',10000,85,95),
       ('E','Serbatoio E',10000,85,95), ('F','Serbatoio F',10000,85,95),
       ('G','Serbatoio G',10000,85,95), ('H','Serbatoio H',10000,85,95);
```

`SaveTankConfig` deve ripetere lato server le stesse validazioni del frontend (nome 1–30 caratteri,
capacità 100–100.000 l, 0 < pieno < troppo pieno ≤ 100), aggiornare solo le righe ricevute in una
transazione, impostare `UpdatedAt = SYSUTCDATETIME()` e restituire tutte le 8 righe.

### 7.5 Tabella degli eventi

```sql
USE [dana_verniciatura];
GO

CREATE TABLE dbo.SupTankEvent (
    Id         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Kind       VARCHAR(20)   NOT NULL,
    TankCode   CHAR(1)       NULL,          -- NULL per PLC_NOT_READY e PLC_COMM
    Message    NVARCHAR(200) NOT NULL,
    RaisedAt   DATETIME2(0)  NOT NULL,      -- UTC
    ClearedAt  DATETIME2(0)  NULL,          -- UTC; NULL = evento in corso
    CONSTRAINT CK_SupTankEvent_Kind CHECK (Kind IN
        ('TOO_FULL','FULL','TOO_FULL_FAULT','LEVEL_INVALID','LOW_WARNING','LOW_STOP','PLC_NOT_READY','PLC_COMM')),
    CONSTRAINT CK_SupTankEvent_Code CHECK (TankCode IS NULL OR TankCode IN ('A','B','C','D','E','F','G','H')),
    CONSTRAINT CK_SupTankEvent_Dates CHECK (ClearedAt IS NULL OR ClearedAt >= RaisedAt)
);
GO

-- Al massimo un evento aperto per tipo e serbatoio (protegge da doppie istanze del backend)
CREATE UNIQUE NONCLUSTERED INDEX UX_SupTankEvent_Open
    ON dbo.SupTankEvent (Kind, TankCode)
    WHERE ClearedAt IS NULL;
GO

-- Storico per periodo
CREATE NONCLUSTERED INDEX IX_SupTankEvent_RaisedAt
    ON dbo.SupTankEvent (RaisedAt) INCLUDE (Kind, TankCode, Message, ClearedAt);
GO
```

Gli indici filtrati richiedono le opzioni `SET` standard (`ANSI_NULLS`, `QUOTED_IDENTIFIER` ON), già
attive nella connessione di `Microsoft.Data.SqlClient`.

### 7.6 DTO C# (bozza)

```csharp
using System;
using System.Collections.Generic;

namespace ServiceBackend.Model.Tanks
{
    public class TankThresholdsDto
    {
        public double? FillLiters { get; set; }
        public double? TooFullLiters { get; set; }
        public double? LowWarningLiters { get; set; }   // oggi sempre null
        public double? LowStopLiters { get; set; }      // oggi sempre null
    }

    public class TankStatusDto
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string Zone { get; set; } = "";          // "AB" | "CD" | "EF" | "GH"
        public double CapacityLiters { get; set; }
        public double? LevelPercent { get; set; }
        public double? LevelLiters { get; set; }
        public bool LevelValid { get; set; }
        public bool Full { get; set; }
        public bool TooFull { get; set; }
        public bool TooFullFault { get; set; }
        public TankThresholdsDto Thresholds { get; set; } = new TankThresholdsDto();
        public DateTimeOffset Timestamp { get; set; }
    }

    public class PlcStatusDto
    {
        public bool PlcReady { get; set; }
        public long Heartbeat { get; set; }              // UDInt
        public DateTimeOffset HeartbeatChangedAt { get; set; }
        public int DataVersion { get; set; }
    }

    public class ZoneHornDto
    {
        public string Zone { get; set; } = "";
        public bool Active { get; set; }
    }

    public class SystemStatusDto
    {
        public PlcStatusDto Plc { get; set; } = new PlcStatusDto();
        public List<TankStatusDto> Tanks { get; set; } = new List<TankStatusDto>();
        public List<ZoneHornDto> Horns { get; set; } = new List<ZoneHornDto>();
        public DateTimeOffset ServerTime { get; set; }
    }

    public class LevelSampleDto
    {
        public DateTimeOffset Timestamp { get; set; }
        public double? LevelLiters { get; set; }
        public double? LevelPercent { get; set; }
    }

    public class TankHistoryDto
    {
        public string Code { get; set; } = "";
        public double CapacityLiters { get; set; }
        public TankThresholdsDto Thresholds { get; set; } = new TankThresholdsDto();
        public List<LevelSampleDto> Samples { get; set; } = new List<LevelSampleDto>();
    }

    public class AlarmEventDto
    {
        public long Id { get; set; }
        public string Kind { get; set; } = "";          // "TOO_FULL", "FULL", "LEVEL_INVALID", "PLC_NOT_READY", ...
        public string? TankCode { get; set; }            // null per PLC_COMM e PLC_NOT_READY
        public string Message { get; set; } = "";
        public DateTimeOffset RaisedAt { get; set; }
        public DateTimeOffset? ClearedAt { get; set; }   // null = attivo
    }

    public class TankConfigDto
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public double CapacityLiters { get; set; }
        public double FullPercent { get; set; }
        public double TooFullPercent { get; set; }
        public DateTimeOffset? UpdatedAt { get; set; }
    }
}
```

`Kind` resta stringa (con i valori esatti di §3) per evitare di configurare un convertitore di enum.

### 7.7 Controller (scheletro)

Stesso schema degli altri controller: risposta sempre in `Response`, errori nel log.
Usa la classe `TankDal` di §7.8, separata dal `DAL` esistente.

```csharp
using Microsoft.AspNetCore.Mvc;
using ServiceBackend.Model;
using ServiceBackend.Model.Tanks;
using ServiceBackend.Tanks;

namespace ServiceBackend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TanksController : ControllerBase
    {
        private readonly ILogger<TanksController> _logger;
        private readonly TankDal _tanks;   // nuova classe di accesso dati: storico + SupTankConfig

        public TanksController(ILogger<TanksController> logger, TankDal tanks)
        {
            _logger = logger;
            _tanks = tanks;
        }

        [HttpGet("GetSystemStatus")]
        public Task<ActionResult<Response>> GetSystemStatus() =>
            Run(nameof(GetSystemStatus), () => _tanks.GetSystemStatusAsync());

        [HttpGet("GetTankHistory")]
        public Task<ActionResult<Response>> GetTankHistory([FromQuery] string code, [FromQuery] DateTimeOffset from, [FromQuery] DateTimeOffset to)
        {
            if (!TankDal.IsValidCode(code) || to <= from)
                return Task.FromResult<ActionResult<Response>>(Ok(Error(400, "Parametri non validi")));
            return Run(nameof(GetTankHistory), () => _tanks.GetTankHistoryAsync(code, from, to));
        }

        [HttpGet("GetAlarms")]
        public Task<ActionResult<Response>> GetAlarms([FromQuery] bool activeOnly, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] string? code) =>
            Run(nameof(GetAlarms), () => _tanks.GetAlarmsAsync(activeOnly, from, to, code));

        [HttpGet("GetTankConfig")]
        public Task<ActionResult<Response>> GetTankConfig() =>
            Run(nameof(GetTankConfig), () => _tanks.GetTankConfigAsync());

        [HttpPost("SaveTankConfig")]
        public async Task<ActionResult<Response>> SaveTankConfig([FromBody] List<TankConfigDto> changes)
        {
            var errors = TankDal.Validate(changes);
            if (errors.Count > 0) return Ok(Error(400, string.Join("; ", errors)));
            return await Run(nameof(SaveTankConfig), () => _tanks.SaveTankConfigAsync(changes));
        }

        private async Task<ActionResult<Response>> Run<T>(string action, Func<Task<T>> work)
        {
            try
            {
                var data = await work();
                return Ok(new Response { StatusCode = 200, StatusMessage = "OK", ListItem = data });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Errore in Tanks/{Action}", action);
                return Ok(Error(500, ex.Message));
            }
        }

        // "Response" dentro un controller indica anche la proprietà HttpResponse: qui si usa solo new Response { }.
        private static Response Error(int code, string message) =>
            new Response { StatusCode = code, StatusMessage = message, ListItem = null };
    }
}
```

Usare `string?` per i parametri facoltativi: con `Nullable` attivo nel progetto (default dei template
.NET 6), un parametro `string` non annullabile diventa obbligatorio e ASP.NET risponde 400 da solo.

Nota: `GetAlarms` con `activeOnly=true` e nessun allarme deve restituire `ListItem = []` con
`StatusCode = 200` (non 204/null): il frontend lo legge come "nessun allarme attivo".

### 7.8 Codice di accesso (bozza)

Cinque classi nuove, nessuna modifica a `PlcService` e `DAL`:

| Classe | Ciclo di vita | Compito |
|---|---|---|
| `TankPlcOptions` | configurazione | parametri del PLC serbatoi |
| `Db4Layout` | statica | decodifica dei 55 byte |
| `TankLiveState` | singleton | ultima lettura e ora dell'ultimo cambio dell'heartbeat |
| `TankEventStore` | singleton | lettura e scrittura di `SupTankEvent` |
| `TankMonitorService` | hosted service | lettura ciclica del PLC ed eventi |
| `TankDal` | scoped | dati per il controller: stato, storico, allarmi, configurazione |

#### Opzioni, decodifica, stato in memoria

```csharp
using System.Buffers.Binary;

namespace ServiceBackend.Tanks
{
    public class TankPlcOptions
    {
        public string Ip { get; set; } = "10.229.48.92";
        public short Rack { get; set; } = 0;
        public short Slot { get; set; } = 1;
        public int DbNumber { get; set; } = 4;
        public int PollIntervalMs { get; set; } = 1000;
        public int ReconnectDelayMs { get; set; } = 5000;
        public int TimeoutMs { get; set; } = 2000;
        public int HeartbeatTimeoutSec { get; set; } = 20;
    }

    public sealed record TankLive(string Code, double LevelPercent, bool LevelValid, bool Full, bool TooFull, bool TooFullFault);

    public sealed record PlcSnapshot(
        DateTimeOffset ReadAt, int DataVersion, bool PlcReady, long Heartbeat,
        IReadOnlyList<TankLive> Tanks, IReadOnlyDictionary<string, bool> Horns);

    public static class Db4Layout
    {
        public static readonly string[] Codes = { "A", "B", "C", "D", "E", "F", "G", "H" };
        public const int Length = 55;   // byte 0..54

        public static PlcSnapshot Parse(byte[] b, DateTimeOffset readAt)
        {
            if (b.Length < Length) throw new InvalidOperationException($"DB4: letti {b.Length} byte, attesi {Length}");

            var tanks = new List<TankLive>(Codes.Length);
            for (int i = 0; i < Codes.Length; i++)
            {
                int off = 8 + 6 * i;
                byte bits = b[off + 4];
                tanks.Add(new TankLive(
                    Codes[i],
                    BinaryPrimitives.ReadSingleBigEndian(b.AsSpan(off, 4)),
                    LevelValid: (bits & 0x01) != 0,
                    Full: (bits & 0x02) != 0,
                    TooFull: (bits & 0x04) != 0,
                    TooFullFault: (bits & 0x08) != 0));
            }

            byte horns = b[54];
            return new PlcSnapshot(
                readAt,
                DataVersion: BinaryPrimitives.ReadUInt16BigEndian(b.AsSpan(0, 2)),
                PlcReady: (b[2] & 0x01) != 0,
                Heartbeat: BinaryPrimitives.ReadUInt32BigEndian(b.AsSpan(4, 4)),
                Tanks: tanks,
                Horns: new Dictionary<string, bool>
                {
                    ["AB"] = (horns & 0x10) != 0,
                    ["CD"] = (horns & 0x20) != 0,
                    ["EF"] = (horns & 0x40) != 0,
                    ["GH"] = (horns & 0x80) != 0,
                });
        }
    }

    /// <summary>Ultima lettura del PLC, condivisa tra il servizio di lettura e le richieste HTTP.</summary>
    public sealed class TankLiveState
    {
        private readonly object _gate = new();
        private PlcSnapshot? _last;
        private DateTimeOffset? _heartbeatChangedAt;
        private string? _lastError;

        public void Update(PlcSnapshot s)
        {
            lock (_gate)
            {
                if (_last == null || _last.Heartbeat != s.Heartbeat) _heartbeatChangedAt = s.ReadAt;
                _last = s;
                _lastError = null;
            }
        }

        public void SetError(string message)
        {
            lock (_gate) { _lastError = message; }
        }

        public (PlcSnapshot? Snapshot, DateTimeOffset? HeartbeatChangedAt, string? LastError) Read()
        {
            lock (_gate) { return (_last, _heartbeatChangedAt, _lastError); }
        }
    }
}
```

#### Eventi su database

```csharp
using Dapper;
using Microsoft.Data.SqlClient;
using ServiceBackend.Model.Tanks;

namespace ServiceBackend.Tanks
{
    public sealed record EventKey(string Kind, string? TankCode);

    public class TankEventStore
    {
        private readonly string _connectionString;

        public TankEventStore(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DanaBackendEntities")
                ?? throw new InvalidOperationException("Stringa di connessione 'DanaBackendEntities' mancante");
        }

        public async Task<HashSet<EventKey>> LoadOpenKeysAsync()
        {
            using var cn = new SqlConnection(_connectionString);
            var rows = await cn.QueryAsync<(string Kind, string? TankCode)>(
                "SELECT Kind, TankCode FROM dbo.SupTankEvent WHERE ClearedAt IS NULL");
            return rows.Select(r => new EventKey(r.Kind, r.TankCode)).ToHashSet();
        }

        public async Task OpenAsync(EventKey key, string message, DateTimeOffset at)
        {
            using var cn = new SqlConnection(_connectionString);
            try
            {
                await cn.ExecuteAsync(@"
                    INSERT INTO dbo.SupTankEvent (Kind, TankCode, Message, RaisedAt)
                    VALUES (@Kind, @TankCode, @message, @at)",
                    new { key.Kind, key.TankCode, message, at = at.UtcDateTime });
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627)
            {
                // Evento già aperto (indice univoco sugli eventi aperti): niente da fare.
            }
        }

        public async Task CloseAsync(EventKey key, DateTimeOffset at)
        {
            using var cn = new SqlConnection(_connectionString);
            await cn.ExecuteAsync(@"
                UPDATE dbo.SupTankEvent SET ClearedAt = @at
                WHERE Kind = @Kind AND ClearedAt IS NULL
                  AND (TankCode = @TankCode OR (TankCode IS NULL AND @TankCode IS NULL))",
                new { key.Kind, key.TankCode, at = at.UtcDateTime });
        }

        private sealed class EventRow
        {
            public long Id { get; set; }
            public string Kind { get; set; } = "";
            public string? TankCode { get; set; }
            public string Message { get; set; } = "";
            public DateTime RaisedAt { get; set; }
            public DateTime? ClearedAt { get; set; }
        }

        public async Task<List<AlarmEventDto>> QueryAsync(bool activeOnly, DateTimeOffset? from, DateTimeOffset? to, string? code)
        {
            using var cn = new SqlConnection(_connectionString);
            var rows = activeOnly
                ? await cn.QueryAsync<EventRow>(@"
                    SELECT Id, Kind, TankCode, Message, RaisedAt, ClearedAt FROM dbo.SupTankEvent
                    WHERE ClearedAt IS NULL AND (@code IS NULL OR TankCode = @code)
                    ORDER BY RaisedAt DESC", new { code })
                : await cn.QueryAsync<EventRow>(@"
                    SELECT Id, Kind, TankCode, Message, RaisedAt, ClearedAt FROM dbo.SupTankEvent
                    WHERE RaisedAt < @to AND (ClearedAt IS NULL OR ClearedAt >= @from)
                      AND (@code IS NULL OR TankCode = @code)
                    ORDER BY RaisedAt DESC",
                    new
                    {
                        code,
                        from = (from ?? DateTimeOffset.UtcNow.AddDays(-7)).UtcDateTime,
                        to = (to ?? DateTimeOffset.UtcNow).UtcDateTime,
                    });

            // Le colonne sono DATETIME2 in UTC: Dapper le restituisce senza fuso.
            static DateTimeOffset Utc(DateTime d) => new(DateTime.SpecifyKind(d, DateTimeKind.Utc));
            return rows.Select(r => new AlarmEventDto
            {
                Id = r.Id,
                Kind = r.Kind,
                TankCode = r.TankCode,
                Message = r.Message,
                RaisedAt = Utc(r.RaisedAt),
                ClearedAt = r.ClearedAt.HasValue ? Utc(r.ClearedAt.Value) : null,
            }).ToList();
        }
    }
}
```

Lo storico restituisce gli eventi **attivi in qualche momento del periodo** (iniziati prima e finiti
dopo `from` compresi).

#### Servizio di lettura

```csharp
using Microsoft.Extensions.Options;
using S7.Net;

namespace ServiceBackend.Tanks
{
    public class TankMonitorService : BackgroundService
    {
        private static readonly EventKey PlcComm = new("PLC_COMM", null);

        private readonly TankPlcOptions _opt;
        private readonly TankLiveState _state;
        private readonly TankEventStore _events;
        private readonly ILogger<TankMonitorService> _logger;
        private HashSet<EventKey> _open = new();

        public TankMonitorService(IOptions<TankPlcOptions> opt, TankLiveState state, TankEventStore events, ILogger<TankMonitorService> logger)
        {
            _opt = opt.Value;
            _state = state;
            _events = events;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken ct)
        {
            await LoadOpenEventsAsync(ct);
            Plc? plc = null;

            while (!ct.IsCancellationRequested)
            {
                int delay = _opt.PollIntervalMs;
                try
                {
                    plc ??= new Plc(CpuType.S71200, _opt.Ip, _opt.Rack, _opt.Slot)
                    {
                        ReadTimeout = _opt.TimeoutMs,
                        WriteTimeout = _opt.TimeoutMs,
                    };
                    if (!plc.IsConnected) await plc.OpenAsync(ct);

                    var bytes = await plc.ReadBytesAsync(DataType.DataBlock, _opt.DbNumber, 0, Db4Layout.Length, ct);
                    var snap = Db4Layout.Parse(bytes, DateTimeOffset.UtcNow);
                    _state.Update(snap);
                    await SyncAsync(ActiveKeys(snap), snap.ReadAt);
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Lettura PLC serbatoi {Ip} non riuscita", _opt.Ip);
                    _state.SetError(ex.Message);
                    try { plc?.Close(); } catch { /* connessione già persa */ }
                    plc = null;
                    delay = _opt.ReconnectDelayMs;
                }

                // PLC_COMM si valuta sempre, anche quando la lettura fallisce.
                var (_, hbChangedAt, _) = _state.Read();
                bool commLost = hbChangedAt == null
                    || (DateTimeOffset.UtcNow - hbChangedAt.Value).TotalSeconds > _opt.HeartbeatTimeoutSec;
                await SyncPlcCommAsync(commLost, hbChangedAt);

                try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { break; }
            }

            try { plc?.Close(); } catch { }
        }

        private async Task LoadOpenEventsAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try { _open = await _events.LoadOpenKeysAsync(); return; }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Lettura eventi aperti non riuscita, nuovo tentativo tra 10 s");
                    await Task.Delay(10_000, ct);
                }
            }
        }

        private static HashSet<EventKey> ActiveKeys(PlcSnapshot s)
        {
            var keys = new HashSet<EventKey>();
            foreach (var t in s.Tanks)
            {
                if (t.TooFull) keys.Add(new("TOO_FULL", t.Code));
                if (t.Full) keys.Add(new("FULL", t.Code));
                if (t.TooFullFault) keys.Add(new("TOO_FULL_FAULT", t.Code));
                if (!t.LevelValid) keys.Add(new("LEVEL_INVALID", t.Code));
            }
            if (!s.PlcReady) keys.Add(new("PLC_NOT_READY", null));
            return keys;
        }

        /// <summary>Apre gli eventi nuovi e chiude quelli rientrati (escluso PLC_COMM, gestito a parte).</summary>
        private async Task SyncAsync(HashSet<EventKey> active, DateTimeOffset at)
        {
            foreach (var key in active.Where(k => !_open.Contains(k)).ToList())
                await TryAsync(async () => { await _events.OpenAsync(key, Message(key), at); _open.Add(key); });
            foreach (var key in _open.Where(k => k != PlcComm && !active.Contains(k)).ToList())
                await TryAsync(async () => { await _events.CloseAsync(key, at); _open.Remove(key); });
        }

        private async Task SyncPlcCommAsync(bool commLost, DateTimeOffset? since)
        {
            if (commLost && !_open.Contains(PlcComm))
                await TryAsync(async () => { await _events.OpenAsync(PlcComm, Message(PlcComm), since ?? DateTimeOffset.UtcNow); _open.Add(PlcComm); });
            else if (!commLost && _open.Contains(PlcComm))
                await TryAsync(async () => { await _events.CloseAsync(PlcComm, DateTimeOffset.UtcNow); _open.Remove(PlcComm); });
        }

        private async Task TryAsync(Func<Task> write)
        {
            try { await write(); }
            catch (Exception ex) { _logger.LogError(ex, "Scrittura evento serbatoi non riuscita, ritento al prossimo ciclo"); }
        }

        private static string Message(EventKey k) => k.Kind switch
        {
            "TOO_FULL" => $"Serbatoio {k.TankCode}: livello massimo raggiunto",
            "FULL" => $"Serbatoio {k.TankCode}: pieno",
            "TOO_FULL_FAULT" => $"Serbatoio {k.TankCode}: anomalia sensore di massimo livello",
            "LEVEL_INVALID" => $"Serbatoio {k.TankCode}: misura radar non valida",
            "PLC_NOT_READY" => "PLC non pronto",
            "PLC_COMM" => "Comunicazione PLC interrotta",
            _ => k.Kind,
        };
    }
}
```

Nota: `PLC_COMM` aperto usa come inizio l'ultimo cambio dell'heartbeat (quando il PLC ha smesso di
rispondere), non il momento in cui scade il tempo.

#### `TankDal`: dati per il controller

```csharp
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using ServiceBackend.Model.Tanks;

namespace ServiceBackend.Tanks
{
    public class TankDal
    {
        private static readonly Dictionary<string, string> ZoneOf = new()
        {
            ["A"] = "AB", ["B"] = "AB", ["C"] = "CD", ["D"] = "CD",
            ["E"] = "EF", ["F"] = "EF", ["G"] = "GH", ["H"] = "GH",
        };

        private const int HistoryPoints = 600;

        private readonly string _connectionString;
        private readonly TimeZoneInfo _sourceZone;
        private readonly TankLiveState _live;
        private readonly TankEventStore _events;
        private readonly TankPlcOptions _plc;
        private readonly ILogger<TankDal> _logger;

        public TankDal(IConfiguration config, TankLiveState live, TankEventStore events, IOptions<TankPlcOptions> plc, ILogger<TankDal> logger)
        {
            _connectionString = config.GetConnectionString("DanaBackendEntities")
                ?? throw new InvalidOperationException("Stringa di connessione 'DanaBackendEntities' mancante");
            _sourceZone = TimeZoneInfo.FindSystemTimeZoneById(config["Tanks:SourceTimeZone"] ?? "W. Europe Standard Time");
            _live = live;
            _events = events;
            _plc = plc.Value;
            _logger = logger;
        }

        public static bool IsValidCode(string? code) => code != null && Db4Layout.Codes.Contains(code);

        // ---------- stato attuale: dal PLC (memoria) ----------

        public async Task<SystemStatusDto> GetSystemStatusAsync()
        {
            var (snap, hbChangedAt, error) = _live.Read();
            if (snap == null)
                throw new InvalidOperationException($"PLC serbatoi {_plc.Ip} non ancora letto{(error != null ? ": " + error : "")}");

            var config = (await GetTankConfigAsync()).ToDictionary(c => c.Code);
            return new SystemStatusDto
            {
                Plc = new PlcStatusDto
                {
                    PlcReady = snap.PlcReady,
                    Heartbeat = snap.Heartbeat,
                    HeartbeatChangedAt = hbChangedAt ?? snap.ReadAt,
                    DataVersion = snap.DataVersion,
                },
                Tanks = snap.Tanks.Select(t => BuildTank(t, config[t.Code], snap.ReadAt)).ToList(),
                Horns = snap.Horns.Select(h => new ZoneHornDto { Zone = h.Key, Active = h.Value }).ToList(),
                // Stesso orologio di HeartbeatChangedAt (server del backend).
                ServerTime = DateTimeOffset.UtcNow,
            };
        }

        private static TankStatusDto BuildTank(TankLive t, TankConfigDto cfg, DateTimeOffset readAt)
        {
            double? pct = t.LevelValid ? Math.Round(t.LevelPercent, 1) : null;
            return new TankStatusDto
            {
                Code = t.Code,
                Name = cfg.Name,
                Zone = ZoneOf[t.Code],
                CapacityLiters = cfg.CapacityLiters,
                LevelPercent = pct,
                LevelLiters = pct.HasValue ? Math.Round(pct.Value * cfg.CapacityLiters / 100, 0) : null,
                LevelValid = t.LevelValid,
                Full = t.Full,
                TooFull = t.TooFull,
                TooFullFault = t.TooFullFault,
                Thresholds = ThresholdsOf(cfg),
                Timestamp = readAt,
            };
        }

        private static TankThresholdsDto ThresholdsOf(TankConfigDto c) => new()
        {
            FillLiters = c.CapacityLiters * c.FullPercent / 100,
            TooFullLiters = c.CapacityLiters * c.TooFullPercent / 100,
            LowWarningLiters = null,   // non presenti nel DB4
            LowStopLiters = null,
        };

        // ---------- allarmi: dalla tabella eventi ----------

        public Task<List<AlarmEventDto>> GetAlarmsAsync(bool activeOnly, DateTimeOffset? from, DateTimeOffset? to, string? code)
        {
            if (code != null && !IsValidCode(code)) throw new ArgumentException("Serbatoio non valido", nameof(code));
            return _events.QueryAsync(activeOnly, from, to, code);
        }

        // ---------- storico: dalla tabella LivelliSerbatoi (DataOra = ora locale) ----------

        private DateTimeOffset ToUtc(DateTime local) =>
            new(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), _sourceZone));

        private DateTime ToLocal(DateTimeOffset utc) => TimeZoneInfo.ConvertTimeFromUtc(utc.UtcDateTime, _sourceZone);

        private sealed class BucketRow
        {
            public int Bucket { get; set; }
            public double? LevelPercent { get; set; }
        }

        public async Task<TankHistoryDto> GetTankHistoryAsync(string code, DateTimeOffset from, DateTimeOffset to)
        {
            if (!IsValidCode(code)) throw new ArgumentException("Serbatoio non valido", nameof(code));

            var now = DateTimeOffset.UtcNow;
            if (to > now) to = now;
            int bucketSec = Math.Max(60, (int)Math.Ceiling((to - from).TotalSeconds / HistoryPoints));
            var fromLocal = ToLocal(from);
            var toLocal = ToLocal(to);
            var cfg = (await GetTankConfigAsync()).Single(c => c.Code == code);

            using var cn = new SqlConnection(_connectionString);
            // {code} è una lettera A-H già validata: è l'unico testo inserito nella query.
            var rows = (await cn.QueryAsync<BucketRow>($@"
                SELECT DATEDIFF(second, @fromLocal, DataOra) / @bucketSec AS Bucket,
                       AVG(CASE WHEN {code}_LevelValid = 1 THEN {code}_LevelPercent END) AS LevelPercent
                FROM dbo.LivelliSerbatoi
                WHERE DataOra >= @fromLocal AND DataOra < @toLocal
                GROUP BY DATEDIFF(second, @fromLocal, DataOra) / @bucketSec",
                new { fromLocal, toLocal, bucketSec }, commandTimeout: 60))
                .ToDictionary(r => r.Bucket, r => r.LevelPercent);

            int buckets = (int)Math.Ceiling((to - from).TotalSeconds / bucketSec);
            var samples = new List<LevelSampleDto>(Math.Max(0, buckets));
            for (int b = 0; b < buckets; b++)
            {
                rows.TryGetValue(b, out var pct);
                samples.Add(new LevelSampleDto
                {
                    Timestamp = ToUtc(fromLocal.AddSeconds((double)b * bucketSec)),
                    LevelPercent = pct.HasValue ? Math.Round(pct.Value, 1) : null,
                    LevelLiters = pct.HasValue ? Math.Round(pct.Value * cfg.CapacityLiters / 100, 0) : null,
                });
            }

            return new TankHistoryDto { Code = code, CapacityLiters = cfg.CapacityLiters, Thresholds = ThresholdsOf(cfg), Samples = samples };
        }

        // ---------- configurazione ----------

        public async Task<List<TankConfigDto>> GetTankConfigAsync()
        {
            using var cn = new SqlConnection(_connectionString);
            var rows = (await cn.QueryAsync<(string Code, string Name, double CapacityLiters, double FullPercent, double TooFullPercent, DateTime? UpdatedAt)>(
                "SELECT Code, Name, CapacityLiters, FullPercent, TooFullPercent, UpdatedAt FROM dbo.SupTankConfig ORDER BY Code")).ToList();
            if (rows.Count != Db4Layout.Codes.Length) throw new InvalidOperationException("SupTankConfig deve contenere le 8 righe A-H");

            return rows.Select(r => new TankConfigDto
            {
                Code = r.Code,
                Name = r.Name,
                CapacityLiters = r.CapacityLiters,
                FullPercent = r.FullPercent,
                TooFullPercent = r.TooFullPercent,
                UpdatedAt = r.UpdatedAt.HasValue ? new DateTimeOffset(DateTime.SpecifyKind(r.UpdatedAt.Value, DateTimeKind.Utc)) : null,
            }).ToList();
        }

        public static List<string> Validate(List<TankConfigDto>? changes)
        {
            var errors = new List<string>();
            if (changes == null || changes.Count == 0) { errors.Add("Nessuna modifica ricevuta"); return errors; }
            foreach (var c in changes)
            {
                if (!IsValidCode(c.Code)) { errors.Add($"Serbatoio '{c.Code}' non valido"); continue; }
                if (string.IsNullOrWhiteSpace(c.Name) || c.Name.Trim().Length > 30) errors.Add($"{c.Code}: nome obbligatorio, massimo 30 caratteri");
                if (c.CapacityLiters < 100 || c.CapacityLiters > 100000) errors.Add($"{c.Code}: capacità tra 100 e 100.000 l");
                if (!(c.FullPercent > 0 && c.FullPercent < c.TooFullPercent && c.TooFullPercent <= 100))
                    errors.Add($"{c.Code}: deve valere 0 < pieno < troppo pieno ≤ 100");
            }
            return errors;
        }

        public async Task<List<TankConfigDto>> SaveTankConfigAsync(List<TankConfigDto> changes)
        {
            using (var cn = new SqlConnection(_connectionString))
            {
                await cn.OpenAsync();
                using var tx = cn.BeginTransaction();
                foreach (var c in changes)
                {
                    await cn.ExecuteAsync(@"
                        UPDATE dbo.SupTankConfig
                        SET Name = @Name, CapacityLiters = @CapacityLiters, FullPercent = @FullPercent,
                            TooFullPercent = @TooFullPercent, UpdatedAt = SYSUTCDATETIME()
                        WHERE Code = @Code",
                        new { c.Code, Name = c.Name.Trim(), c.CapacityLiters, c.FullPercent, c.TooFullPercent }, tx);
                }
                tx.Commit();
            }
            _logger.LogInformation("Configurazione serbatoi aggiornata: {Codes}", string.Join(",", changes.Select(c => c.Code)));
            return await GetTankConfigAsync();
        }
    }
}
```

Il `TanksController` di §7.7 usa `ServiceBackend.Tanks.TankDal` (aggiungere `using ServiceBackend.Tanks;`).

### 7.9 Registrazione in `Program.cs` e `appsettings.json`

Pacchetto NuGet: `S7netplus`, già presente nel progetto.

```csharp
using ServiceBackend.Tanks;

builder.Services.Configure<TankPlcOptions>(builder.Configuration.GetSection("TankPlc"));
builder.Services.AddSingleton<TankLiveState>();
builder.Services.AddSingleton<TankEventStore>();
builder.Services.AddHostedService<TankMonitorService>();
builder.Services.AddScoped<TankDal>();
```

```json
"TankPlc": {
  "Ip": "10.229.48.92",
  "Rack": 0,
  "Slot": 1,
  "DbNumber": 4,
  "PollIntervalMs": 1000,
  "ReconnectDelayMs": 5000,
  "TimeoutMs": 2000,
  "HeartbeatTimeoutSec": 20
},
"Tanks": {
  "SourceTimeZone": "W. Europe Standard Time"
}
```

- `HeartbeatTimeoutSec` deve coincidere con `heartbeatTimeoutSec` del `config.json` del frontend (20).
  Il PLC incrementa l'heartbeat **ogni 5 s**: 20 s = 4 incrementi mancati prima di segnalare
  "Com. persa". Se il periodo del PLC cambia, tenere il timeout ad almeno 3 volte il periodo.
- `SourceTimeZone`: fuso di `DataOra` in `LivelliSerbatoi` (nome Windows; su Linux `Europe/Rome`).

### 7.10 IIS: applicazione sempre attiva

Il servizio di lettura vive dentro l'applicazione. Con le impostazioni predefinite di IIS l'applicazione
si ferma dopo 20 minuti senza richieste e **non registra più eventi** finché qualcuno non apre una pagina.

Nell'application pool del backend:

- **Modalità di avvio** (Start Mode): `AlwaysRunning`;
- **Timeout di inattività** (Idle Time-out): `0`;
- **Riciclo** a orario fisso (es. di notte) invece che ogni 1740 minuti.

Nel sito: **Precaricamento abilitato** (Preload Enabled = True), con la funzionalità Windows
"Inizializzazione applicazioni" installata.

Una sola istanza del backend deve leggere il PLC: niente web garden (più processi nello stesso pool) né
più server con lo stesso backend. L'indice univoco su `SupTankEvent` evita comunque eventi doppi.

### 7.11 Indici e manutenzione di `LivelliSerbatoi`

```sql
-- Lo storico filtra per DataOra
CREATE NONCLUSTERED INDEX IX_LivelliSerbatoi_DataOra
    ON dbo.LivelliSerbatoi (DataOra);
```

Con una riga al minuto: 1.440 righe al giorno, circa 525.000 all'anno; una query su 30 giorni legge
circa 43.000 righe. Da decidere con chi gestisce il database la **conservazione** (es. 2 anni) e un job
SQL Agent che cancella le righe più vecchie. Se l'intervallo di scrittura cambia non serve modificare
il codice: lo storico raggruppa comunque in ~600 punti.

### 7.12 Implementazione nel ServiceBackend

File (namespace `ServiceBackend.Models.Tanks`, cartella `Models/Tanks/`):

| File | Contenuto |
|---|---|
| `TankOptions.cs` | `TankPlcOptions` (sezione `TankPlc`) e `TankOptions` (sezione `Tanks`) |
| `Db4Layout.cs` | decodifica dei 55 byte (`Parse`) e codifica inversa (`Encode`, usata dal PLC simulato) |
| `TankPlcReader.cs` | `ITankPlcReader`: `S7TankPlcReader` (S7netplus, già nel progetto) e `SimulatedTankPlcReader` |
| `TankLiveState.cs` | ultima lettura in memoria |
| `TankEventStore.cs` | `SupTankEvent` |
| `TankMonitorService.cs` | servizio in background: lettura ciclica ed eventi |
| `TankDal.cs` | stato, allarmi, trend, configurazione |
| `TankDtos.cs` | DTO e costanti `AlarmKinds` |
| `Controllers/TanksController.cs` | i 5 endpoint |
| `Database/SupTankConfig.sql`, `SupTankEvent.sql`, `LivelliSerbatoi.sql` | script (§7.4, §7.5, §7.11, §5.2) |

La cartella degli script si chiama `Database` e non `Sql` perché il `.gitignore` del progetto esclude
`sql`.

Differenze rispetto alla bozza:

- **PLC simulato** con `"TankPlc": { "Simulate": true }`, per lo sviluppo senza accesso al PLC:
  - livelli sinusoidali, con F che supera il 95 %;
  - E con misura non valida dal minuto 10 al 12 di ogni ora;
  - D con guasto sensore nei primi 5 minuti di ogni mezz'ora;
  - heartbeat fermo nel minuto 50 di ogni ora.
- **Il database non blocca la lettura del PLC:** se gli eventi aperti non si possono caricare,
  la lettura e lo stato funzionano lo stesso e il caricamento si riprova ogni 10 s.
- **Log:** errori del PLC e del database scritti solo al primo fallimento e al ripristino, non a ogni ciclo.
- **PLC mai letto dall'avvio:** `GetSystemStatus` risponde `statusCode` 503 con il messaggio, senza
  errore nel log.
- **Configurazione:** se `SupTankConfig` non è leggibile, stato e trend usano i valori predefiniti
  (riprova dopo un minuto). Se manca una riga, quel serbatoio ha i valori predefiniti; il salvataggio la inserisce.
- **Validazione:** errori con HTTP 200 e `statusCode` 400; periodo massimo 400 giorni; codici serbatoio
  ripetuti rifiutati.
- **`SupTankEvent.sql`** imposta `QUOTED_IDENTIFIER ON`: con `sqlcmd` l'indice filtrato altrimenti non si crea.

Prove fatte con il PLC simulato e il database di prova SQL Server LocalDB `SupTankTest`, con
`LivelliSerbatoi` di 30 giorni a una riga al minuto:
- stato;
- allarmi attivi e storico, con filtro sul serbatoio;
- trend 8 h, 24 h, 30 giorni (600 punti, conversione corretta dell'ora locale);
- salvataggio e validazione della configurazione;
- PLC irraggiungibile: `PLC_COMM` aperto, stato 503;
- ripristino: `PLC_COMM` e gli eventi rientrati chiusi alla prima lettura, nessun duplicato;
- frontend con `useMock: false`: sinottico, allarmi e dettaglio.

Non ancora provato:
- lettura S7 dal 1214C reale;
- database `dana_verniciatura` reale;
- `PLC_COMM` con PLC raggiungibile ma heartbeat fermo.

<!--
=== NON USATO: stato e allarmi letti dalla tabella LivelliSerbatoi, e ipotesi AVEVA Historian ===
Superato: lo stato si legge dal PLC e gli eventi li scrive il backend (§7.1). Tenuto come riferimento.

Query sulla tabella LivelliSerbatoi per stato e allarmi (superate dalla lettura del PLC):

**Stato attuale.** Ultima riga, più l'ora del server SQL (stesso orologio di `DataOra`, così l'età
dell'heartbeat non dipende dall'orologio del server web):

```sql
SELECT TOP (1) *, GETDATE() AS DbNow
FROM dbo.LivelliSerbatoi
ORDER BY Id DESC;
```

**Ora dell'ultimo cambio dell'heartbeat.** Prima riga dopo l'ultima con heartbeat diverso, cercando
nelle ultime `@lookbackRows` righe (se non cambia mai in quella finestra, risulta l'ora più vecchia
della finestra e il frontend mostra "Com. persa"):

```sql
SELECT MIN(DataOra)
FROM dbo.LivelliSerbatoi
WHERE Id <= @lastId
  AND Id > ISNULL((SELECT TOP (1) Id FROM dbo.LivelliSerbatoi
                   WHERE Id < @lastId AND Id >= @lastId - @lookbackRows
                     AND (HeartBeat <> @hb OR HeartBeat IS NULL)
                   ORDER BY Id DESC),
                  @lastId - @lookbackRows - 1);
```

Se System Platform smette di scrivere, l'ultima riga invecchia e l'heartbeat risulta fermo: il
frontend lo segnala come comunicazione persa.

**Storico di un serbatoio** (`{X}` = lettera validata; `@bucketSec` = durata periodo / 600, minimo 60):

```sql
SELECT DATEDIFF(second, @fromLocal, DataOra) / @bucketSec AS Bucket,
       AVG(CASE WHEN {X}_LevelValid = 1 THEN {X}_LevelPercent END) AS LevelPercent
FROM dbo.LivelliSerbatoi
WHERE DataOra >= @fromLocal AND DataOra < @toLocal
GROUP BY DATEDIFF(second, @fromLocal, DataOra) / @bucketSec;
```

Il backend crea poi un campione per ogni intervallo fino a "adesso": intervalli senza righe o con sola
misura non valida → valore null (il grafico mostra il buco invece di unire i punti).

**Eventi di allarme nel periodo.** Una riga per ogni cambio di stato, per serbatoio e tipo:

```sql
WITH s AS (
    SELECT t.Id, t.DataOra, v.Code, v.Kind, v.Active
    FROM dbo.LivelliSerbatoi t
    CROSS APPLY (VALUES
        ('A', 'TOO_FULL',      CASE WHEN t.A_TooFull = 1    THEN 1 ELSE 0 END),
        ('A', 'FULL',          CASE WHEN t.A_Full = 1       THEN 1 ELSE 0 END),
        ('A', 'LEVEL_INVALID', CASE WHEN t.A_LevelValid = 0 THEN 1 ELSE 0 END),
        -- ... B-H; con le colonne X_TooFullFault anche ('X', 'TOO_FULL_FAULT', ...)
        ('',  'PLC_NOT_READY', CASE WHEN t.PlcReady = 0     THEN 1 ELSE 0 END)   -- '' = non legato a un serbatoio
    ) v (Code, Kind, Active)
    WHERE t.DataOra >= @fromLocal AND t.DataOra < @toLocal
),
e AS (
    SELECT Code, Kind, DataOra, Active,
           LAG(Active, 1, 0) OVER (PARTITION BY Code, Kind ORDER BY Id) AS Prev
    FROM s
)
SELECT Code, Kind, DataOra, Active
FROM e
WHERE Active <> Prev
ORDER BY Code, Kind, DataOra;
```

Il backend accoppia i fronti: `Active = 1` → `raisedAt`, il successivo `Active = 0` → `clearedAt`,
nessun rientro → evento ancora attivo. Un evento già attivo all'inizio del periodo risulta iniziato
alla prima riga del periodo. La query si costruisce nel codice per i soli serbatoi richiesti (§7.7).

**Allarmi attivi** (`activeOnly=true`, chiamato ogni 5 s): non serve rileggere giorni di righe.
Dall'ultima riga si vede cosa è attivo; per ognuno si cerca da quando:

```sql
-- inizio dell'evento: prima riga dopo l'ultima in cui la condizione era falsa
SELECT MIN(DataOra)
FROM dbo.LivelliSerbatoi
WHERE Id <= @lastId
  AND Id > ISNULL((SELECT TOP (1) Id FROM dbo.LivelliSerbatoi
                   WHERE Id <= @lastId AND Id >= @lastId - @lookbackRows
                     AND ISNULL({X}_TooFull, 0) = 0          -- per LEVEL_INVALID: ISNULL({X}_LevelValid, 1) = 1
                   ORDER BY Id DESC),
                  @lastId - @lookbackRows - 1);
```

`PLC_NOT_READY` segue lo stesso schema sulla colonna `PlcReady` (attivo quando vale 0).
`PLC_COMM` attivo = heartbeat fermo oltre `HeartbeatTimeoutSec` (stesso calcolo dello stato). Nello storico
`PLC_COMM` non viene ricostruito: richiederebbe di cercare i buchi dell'heartbeat su tutto il periodo.


=== NON USATO: ipotesi AVEVA Historian (superata dalla tabella LivelliSerbatoi) ===

Se in futuro i dati venissero letti dall'Historian invece che dalla tabella, lo schema tipico è il
database Runtime con le viste Live e History; esempi indicativi, da verificare:

-- ultimo valore (Live): DateTime = ora dell'ultimo cambio per i tag a delta
SELECT TagName, Value, DateTime, QualityDetail
FROM Runtime.dbo.Live
WHERE TagName IN ('<tag A_LevelPercent>', '<tag A_LevelValid>', ...);

-- storico ricampionato: ~600 punti nell'intervallo
SELECT DateTime, Value, QualityDetail
FROM Runtime.dbo.History
WHERE TagName = '<tag A_LevelPercent>'
  AND DateTime >= @from AND DateTime <= @to
  AND wwRetrievalMode = 'Cyclic'
  AND wwResolution = @resolutionMs;   -- (to - from) / 600, minimo 60000

-- cambi di un bit (per ricostruire gli eventi)
SELECT DateTime, Value FROM Runtime.dbo.History
WHERE TagName = '<tag A_TooFull>' AND DateTime >= @from AND DateTime <= @to
  AND wwRetrievalMode = 'Delta';

Note: su alcune installazioni si passa da OPENQUERY(INSQL, '...'), che non accetta parametri;
verificare il fuso dei timestamp (wwTimeZone); nomi dei tag in configurazione, non nel codice.
I requisiti di storicizzazione (heartbeat e bit registrati a ogni cambio, deadband piccolo sul
livello) valgono anche per la frequenza di scrittura della tabella LivelliSerbatoi.
-->

## 8. Backend esistente: cosa sappiamo e cosa è stato proposto

Fatti (dal codice condiviso):

- .NET 6, hosting minimale (`Program.cs` con `WebApplication.CreateBuilder`), `ImplicitUsings` attivi.
- Stringa di connessione `DanaBackendEntities` (la `DanaBackendEntities_debug` usata in
  `GetDashboardData` era un refuso ed è stata tolta).
- Dapper e `Microsoft.Data.SqlClient` già in uso.
- Servizi singleton `AssaleService`, `AllarmeService`, `IPlcService`/`PlcService`, hosted service
  `BackgroundWorkerService`.
- CORS con elenco esplicito di origini (`_myAllowSpecificOrigins`); `http://localhost:4200` già presente.
- `Response` = `{ StatusCode, StatusMessage, ListItem }`; i controller restituiscono sempre HTTP 200.
- `DAL(ILogger<object>, IConfiguration, IPlcService = null)`; metodi statici `GetAll...Db` usati dai servizi.

Proposte fatte in chat (**da verificare quali sono state applicate**: una parte è stata annullata):

| File | Problema trovato | Proposta |
|---|---|---|
| `AxlesController`, `OEEController` | `SqlConnection` creata e mai usata né chiusa; `DAL` con `new`; attributo 204 mai restituito; in OEE namespace annidato due volte e `ILogger<AxlesController>` | rimozione connessione, `DAL` iniettato, try/catch con log, namespace unico, logger corretto |
| `Response` | `StatusCode` parte da 0 | default 200, `StatusMessage = ""` |
| `DAL` | quasi tutti i `catch` scartano l'errore: con DB giù gli allarmi risultano "nessuno" e gli obiettivi OEE "non trovati" (404) | log sempre; `GetObjectiveConfigAsync` rilancia; parametro opzionale `ILogger` nei metodi statici |
| `Program.cs` | con `ClearProviders()` + `AddConsole()` su IIS i log si perdono | `AddEventLog()`; registrazione `DAL` scoped con factory (`ILogger<DAL>`) |
| `DashboardDataHelper.GetDashboardDataAsync` | errore scartato → dashboard a zero con "Data found"; turno 3 calcolato male dopo mezzanotte | una sola connessione, eccezione propagata, giornata produttiva 06–06 |
| `Assale_DbHelper.GetHourlyPerformanceAsync` | turno di notte: ore future/passate invertite; target ore passate `minuti²/Cadence` | posizione nel turno calcolata dall'inizio turno, un solo ritmo `qtyTot / minuti effettivi` |

Queste modifiche sono **fuori dal perimetro serbatoi**: riguardano il backend OEE esistente.

## 9. Punti aperti

Da chiarire per il backend:

1. **Accesso S7 al PLC 10.229.48.92**: PUT/GET abilitato sul 1214C; porta TCP 102 raggiungibile dal
   server del backend (firewall / reti separate).
<<<<<<< HEAD
2. **Ogni quanto il PLC incrementa `Heartbeat`**: determina `HeartbeatTimeoutSec` (oggi 20 s).
3. **Application pool sempre attivo** su IIS, una sola istanza (§7.10).

Chiusi: libreria S7 = S7netplus, già usata dal `PlcService`; JSON in camelCase (verificato).
=======
2. **Application pool sempre attivo** su IIS, una sola istanza (§7.10).
3. **Casing del JSON** del backend (camelCase atteso).
>>>>>>> 257993bf5bbcf0750e5d7fcb98bbf387ca1eaf88

Già chiariti: tabella `LivelliSerbatoi` una riga al minuto (potrà variare); `DataOra` = ora locale del
server SQL; eventi di allarme scritti dal backend; libreria S7netplus (già nel progetto); `Heartbeat` incrementato
ogni 5 s (timeout 20 s = 4 incrementi mancati).

Da chiudere con il softwarista PLC (documento "Punti aperti PLC – Supervisione serbatoi",
https://claude.ai/code/artifact/9e2b08a4-2986-4d84-9e1e-e35eda396f5e):

- soglia reale di `X_Full` e quota del sensore troppo pieno per ogni serbatoio;
- scalatura di `X_LevelPercent`, volume morto, filtro; logica di `X_LevelValid` e `X_TooFullFault`;
- cosa attiva le sirene e come si tacitano; frequenza di `Heartbeat`; significato di `PLCReady` e `DataVersion`;
- proposta di estensione DB4 dall'offset 56.0: setpoint pieno/basso/minimo (Real, %), bit
  `X_LowWarn`/`X_LowStop`, tacitazione sirene per zona, `SupervisorHeartbeat`, isteresi, area pompe da 200.0;
- canale di scrittura verso il PLC (System Platform oppure OPC UA sul 1214C) e interblocchi del travaso nel PLC.

Altri:

- **Autenticazione** prima di qualsiasi scrittura sul PLC (Windows Authentication su IIS).
- **Prestazioni del trend comparato**: 8 serbatoi × 30 giorni = 8 richieste in parallelo; se lento,
  aggiungere un endpoint che restituisce più serbatoi insieme.
- **Rabbocco** del serbatoio A (presente nel vecchio supervisore, assente nel DB4).
- **Eventi persi a backend fermo**: durante un riavvio o un aggiornamento del backend gli eventi non
  vengono registrati; per ridurre il buco, aggiornamenti fuori dagli orari di riempimento.

## 10. Messa in produzione del frontend

1. `cd frontend && npm ci && npm run build` → file in `frontend/dist/supervisione-serbatoi/browser/`.
2. Copiare la cartella in un sito IIS. Se il sito non è alla radice, compilare con
   `npx ng build --base-href /percorso/`.
3. Le rotte (`/sinottico`, `/allarmi`, ...) sono gestite dal browser: IIS deve rimandare a `index.html`
   (serve il modulo **URL Rewrite**). `web.config` da mettere accanto a `index.html`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
  </system.webServer>
</configuration>
```

4. In `config.json` pubblicato: `"useMock": false`, `apiBaseUrl` del backend.
5. Aggiungere l'indirizzo del sito del frontend all'elenco CORS in `Program.cs`.

## 11. Checklist per chiudere il backend

- [ ] Abilitare PUT/GET sul PLC 10.229.48.92 e verificare la porta 102 dal server del backend (§7.2)
<<<<<<< HEAD
- [ ] Creare `SupTankConfig` (con i valori iniziali) e `SupTankEvent` su `dana_verniciatura`: script in `Database/` (§7.12)
- [ ] Creare l'indice su `DataOra` di `LivelliSerbatoi`; `HeartBeat` a `bigint` (`Database/LivelliSerbatoi.sql`, da concordare)
- [x] Aggiungere DTO, classi, `TanksController`, registrazione e sezioni `TankPlc`/`Tanks` in `appsettings.json` (§7.12)
=======
- [ ] Creare `SupTankConfig` (con i valori iniziali) e `SupTankEvent` (§7.4, §7.5)
- [ ] Creare l'indice su `DataOra` di `LivelliSerbatoi`; `HeartBeat` a `bigint` (§7.11, §5.2)
- [ ] Aggiungere DTO, classi `ServiceBackend.Tanks`, `TanksController`, registrazione e sezioni `TankPlc`/`Tanks` in `appsettings.json` (§7.6–7.9)
>>>>>>> 257993bf5bbcf0750e5d7fcb98bbf387ca1eaf88
- [ ] Application pool sempre attivo, una sola istanza (§7.10)
- [x] Verificare camelCase e date con fuso nelle risposte
- [x] Provare ogni endpoint, poi con il frontend (`useMock: false`), con PLC simulato e database di prova
- [ ] Ripetere la prova con il PLC e il database reali
- [ ] Controllare: valori del sinottico uguali a quelli in TIA Portal; "Com. persa" staccando il PLC; evento aperto e chiuso in `SupTankEvent` simulando un troppo pieno; trend 30 giorni; salvataggio configurazione
- [ ] Pubblicare frontend su IIS con `web.config` e CORS (§10)
