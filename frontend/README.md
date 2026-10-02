# Supervisione livelli serbatoi — frontend

Angular 21 + PrimeNG 21 + ECharts 6. Interfaccia web per il monitoraggio dei serbatoi A–H
(dati PLC S7-1200 → System Platform → SQL → ServiceBackend → questo frontend).

## Requisiti

- Node.js `^20.19`, `^22.12` o `>=24` (Node 22.17 va bene)
- npm 10+

## Avvio

```bash
npm install
npm start          # http://localhost:4200
npm test           # unit test (Vitest)
npm run build      # output in dist/supervisione-serbatoi/browser
```

## Configurazione a runtime

`public/config.json` viene letto all'avvio e copiato così com'è nella build: su IIS si modifica
senza ricompilare.

| Chiave | Significato |
|---|---|
| `apiBaseUrl` | URL base delle API del ServiceBackend (es. `http://server:5000/api`) |
| `useMock` | `true` = dati simulati, nessuna chiamata al backend |
| `pollingIntervalMs` | intervallo di aggiornamento del sinottico |
| `staleDataAfterSec` | oltre questa età l'ultimo dato è segnalato come non aggiornato |
| `heartbeatTimeoutSec` | se l'heartbeat PLC non cambia entro questo tempo: "Com. persa" |

## Struttura

```
src/app/
  core/
    api/        contratto TankApi, implementazione HTTP e mock
    config/     caricamento config.json
    models/     DTO e logica di stato serbatoio
    state/      SystemStatusStore (polling del sinottico)
    time/       periodi predefiniti per trend e storico
  shared/       tank-gauge (serbatoio verticale), level-trend (grafico)
  features/     overview (sinottico), tank-detail, trends (comparato), alarms, placeholder
  layout/       shell con barra di stato e menu
```

## Scelte grafiche

Palette in stile HMI da sala controllo (ISA-101): grigi neutri per lo stato normale,
colore solo per le anomalie.

- giallo = livello basso o guasto sensore di massimo
- rosso = sotto il minimo o sensore di massimo intervenuto
- viola tratteggiato = misura radar non valida

Il colore è sempre accompagnato da un testo esplicito.

## Contratto API atteso dal backend

Controller `TanksController` (`api/Tanks/...`), stesso stile di `AxlesController`. Ogni risposta
è racchiusa nella classe `ServiceBackend.Model.Response`, serializzata in camelCase:

```json
{ "statusCode": 200, "statusMessage": "OK", "listItem": { ... } }
```

`core/api/backend-response.ts` estrae `listItem` e tratta come errore ogni `statusCode` fuori
da 200–299 (il controller risponde sempre HTTP 200, l'esito reale è nel corpo).

| Metodo | Parametri | `listItem` |
|---|---|---|
| `GET Tanks/GetSystemStatus` | — | `SystemStatus` |
| `GET Tanks/GetTankHistory` | `code`, `from`, `to` (ISO 8601 UTC) | `TankHistory` |
| `GET Tanks/GetAlarms` | `activeOnly`, `from?`, `to?`, `code?` | `AlarmEvent[]` |

I tipi sono definiti in `src/app/core/models/tank.models.ts`. Corrispondenza con DB_Gestionale (DB4):

| DB4 | Campo DTO |
|---|---|
| `PLCReady`, `Heartbeat`, `DataVersion` | `SystemStatus.plc` |
| `X_LevelPercent` | `TankStatus.levelPercent` (litri calcolati dal backend con la capacità) |
| `X_LevelValid` | `levelValid` |
| `X_Full` | `full` |
| `X_TooFull` | `tooFull` |
| `X_TooFullFault` | `tooFullFault` |
| `Horn_AB` … `Horn_GH` | `SystemStatus.horns` |

La capacità non è nel DB4: la fornisce il backend da configurazione (oggi 10.000 l per serbatoio).

Le soglie (`thresholds`) sono tutte facoltative (`null`). Il DB4 espone solo i bit
`X_Full`/`X_TooFull`/`X_TooFullFault`, non i valori: il colore del serbatoio dipende solo da questi bit
e dalla validità della misura. I valori di `fillLiters` (soglia di pieno del PLC) e `tooFullLiters`
(quota del sensore di troppo pieno) li fornisce il backend dalla propria configurazione e servono solo
a disegnare le linee. Linee, righe e allarmi di livello basso/minimo compaiono solo se il valore c'è.

**Attenzione:** le percentuali di pieno e troppo pieno in configurazione servono solo al disegno.
L'evento `X_Full` lo decide il PLC con la soglia scritta nel programma Step 7: se si cambia da una
parte va cambiata anche dall'altra, altrimenti la linea non corrisponde più all'evento.

## Trend comparato

Ogni serbatoio ha un colore fisso (`core/models/tank-colors.ts`), uguale in qualunque combinazione
di selezione. Palette categorica verificata per il daltonismo sulle coppie adiacenti. Le linee di soglia
sono grigie per non confondersi con i colori dei serbatoi, e compaiono solo se la soglia è uguale per
tutti i serbatoi selezionati. Il trend usa `GetTankHistory` una volta per serbatoio, in parallelo.
