# Supervisione livelli serbatoi — Guida all'uso

Per chi consulta la supervisione dalla rete aziendale. Non serve nessuna installazione: si apre
con il browser all'indirizzo comunicato dall'ufficio tecnico.

---

## 1. A cosa serve

La supervisione mostra in tempo reale il livello dell'olio negli otto serbatoi esterni **A–H**,
raggruppati per zona sirena:

| Zona | Serbatoi | Uso |
|---|---|---|
| A-B | A, B | Produzione |
| C-D | C, D | |
| E-F | E, F | |
| G-H | G, H | Stoccaggio |

Mostra inoltre:

- lo stato di ogni serbatoio: pieno, troppo pieno, guasto del sensore, misura non valida;
- quali sirene sono attive;
- gli allarmi in corso e quelli passati;
- l'andamento dei livelli nel tempo, con esportazione in Excel (CSV).

**Cosa non fa.** La supervisione **guarda e non comanda**: non tacita le sirene, non avvia pompe,
non modifica nulla nel quadro. Le sirene le gestisce e le tacita il PLC dei serbatoi. Anche gli
allarmi non si "riconoscono" dalla pagina: restano in elenco finché la condizione non rientra.

**Da dove vengono i dati.** I valori arrivano dal PLC dei serbatoi e si aggiornano ogni 5 secondi.
Pieno e troppo pieno li decide il PLC: la supervisione li riporta, non li calcola.

---

## 2. La barra in alto

È sempre visibile, in tutte le pagine.

| Voce | Cosa indica |
|---|---|
| **PLC** | **OK** = il PLC risponde.<br>**Non pronto** = il PLC è raggiungibile ma segnala di non essere operativo.<br>**Com. persa** = il PLC non dà segni di vita da più di 20 secondi.<br>**Nessun dato** = la supervisione non riceve dati. |
| **Ultimo dato** | Quanti secondi fa è arrivato l'ultimo aggiornamento. Diventa giallo se supera i 30 secondi. |
| **Allarmi** | Numero di allarmi (rosso) o avvisi (giallo) in corso. Cliccando si apre la pagina Allarmi. |
| **Sirene** | **Spente**, oppure le zone con la sirena attiva (es. "AB · EF"), in rosso lampeggiante. |
| Orologio | Data e ora del PC. |

Se compare una **striscia gialla** "Backend non raggiungibile", il server della supervisione non
risponde. I valori sullo schermo sono gli ultimi ricevuti e **non sono aggiornati**: avvisare
l'ufficio tecnico.

---

## 3. Sinottico

È la pagina principale (menu **Sinottico**). Una riga per zona, con a destra lo stato della sirena
della zona. Per ogni serbatoio:

- **il disegno del serbatoio**, riempito in proporzione al livello, con due linee:
  - **Pieno**, arancio: la soglia di pieno;
  - **Max**, rossa: la quota del sensore di troppo pieno;
- **il livello in litri**, grande, e **la percentuale**;
- a destra:

| Campo | Significato |
|---|---|
| Capacità | Litri del serbatoio pieno al 100 % |
| Radar | **OK**, oppure **Non valida** se la misura del radar non è affidabile |
| Pieno | **Sì** / **No**, secondo la soglia impostata nel PLC |
| Sensore max | **OK**, **Intervenuto** (troppo pieno) oppure **Guasto** |
| Dato del | Ora dell'ultima lettura |

Cliccando su un serbatoio si apre il suo dettaglio.

### Colori

La pagina è volutamente grigia: **il colore compare solo quando c'è qualcosa da guardare**, e
c'è sempre anche una scritta che dice cosa succede.

| Come appare | Significato | Cosa fare |
|---|---|---|
| Grigio | Normale | — |
| Etichetta **arancio "Pieno"** | Il serbatoio ha raggiunto la soglia di pieno | Interrompere il riempimento |
| **Rosso lampeggiante "Troppo pieno"**, bordo rosso | È intervenuto il sensore di livello massimo | Intervenire subito: rischio di tracimazione |
| Giallo, "Guasto" | Anomalia del sensore di livello massimo | Il troppo pieno potrebbe non essere rilevato: segnalare alla manutenzione |
| Viola tratteggiato, livello "----" | Misura del radar non valida | Il livello non è affidabile: segnalare alla manutenzione |

---

## 4. Dettaglio di un serbatoio

Si apre cliccando un serbatoio nel sinottico.

- **Stato attuale**, a sinistra: tutti i valori del serbatoio, in litri e in percentuale, comprese
  le soglie di pieno e di troppo pieno.
- **Andamento livello**, a destra: grafico del livello in litri con le linee di soglia.
  - Periodo: **8 ore**, **24 ore**, **7 giorni**, **30 giorni** oppure **Intervallo** con date a scelta.
  - Sotto il grafico: livello minimo e massimo, livello a inizio e fine periodo, variazione.
  - Con la rotella del mouse o la barra sotto il grafico si ingrandisce un tratto.
  - Se il grafico ha un **buco**, in quel tratto la misura non era valida o mancano i dati.
- **Eventi nel periodo**: gli allarmi di quel serbatoio nel periodo scelto.
- **Esporta CSV** scarica i valori del grafico, apribili con Excel.

Lo storico ha **un valore al minuto**: anche i periodi lunghi si vedono in un grafico leggibile,
perché i valori vengono mediati.

## 5. Trend comparato

Menu **Trend**. Mette più serbatoi sullo stesso grafico, per esempio per confrontare lo
svuotamento di A e B con il riempimento da G e H.

- Si scelgono i serbatoi (oppure **Tutti** / **Nessuno**). Ogni serbatoio ha sempre lo stesso colore.
- Si sceglie l'unità, **litri** o **percentuale**, e il periodo.
- Sotto il grafico c'è una tabella riassuntiva per serbatoio: minimo, massimo, inizio e fine
  periodo, variazione.
- **Esporta CSV** scarica un file con una colonna per serbatoio.

---

## 6. Allarmi

Menu **Allarmi**. Il numero accanto alla voce è quello degli allarmi in corso.

### Tipi di evento

| Tipo | Gravità | Quando si attiva | Quando rientra |
|---|---|---|---|
| Troppo pieno | **Allarme** | Interviene il sensore di livello massimo | Il sensore torna a riposo |
| PLC non pronto | **Allarme** | Il PLC segnala di non essere operativo | Il PLC torna operativo |
| Comunicazione PLC | **Allarme** | Il PLC non dà segni di vita da più di 20 s | Il PLC torna a rispondere |
| Pieno | Avviso | Il serbatoio raggiunge la soglia di pieno | Il livello scende sotto la soglia |
| Guasto sensore max | Avviso | Il PLC rileva un'anomalia del sensore di massimo | L'anomalia scompare |
| Misura non valida | Avviso | La misura del radar non è affidabile | La misura torna valida |

"Pieno" è un avviso e non un allarme: succede a ogni riempimento normale.

### Le due viste

- **Attivi**: gli eventi in corso, prima gli allarmi e poi gli avvisi, con la durata che avanza.
  Si aggiorna da sola.
- **Storico**: tutti gli eventi in un periodo, dal più recente. Comprende anche quelli iniziati
  prima del periodo e ancora in corso al suo inizio.

In entrambe si può filtrare per **serbatoio** e per **tipo**, ed esportare in CSV.

Gli eventi li registra il server della supervisione con la precisione di un secondo. **Se il
server è spento** (per esempio durante un aggiornamento) gli eventi di quel periodo non vengono
registrati. Un evento rientrato in quel periodo risulta chiuso all'ora della ripartenza.

---

## 7. Configurazione

Menu **Configurazione**. Per ogni serbatoio:

| Campo | Uso |
|---|---|
| Nome | Come compare in tutte le pagine (es. "Produzione A"), massimo 30 caratteri |
| Capacità (l) | Serve a trasformare la percentuale del radar in litri |
| Soglia pieno (%) | Dove disegnare la linea "Pieno" |
| Troppo pieno (%) | Dove disegnare la linea "Max" (quota del sensore) |
| Ultima modifica | Quando la riga è stata salvata l'ultima volta |

- Le modifiche restano **in bozza** (campi evidenziati) finché non si preme **Salva**, che chiede
  conferma. **Annulla modifiche** torna ai valori salvati.
- **Applica a tutti** copia gli stessi valori su tutti i serbatoi.
- Uscendo dalla pagina con modifiche non salvate compare un avviso.
- Le modifiche valgono subito per tutte le postazioni.

**Attenzione.** Le percentuali di pieno e troppo pieno servono **solo a disegnare le linee**.
L'avviso "Pieno" lo decide il PLC con la soglia scritta nel suo programma, e il troppo pieno
dipende dall'altezza a cui è montato il sensore. Se si cambia la percentuale qui senza cambiarla
nel PLC, la linea non coincide più con l'avviso.

La voce **Travaso** nel menu è disattivata: è prevista per una fase successiva (trasferimento
dell'olio da G-H ad A-B).

---

## 8. Cosa fare se…

| Situazione | Probabile causa | Cosa fare |
|---|---|---|
| Striscia gialla "Backend non raggiungibile" | Il server della supervisione è spento o non raggiungibile | Avvisare l'ufficio tecnico. I valori a schermo non sono aggiornati. |
| PLC "Com. persa" | PLC spento, rete interrotta, oppure il PLC non aggiorna il segnale di vita | Verificare il quadro serbatoi; avvisare l'ufficio tecnico |
| PLC "Non pronto" | PLC in stop o programma non in esecuzione | Verificare il quadro; avvisare la manutenzione |
| Livello "----", Radar "Non valida" | Misura del radar non affidabile | Segnalare alla manutenzione; controllare il livello a vista |
| Sensore max "Guasto" | Anomalia del sensore di troppo pieno | Segnalare alla manutenzione: la protezione potrebbe non funzionare |
| Grafico con buchi | Misura non valida o dati non registrati in quel tratto | Normale se coincide con un'anomalia o un fermo |
| Sirena attiva | Il PLC ha rilevato una condizione di allarme nella zona | Controllare i serbatoi della zona; la sirena si tacita dal quadro |
