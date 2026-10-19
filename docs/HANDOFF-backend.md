# Supervisione livelli serbatoi — riepilogo per completare il backend

Stato al 19/10/2026. Il **frontend è completo e gira con dati simulati**; il **backend non è ancora
scritto**. La sorgente dati è ora nota: la tabella SQL `dana_verniciatura.dbo.LivelliSerbatoi` (§5.2). Questo documento contiene tutto quello che serve per scriverlo: architettura, contratto API,
mappatura del DB PLC, decisioni prese, codice di partenza e punti aperti.

> Nessun codice C# di questo documento è stato compilato: il progetto ServiceBackend non era
> disponibile nella sessione in cui è stato scritto. Va trattato come bozza da verificare.

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
PLC S7-1200 (DB_Gestionale, DB4)
   → System Platform (raccolta dati, "Factory Software")
      → SQL Server, database dana_verniciatura, tabella dbo.LivelliSerbatoi (una riga per campionamento)
         → ServiceBackend ASP.NET Core (.NET 6) — nuovo TanksController, servizi REST
            → frontend Angular (questo repository, cartella frontend/)
```

Il backend **legge** dalla tabella `LivelliSerbatoi`. Oggi non esiste un canale di **scrittura** verso il PLC: serve per
soglie scritte dal supervisore, tacitazione sirene e travaso (vedi §9).

## 2. Repository

- GitHub: `teomobile/Supervisione_livelli_serbatoi`, branch `claude/plc-tank-supervision-system-pdae5j`
  (nessuna pull request aperta).
- `frontend/` — progetto Angular completo, con `frontend/README.md` (dettagli tecnici del frontend).
- `docs/HANDOFF-backend.md` — questo documento.
- Il backend (ServiceBackend) **non è** nel repository.

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
  "heartbeatTimeoutSec": 20
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

### 5.2 Tabella `dana_verniciatura.dbo.LivelliSerbatoi` (sorgente del backend)

System Platform scrive **una riga per campionamento** con tutti i valori del DB4 (tabella "larga").

| Colonna | Tipo | Origine DB4 | Campo DTO |
|---|---|---|---|
| `Id` | bigint identity, PK clustered | — | ordine delle righe |
| `DataOra` | datetime, default `getdate()` | — | `timestamp` (ora **locale** del server SQL, senza fuso) |
| `DataVersion` | int | `DataVersion` | `plc.dataVersion` |
| `PlcReady` | bit | `PLCReady` | `plc.plcReady` |
| `HeartBeat` | int | `Heartbeat` (UDInt) | `plc.heartbeat`, `plc.heartbeatChangedAt` |
| `X_LevelPercent` | float | `X_LevelPercent` | `levelPercent` (+ `levelLiters` calcolato) |
| `X_LevelValid` | bit | `X_LevelValid` | `levelValid` |
| `X_Full` | bit | `X_Full` | `full` |
| `X_TooFull` | bit | `X_TooFull` | `tooFull` |
| `Horn_AB`, `Horn_CD`, `Horn_Ef`, `Horn_GH` | bit | `Horn_*` | `horns[]` |

`X` = A…H. Tutte le colonne ammettono NULL.

Differenze rispetto al DB4 e conseguenze:

| Punto | Conseguenza | Proposta |
|---|---|---|
| **Manca `X_TooFullFault`** (8 colonne) | il backend manda sempre `tooFullFault = false`: "Sensore max" mostra OK anche con il sensore guasto; nessun evento `TOO_FULL_FAULT` | aggiungere le colonne (script sotto) e farle scrivere a System Platform |
| `DataOra` in ora locale, tipo `datetime` | conversione in UTC nel backend; l'ora doppia del cambio da ora legale a solare è ambigua | conversione con `TimeZoneInfo` (§7.7); in futuro `datetime2` in UTC o `datetimeoffset` |
| `HeartBeat` int, nel PLC UDInt | oltre 2.147.483.647 l'inserimento fallisce o il valore diventa negativo | portare a `bigint` |
| Nessun indice su `DataOra` | storico e allarmi su 30 giorni leggono tutta la tabella | indice su `DataOra` (§7.8) |
| Frequenza di scrittura **non nota** | determina volume della tabella e tempi delle query | da chiedere a chi configura System Platform |
| `Horn_Ef` scritto in minuscolo | nessun effetto in SQL; nel codice leggere le colonne senza distinzione maiuscole/minuscole | — |

```sql
-- Colonne mancanti rispetto al DB4 e heartbeat a 64 bit
ALTER TABLE dbo.LivelliSerbatoi ADD
    A_TooFullFault bit NULL, B_TooFullFault bit NULL, C_TooFullFault bit NULL, D_TooFullFault bit NULL,
    E_TooFullFault bit NULL, F_TooFullFault bit NULL, G_TooFullFault bit NULL, H_TooFullFault bit NULL;
ALTER TABLE dbo.LivelliSerbatoi ALTER COLUMN HeartBeat bigint NULL;
```

Il codice di §7.7 legge `X_TooFullFault` solo se la colonna esiste, quindi funziona prima e dopo lo script.

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

## 7. Backend da scrivere

### 7.1 Sorgenti dati

| Endpoint | Sorgente |
|---|---|
| `GetSystemStatus` | ultima riga di `LivelliSerbatoi` + configurazione `SupTankConfig` |
| `GetTankHistory` | righe di `LivelliSerbatoi` nel periodo, raggruppate in ~600 intervalli |
| `GetAlarms` | eventi **ricostruiti** dai cambi dei bit tra righe consecutive (nessuna tabella allarmi) |
| `GetTankConfig` / `SaveTankConfig` | nuova tabella `SupTankConfig` nello stesso database |

Regole comuni:

- Le righe si ordinano per `Id` (crescente con l'inserimento); i filtri di periodo usano `DataOra`.
- Il periodo `from`/`to` arriva dal frontend in UTC e va convertito nell'ora locale di `DataOra`
  prima della query; i `DataOra` letti vanno riconvertiti in UTC.
- Le colonne per serbatoio si compongono come `{X}_LevelPercent` solo dopo aver verificato che `X`
  sia una lettera A–H: è l'unico caso in cui si inserisce testo nella query.
- Misura non valida (`X_LevelValid = 0`) → `levelPercent`/`levelLiters` null.

### 7.2 Query

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
`PLC_COMM` attivo = heartbeat fermo da più di 20 s (stesso calcolo dello stato). Nello storico
`PLC_COMM` non viene ricostruito: richiederebbe di cercare i buchi dell'heartbeat su tutto il periodo.

<!--
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

### 7.3 Tabella di configurazione

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

### 7.4 DTO C# (bozza)

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

### 7.5 Controller (scheletro)

Stesso schema degli altri controller: risposta sempre in `Response`, errori nel log.
Presuppone il `DAL` registrato nel container (§8) con i nuovi metodi `TankDal...`, oppure una classe
`TankDal` separata (consigliato, per non gonfiare `DAL`).

```csharp
using Microsoft.AspNetCore.Mvc;
using ServiceBackend.Model;
using ServiceBackend.Model.Tanks;

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

### 7.6 Registrazione in `Program.cs` e `appsettings.json`

```csharp
builder.Services.AddScoped<TankDal>();   // dipende da IConfiguration, ILogger<TankDal>
```

```json
"Tanks": {
  "SourceTimeZone": "W. Europe Standard Time",
  "LookbackRows": 20000,
  "HeartbeatTimeoutSec": 20
}
```

- `SourceTimeZone`: fuso di `DataOra` (nome Windows; su Linux sarebbe `Europe/Rome`).
- `LookbackRows`: quante righe indietro cercare l'inizio di un evento o l'ultimo cambio
  dell'heartbeat. Va dimensionato sulla frequenza di scrittura: con una riga al secondo, 20.000 righe
  ≈ 5,5 ore. Un evento più lungo risulta iniziato all'inizio della finestra.
- `HeartbeatTimeoutSec`: deve coincidere con `heartbeatTimeoutSec` di `config.json` del frontend.

### 7.7 `TankDal` (bozza)

Accesso ai dati per il `TanksController`: legge `LivelliSerbatoi`, gestisce `SupTankConfig`,
converte gli orari. Usa Dapper come il resto del backend.

```csharp
using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using ServiceBackend.Model.Tanks;

namespace ServiceBackend.Model
{
    public class TankDal
    {
        public static readonly string[] Codes = { "A", "B", "C", "D", "E", "F", "G", "H" };

        private static readonly Dictionary<string, string> ZoneOf = new()
        {
            ["A"] = "AB", ["B"] = "AB", ["C"] = "CD", ["D"] = "CD",
            ["E"] = "EF", ["F"] = "EF", ["G"] = "GH", ["H"] = "GH",
        };

        private static readonly (string Zone, string Column)[] HornColumns =
        {
            ("AB", "Horn_AB"), ("CD", "Horn_CD"), ("EF", "Horn_Ef"), ("GH", "Horn_GH"),
        };

        private const int HistoryPoints = 600;

        private readonly string _connectionString;
        private readonly TimeZoneInfo _sourceZone;
        private readonly int _lookbackRows;
        private readonly int _heartbeatTimeoutSec;
        private readonly ILogger<TankDal> _logger;

        public TankDal(IConfiguration config, ILogger<TankDal> logger)
        {
            _connectionString = config.GetConnectionString("DanaBackendEntities")
                ?? throw new InvalidOperationException("Stringa di connessione 'DanaBackendEntities' mancante");
            _sourceZone = TimeZoneInfo.FindSystemTimeZoneById(config["Tanks:SourceTimeZone"] ?? "W. Europe Standard Time");
            _lookbackRows = config.GetValue("Tanks:LookbackRows", 20000);
            _heartbeatTimeoutSec = config.GetValue("Tanks:HeartbeatTimeoutSec", 20);
            _logger = logger;
        }

        public static bool IsValidCode(string? code) => code != null && Codes.Contains(code);

        // ---------- orari: DataOra è ora locale senza fuso ----------

        private DateTimeOffset ToUtc(DateTime local) =>
            new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), _sourceZone));

        private DateTime ToLocal(DateTimeOffset utc) =>
            TimeZoneInfo.ConvertTimeFromUtc(utc.UtcDateTime, _sourceZone);

        // ---------- lettura sicura dei valori (colonne NULL, nomi senza distinzione maiuscole) ----------

        private static Dictionary<string, object?> ToRow(object dapperRow) =>
            new(((IDictionary<string, object?>)dapperRow), StringComparer.OrdinalIgnoreCase);

        private static double? Dbl(Dictionary<string, object?> r, string col) =>
            r.TryGetValue(col, out var v) && v != null ? Convert.ToDouble(v) : null;

        private static bool Bit(Dictionary<string, object?> r, string col) =>
            r.TryGetValue(col, out var v) && v is bool b && b;

        // ---------- stato attuale ----------

        public async Task<SystemStatusDto> GetSystemStatusAsync()
        {
            using var cn = new SqlConnection(_connectionString);
            var snap = await ReadSnapshotAsync(cn);
            var config = (await ReadConfigAsync(cn)).ToDictionary(c => c.Code);

            var tanks = Codes.Select(code => BuildTank(code, snap.Row, config[code], snap.Timestamp)).ToList();

            return new SystemStatusDto
            {
                Plc = new PlcStatusDto
                {
                    PlcReady = Bit(snap.Row, "PlcReady"),
                    Heartbeat = (long)(Dbl(snap.Row, "HeartBeat") ?? 0),
                    HeartbeatChangedAt = snap.HeartbeatChangedAt,
                    DataVersion = (int)(Dbl(snap.Row, "DataVersion") ?? 0),
                },
                Tanks = tanks,
                Horns = HornColumns.Select(h => new ZoneHornDto { Zone = h.Zone, Active = Bit(snap.Row, h.Column) }).ToList(),
                ServerTime = snap.DbNow,
            };
        }

        private sealed record Snapshot(long LastId, Dictionary<string, object?> Row, DateTimeOffset Timestamp,
                                       DateTimeOffset DbNow, DateTimeOffset HeartbeatChangedAt);

        private async Task<Snapshot> ReadSnapshotAsync(SqlConnection cn)
        {
            var raw = await cn.QueryFirstOrDefaultAsync("SELECT TOP (1) *, GETDATE() AS DbNow FROM dbo.LivelliSerbatoi ORDER BY Id DESC");
            if (raw == null) throw new InvalidOperationException("La tabella LivelliSerbatoi è vuota");
            var row = ToRow(raw);

            long lastId = Convert.ToInt64(row["Id"]);
            var dbNow = ToUtc((DateTime)row["DbNow"]!);
            var timestamp = row["DataOra"] is DateTime dataOra ? ToUtc(dataOra) : dbNow;

            var changed = await cn.ExecuteScalarAsync<DateTime?>(@"
                SELECT MIN(DataOra) FROM dbo.LivelliSerbatoi
                WHERE Id <= @lastId
                  AND Id > ISNULL((SELECT TOP (1) Id FROM dbo.LivelliSerbatoi
                                   WHERE Id < @lastId AND Id >= @lastId - @lookback
                                     AND (HeartBeat <> @hb OR HeartBeat IS NULL)
                                   ORDER BY Id DESC), @lastId - @lookback - 1)",
                new { lastId, lookback = _lookbackRows, hb = Dbl(row, "HeartBeat") });

            return new Snapshot(lastId, row, timestamp, dbNow, changed.HasValue ? ToUtc(changed.Value) : timestamp);
        }

        private static TankStatusDto BuildTank(string code, Dictionary<string, object?> r, TankConfigDto cfg, DateTimeOffset ts)
        {
            bool valid = Bit(r, $"{code}_LevelValid");
            double? pct = valid ? Dbl(r, $"{code}_LevelPercent") : null;
            return new TankStatusDto
            {
                Code = code,
                Name = cfg.Name,
                Zone = ZoneOf[code],
                CapacityLiters = cfg.CapacityLiters,
                LevelPercent = pct.HasValue ? Math.Round(pct.Value, 1) : null,
                LevelLiters = pct.HasValue ? Math.Round(pct.Value * cfg.CapacityLiters / 100, 0) : null,
                LevelValid = valid,
                Full = Bit(r, $"{code}_Full"),
                TooFull = Bit(r, $"{code}_TooFull"),
                TooFullFault = Bit(r, $"{code}_TooFullFault"),   // false finché la colonna non esiste
                Thresholds = ThresholdsOf(cfg),
                Timestamp = ts,
            };
        }

        private static TankThresholdsDto ThresholdsOf(TankConfigDto c) => new()
        {
            FillLiters = c.CapacityLiters * c.FullPercent / 100,
            TooFullLiters = c.CapacityLiters * c.TooFullPercent / 100,
            LowWarningLiters = null,   // non presenti nel DB4
            LowStopLiters = null,
        };

        // ---------- storico ----------

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

            using var cn = new SqlConnection(_connectionString);
            var cfg = (await ReadConfigAsync(cn)).Single(c => c.Code == code);

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
            var samples = new List<LevelSampleDto>(buckets);
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

        // ---------- allarmi ----------

        /// <summary>
        /// Condizione di allarme: colonna "{X}_{Column}" (o "{Column}" se non legata a un serbatoio)
        /// attiva quando vale ActiveWhen.
        /// </summary>
        private sealed record Condition(string Kind, string Column, bool ActiveWhen, string Text)
        {
            public string Col(string? code) => code == null ? Column : $"{code}_{Column}";
            public string ActiveSql(string? code) => $"{Col(code)} = {(ActiveWhen ? 1 : 0)}";
            // NULL = dato mancante: non apre e non tiene aperto un evento.
            public string InactiveSql(string? code) => $"ISNULL({Col(code)}, {(ActiveWhen ? 0 : 1)}) = {(ActiveWhen ? 0 : 1)}";
            public bool IsActive(Dictionary<string, object?> r, string? code) =>
                r.TryGetValue(Col(code), out var v) && v is bool b && b == ActiveWhen;
        }

        private static readonly Condition[] Conditions =
        {
            new("TOO_FULL", "TooFull", true, "Serbatoio {1}: livello massimo raggiunto"),
            new("FULL", "Full", true, "Serbatoio {1}: pieno"),
            new("LEVEL_INVALID", "LevelValid", false, "Serbatoio {1}: misura radar non valida"),
            // Dopo l'ALTER TABLE di §5.2 aggiungere:
            // new("TOO_FULL_FAULT", "TooFullFault", true, "Serbatoio {1}: anomalia sensore di massimo livello"),
        };

        /// <summary>Condizioni non legate a un serbatoio (tankCode = null).</summary>
        private static readonly Condition[] PlcConditions =
        {
            new("PLC_NOT_READY", "PlcReady", false, "PLC non pronto"),
        };

        public async Task<List<AlarmEventDto>> GetAlarmsAsync(bool activeOnly, DateTimeOffset? from, DateTimeOffset? to, string? code)
        {
            var codes = code == null ? Codes : IsValidCode(code) ? new[] { code } : throw new ArgumentException("Serbatoio non valido", nameof(code));

            using var cn = new SqlConnection(_connectionString);
            var names = (await ReadConfigAsync(cn)).ToDictionary(c => c.Code, c => c.Name);

            return activeOnly
                ? await ActiveAlarmsAsync(cn, codes, names, includePlc: code == null)
                : await HistoryAlarmsAsync(cn, codes, names, from ?? DateTimeOffset.UtcNow.AddDays(-7), to ?? DateTimeOffset.UtcNow, includePlc: code == null);
        }

        private async Task<List<AlarmEventDto>> ActiveAlarmsAsync(SqlConnection cn, string[] codes, Dictionary<string, string> names, bool includePlc)
        {
            var snap = await ReadSnapshotAsync(cn);
            var result = new List<AlarmEventDto>();

            foreach (var c in codes)
            {
                foreach (var cond in Conditions)
                {
                    if (!cond.IsActive(snap.Row, c)) continue;

                    var start = await cn.ExecuteScalarAsync<DateTime?>($@"
                        SELECT MIN(DataOra) FROM dbo.LivelliSerbatoi
                        WHERE Id <= @lastId
                          AND Id > ISNULL((SELECT TOP (1) Id FROM dbo.LivelliSerbatoi
                                           WHERE Id <= @lastId AND Id >= @lastId - @lookback
                                             AND {cond.InactiveSql(c)}
                                           ORDER BY Id DESC), @lastId - @lookback - 1)",
                        new { lastId = snap.LastId, lookback = _lookbackRows });

                    result.Add(NewEvent(cond.Kind, c, string.Format(cond.Text, c, names[c]), start.HasValue ? ToUtc(start.Value) : snap.Timestamp, null));
                }
            }

            if (includePlc)
            {
                foreach (var cond in PlcConditions.Where(c => c.IsActive(snap.Row, null)))
                {
                    var start = await cn.ExecuteScalarAsync<DateTime?>($@"
                        SELECT MIN(DataOra) FROM dbo.LivelliSerbatoi
                        WHERE Id <= @lastId
                          AND Id > ISNULL((SELECT TOP (1) Id FROM dbo.LivelliSerbatoi
                                           WHERE Id <= @lastId AND Id >= @lastId - @lookback
                                             AND {cond.InactiveSql(null)}
                                           ORDER BY Id DESC), @lastId - @lookback - 1)",
                        new { lastId = snap.LastId, lookback = _lookbackRows });
                    result.Add(NewEvent(cond.Kind, null, cond.Text, start.HasValue ? ToUtc(start.Value) : snap.Timestamp, null));
                }
            }

            if (includePlc && (snap.DbNow - snap.HeartbeatChangedAt).TotalSeconds > _heartbeatTimeoutSec)
            {
                result.Add(NewEvent("PLC_COMM", null, "Comunicazione PLC interrotta", snap.HeartbeatChangedAt, null));
            }
            return result;
        }

        private sealed class EdgeRow
        {
            public string Code { get; set; } = "";
            public string Kind { get; set; } = "";
            public DateTime DataOra { get; set; }
            public int Active { get; set; }
        }

        private async Task<List<AlarmEventDto>> HistoryAlarmsAsync(SqlConnection cn, string[] codes, Dictionary<string, string> names,
                                                                    DateTimeOffset from, DateTimeOffset to, bool includePlc)
        {
            // Una riga di VALUES per serbatoio e condizione; i codici sono lettere A-H validate.
            // Le condizioni del PLC usano il codice '' (diventa tankCode = null).
            var rowsSql = codes.SelectMany(c => Conditions.Select(cond =>
                    $"('{c}', '{cond.Kind}', CASE WHEN t.{cond.ActiveSql(c)} THEN 1 ELSE 0 END)"))
                .Concat(includePlc
                    ? PlcConditions.Select(cond => $"('', '{cond.Kind}', CASE WHEN t.{cond.ActiveSql(null)} THEN 1 ELSE 0 END)")
                    : Enumerable.Empty<string>());
            var values = string.Join(",\n", rowsSql);

            var edges = await cn.QueryAsync<EdgeRow>($@"
                WITH s AS (
                    SELECT t.Id, t.DataOra, v.Code, v.Kind, v.Active
                    FROM dbo.LivelliSerbatoi t
                    CROSS APPLY (VALUES {values}) v (Code, Kind, Active)
                    WHERE t.DataOra >= @fromLocal AND t.DataOra < @toLocal
                ),
                e AS (
                    SELECT Code, Kind, DataOra, Active,
                           LAG(Active, 1, 0) OVER (PARTITION BY Code, Kind ORDER BY Id) AS Prev
                    FROM s
                )
                SELECT Code, Kind, DataOra, Active FROM e WHERE Active <> Prev ORDER BY Code, Kind, DataOra",
                new { fromLocal = ToLocal(from), toLocal = ToLocal(to) }, commandTimeout: 120);

            var result = new List<AlarmEventDto>();
            foreach (var group in edges.GroupBy(e => (e.Code, e.Kind)))
            {
                string? tank = group.Key.Code == "" ? null : group.Key.Code;
                var text = Conditions.Concat(PlcConditions).First(c => c.Kind == group.Key.Kind).Text;
                string Message() => tank == null ? text : string.Format(text, tank, names[tank]);
                DateTimeOffset? raised = null;
                foreach (var edge in group)
                {
                    if (edge.Active == 1) { raised = ToUtc(edge.DataOra); continue; }
                    if (raised.HasValue)
                    {
                        result.Add(NewEvent(group.Key.Kind, tank, Message(), raised.Value, ToUtc(edge.DataOra)));
                        raised = null;
                    }
                }
                if (raised.HasValue)
                    result.Add(NewEvent(group.Key.Kind, tank, Message(), raised.Value, null));
            }
            return result.OrderByDescending(e => e.RaisedAt).ToList();
        }

        private static AlarmEventDto NewEvent(string kind, string? code, string message, DateTimeOffset raised, DateTimeOffset? cleared) => new()
        {
            // Id stabile tra una chiamata e l'altra: istante di inizio + serbatoio + tipo.
            Id = raised.ToUnixTimeSeconds() * 1000 + (code == null ? 900 : Array.IndexOf(Codes, code) * 10) + KindIndex(kind),
            Kind = kind,
            TankCode = code,
            Message = message,
            RaisedAt = raised,
            ClearedAt = cleared,
        };

        private static int KindIndex(string kind) => kind switch
        {
            "TOO_FULL" => 1, "FULL" => 2, "LEVEL_INVALID" => 3, "TOO_FULL_FAULT" => 4,
            "PLC_NOT_READY" => 5, "PLC_COMM" => 6, _ => 9,
        };

        // ---------- configurazione ----------

        public async Task<List<TankConfigDto>> GetTankConfigAsync()
        {
            using var cn = new SqlConnection(_connectionString);
            return await ReadConfigAsync(cn);
        }

        private async Task<List<TankConfigDto>> ReadConfigAsync(SqlConnection cn)
        {
            var rows = (await cn.QueryAsync<(string Code, string Name, double CapacityLiters, double FullPercent, double TooFullPercent, DateTime? UpdatedAt)>(
                "SELECT Code, Name, CapacityLiters, FullPercent, TooFullPercent, UpdatedAt FROM dbo.SupTankConfig ORDER BY Code")).ToList();
            if (rows.Count != Codes.Length) throw new InvalidOperationException("SupTankConfig deve contenere le 8 righe A-H");

            return rows.Select(r => new TankConfigDto
            {
                Code = r.Code,
                Name = r.Name,
                CapacityLiters = r.CapacityLiters,
                FullPercent = r.FullPercent,
                TooFullPercent = r.TooFullPercent,
                // UpdatedAt è salvato in UTC (SYSUTCDATETIME)
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
            using var cn = new SqlConnection(_connectionString);
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
            _logger.LogInformation("Configurazione serbatoi aggiornata: {Codes}", string.Join(",", changes.Select(c => c.Code)));
            return await ReadConfigAsync(cn);
        }
    }
}
```

Note sulla bozza:

- `GetSystemStatus` e `GetAlarms?activeOnly=true` sono chiamati ogni 5 s **da ogni browser aperto**.
  Con più postazioni conviene una cache di 2–3 s (`IMemoryCache`) sul risultato.
- Un valore NULL non apre né tiene aperto un evento (`IsActive`, `InactiveSql`): conta come dato mancante.
- `FULL` è uno stato normale per i serbatoi di stoccaggio: se G e H restano pieni, l'avviso resta
  attivo a lungo e il contatore in barra resta giallo. Da valutare con gli operatori se tenerlo tra gli avvisi.
- `ToUtc` su un'ora del cambio ora legale → solare (02:00–03:00 dell'ultima domenica di ottobre) sceglie
  l'ora solare: per un'ora all'anno gli eventi possono risultare spostati di 60 minuti.

### 7.8 Indici e manutenzione della tabella

```sql
-- Storico e allarmi filtrano per DataOra
CREATE NONCLUSTERED INDEX IX_LivelliSerbatoi_DataOra
    ON dbo.LivelliSerbatoi (DataOra);
```

Volume indicativo: con una riga al secondo, 86.400 righe al giorno e circa 31,5 milioni all'anno.
Da decidere con chi gestisce il database:

- **frequenza di scrittura** di System Platform (determina tutto il resto);
- **conservazione** (es. 2 anni) e un job SQL Agent che cancella le righe più vecchie a blocchi;
- se lo storico a 30 giorni risulta lento: tabella di medie al minuto riempita da un job, letta dal
  backend per i periodi lunghi.

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

Da chiarire per il backend (tabella `LivelliSerbatoi`):

1. **Frequenza di scrittura** delle righe: dimensiona `LookbackRows`, indice e conservazione (§7.6, §7.8).
2. **Colonne `X_TooFullFault` mancanti**: aggiungerle e farle scrivere da System Platform (§5.2).
3. **Fuso di `DataOra`**: confermare che è l'ora locale del server SQL (default `getdate()`) e non
   un valore scritto da System Platform con un altro orologio.
4. **Casing del JSON** del backend (camelCase atteso).

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
- **Allarmi**: la tabella non ha eventi; il backend li ricostruisce dai cambi dei bit. Se in futuro
  gli allarmi venissero gestiti in System Platform, si potrà leggere il suo database allarmi.

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

- [ ] Chiedere la frequenza di scrittura di `LivelliSerbatoi` (§9)
- [ ] Eseguire `ALTER TABLE` per `X_TooFullFault` e `HeartBeat bigint` e farle popolare (§5.2)
- [ ] Creare l'indice su `DataOra` (§7.8) e la tabella `SupTankConfig` con i valori iniziali (§7.3)
- [ ] Aggiungere DTO, `TankDal`, `TanksController`, registrazione e sezione `Tanks` in `appsettings.json` (§7.4–7.7)
- [ ] Verificare camelCase e date con fuso nelle risposte
- [ ] Provare ogni endpoint da Swagger, poi con il frontend (`useMock: false`)
- [ ] Controllare: sinottico aggiornato ogni 5 s, "Com. persa" fermando la scrittura della tabella, trend 30 giorni, allarmi storici, salvataggio configurazione
- [ ] Pubblicare frontend su IIS con `web.config` e CORS (§10)
