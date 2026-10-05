# Supervisione livelli serbatoi — riepilogo per completare il backend

Stato al 05/10/2026. Il **frontend è completo e gira con dati simulati**; il **backend non è ancora
scritto**. Questo documento contiene tutto quello che serve per scriverlo: architettura, contratto API,
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
   → AVEVA System Platform (raccolta + storicizzazione, "Factory Software")
      → database SQL dello storico
         → ServiceBackend ASP.NET Core (.NET 6) — nuovo TanksController, servizi REST
            → frontend Angular (questo repository, cartella frontend/)
```

Il backend **legge** dallo storico. Oggi non esiste un canale di **scrittura** verso il PLC: serve per
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
| `PLC_COMM` | Comunicazione PLC | Allarme |
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

type AlarmKind = 'TOO_FULL'|'TOO_FULL_FAULT'|'LEVEL_INVALID'|'LOW_WARNING'|'LOW_STOP'|'PLC_COMM';
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

## 5. DB_Gestionale (DB4) — mappatura

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

Tag da storicizzare in System Platform: 8 × 5 per serbatoio + `PLCReady`, `Heartbeat`, `DataVersion`
+ 4 sirene = **47 tag**. Requisiti sulla storicizzazione:

- `Heartbeat` va registrato **a ogni cambio** (niente deadband), altrimenti il frontend segnala
  comunicazione persa a torto.
- I bit vanno registrati a ogni cambio (servono anche per ricostruire gli eventi di allarme).
- `X_LevelPercent`: deadband piccolo (indicativamente 0,1 %), da concordare.

Nel DB4 **non ci sono**: valori di soglia, livello basso/minimo, comandi (tacitazione, travaso),
stato "Rabbocco" (presente nel vecchio supervisore per il serbatoio A).

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
| `GetSystemStatus` | ultimo valore dei 47 tag (tabella/vista "Live" dello storico) + configurazione SQL |
| `GetTankHistory` | storico del tag `X_LevelPercent` (e `X_LevelValid`) con ricampionamento ciclico |
| `GetAlarms` | **da decidere** (§9): allarmi di System Platform o eventi ricostruiti dai cambi dei bit |
| `GetTankConfig` / `SaveTankConfig` | nuova tabella SQL `SupTankConfig` |

**Blocco principale:** non conosciamo ancora com'è esposto lo storico in SQL (nomi delle tabelle o
viste, nomi dei tag, fuso orario dei timestamp). Se è **AVEVA Historian** (probabile), lo schema tipico
è il database `Runtime` con le viste `Live` e `History`; esempi indicativi, **da verificare**:

```sql
-- ultimo valore (Live): DateTime = ora dell'ultimo cambio per i tag a delta
SELECT TagName, Value, DateTime, QualityDetail
FROM Runtime.dbo.Live
WHERE TagName IN ('<tag A_LevelPercent>', '<tag A_LevelValid>', /* ... */);

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
```

Su alcune installazioni queste query passano da un linked server (`OPENQUERY(INSQL, '...')`), che non
accetta parametri: in quel caso la stringa va costruita con cura (solo valori controllati).
Verificare anche se i timestamp restituiti sono UTC o ora locale (opzione `wwTimeZone`).

Conviene mettere i **nomi dei tag in configurazione** (`appsettings.json`), non nel codice, ad esempio
`"Tanks": { "TagFormat": "<prefisso>.{0}_{1}" }` oppure l'elenco esplicito.

### 7.2 Ricostruzione degli eventi di allarme (se non si usano gli allarmi di System Platform)

1. Per ogni serbatoio e bit (`X_TooFull` → `TOO_FULL`, `X_TooFullFault` → `TOO_FULL_FAULT`,
   `X_LevelValid = 0` → `LEVEL_INVALID`) leggere i cambi nel periodo (modalità Delta), partendo dal
   valore all'inizio del periodo.
2. Fronte attivo → `raisedAt`; fronte di rientro → `clearedAt`; nessun rientro → `clearedAt = null`.
3. `PLC_COMM`: buchi dell'heartbeat oltre 20 s (più costoso; si può limitare agli eventi attivi).
4. `activeOnly=true`: basta il valore attuale dei bit (Live) e l'ora dell'ultimo cambio come `raisedAt`.
5. `id`: un valore stabile (es. hash di tipo + serbatoio + `raisedAt`) o un progressivo.
6. `message`: testo leggibile, es. "Serbatoio A livello massimo raggiunto".

### 7.3 Tabella di configurazione

```sql
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
        public string Kind { get; set; } = "";          // "TOO_FULL", "TOO_FULL_FAULT", ...
        public string? TankCode { get; set; }            // null per PLC_COMM
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

### 7.6 Registrazione in `Program.cs`

```csharp
builder.Services.AddScoped<TankDal>();   // dipende da IConfiguration, ILogger<TankDal>
```

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

Bloccanti per il backend:

1. **Struttura dello storico in SQL**: database, viste/tabelle, nomi dei tag, fuso dei timestamp,
   qualità del dato. Da chiedere a chi configura System Platform.
2. **Sorgente degli allarmi**: allarmi definiti in System Platform (database allarmi già con inizio,
   fine e ack) oppure eventi ricostruiti dal backend (§7.2).
3. **Casing del JSON** del backend (camelCase atteso).

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

- [ ] Ottenere struttura dello storico e nomi dei tag (§9.1)
- [ ] Decidere la sorgente degli allarmi (§9.2)
- [ ] Creare `SupTankConfig` con i valori iniziali (§7.3)
- [ ] Aggiungere DTO, `TankDal`, `TanksController`, registrazione in `Program.cs` (§7.4–7.6)
- [ ] Verificare camelCase e date con fuso nelle risposte
- [ ] Provare ogni endpoint da Swagger, poi con il frontend (`useMock: false`)
- [ ] Controllare: sinottico aggiornato ogni 5 s, "Com. persa" spegnendo il PLC, trend 30 giorni, salvataggio configurazione
- [ ] Pubblicare frontend su IIS con `web.config` e CORS (§10)
