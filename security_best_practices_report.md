# Analisi sicurezza dell’invito di Kevin

**Data:** 3 ottobre 2026. **Revisione locale:** `382ebae`.

## Sintesi

Individuati **2 rischi medi e 3 bassi**. Nessuna vulnerabilità critica o alta identificata nel perimetro verificato. Il rischio principale riguarda integrità e disponibilità delle conferme: il sistema non verifica l’identità degli invitati e un singolo client può consumare il limite condiviso degli invii.

Le risposte e le allergie non risultano pubblicamente leggibili: RLS, privilegi delle tabelle e accesso alla procedura SQL sono stati verificati sul database remoto. Nessun segreto amministrativo individuato dalla scansione mirata dei file tracciati e della storia Git. Questo audit non certifica l’assenza di altre vulnerabilità.

L’audit iniziale ha creato soltanto questo report. Le modifiche successive, autorizzate dall’utente, sono descritte nell’aggiornamento in fondo; i rilievi e le posizioni sopra si riferiscono alla revisione iniziale.

## Perimetro e metodo

- Frontend HTML/CSS e JavaScript nativo: `index.html`, asset e SVG locali.
- Backend JavaScript su Deno/Supabase Edge Functions: `handleRequest`, procedura PostgreSQL e configurazione della funzione.
- Server Python locale: `InvitationHandler`, esposizione file e percorsi.
- Sito GitHub Pages e endpoint Supabase pubblici: richieste limitate, senza carico artificiale.
- Dieci commit Git, 35 versioni distinte di file testuali per il controllo dei JWT privilegiati.

Applicate le indicazioni della skill `security-best-practices` per frontend JavaScript. La skill non contiene una guida specifica per Deno/Supabase o `http.server`; per il backend sono stati usati il codice reale, i metadati DB e la documentazione ufficiale Supabase.

## Gravità media

### 01 — Conferme falsificabili: nessuna verifica dell’invitato

**Regola:** autorizzazione delle operazioni; integrità dei dati RSVP.

**Posizioni:** [`supabase/config.toml`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/supabase/config.toml:417>), righe 417–420; [`handleRequest`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/supabase/functions/rsvp/index.js:14>), righe 14–15, 51–67 e 90–101; [`submit_rsvp`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/supabase/migrations/20261002000100_rsvp.sql:53>), righe 53–66 e 81–84.

**Prova:** `verify_jwt = false`; il controllo `request.headers.get('origin') !== allowedOrigin` verifica un header, non l’identità. Nomi e UUID sono scelti dal chiamante. La procedura deduplica solo lo stesso `request_id`, senza associare la risposta a un invito verificato.

Un test locale con DB simulato ha verificato: origine estranea → HTTP 403; stesso client con `Origin: https://angeloalbanesi.github.io` → HTTP 200; secondo UUID con lo stesso nome → un secondo inserimento richiesto al DB. La configurazione remota conferma funzione `rsvp` attiva, versione 3, `verify_jwt: false`. Una richiesta online con origine dichiarata corretta e JSON vuoto ha raggiunto la validazione, restituendo HTTP 400; non è stato effettuato un inserimento reale.

**Impatto:** chi conosce l’endpoint può inviare conferme inventate, duplicare nomi o attribuire allergie fittizie ad altri. Non è stato dimostrato accesso alle risposte già salvate, né possibilità di modificarle.

**Rimedio:** se serve una conferma per invitato, usare token individuali imprevedibili, verificati dal backend e associati a un identificativo dell’invito. Imporre nel DB l’unicità della risposta per invito. Evitare password condivise o token incorporati uguali per tutti nel frontend. CAPTCHA può ridurre automazione, ma non dimostra l’identità.

**Contesto:** endpoint anonimo e duplicati con UUID diversi sono già documentati in `README.md`, righe 144–148 e 176–180. È un rischio del modello pubblico, non una violazione di una protezione di login esistente. Se risposte non verificate sono accettabili, può essere accettato esplicitamente. Rendere obbligatorio un login non è l’unico rimedio. [Documentazione Supabase sulle funzioni pubbliche](https://supabase.com/docs/guides/functions/auth).

### 02 — Limite globale consumabile da un singolo client

**Regola:** prevenzione degli abusi e isolamento dei limiti.

**Posizioni:** [`submit_rsvp`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/supabase/migrations/20261002000100_rsvp.sql:69>), righe 69–84; [`handleRequest`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/supabase/functions/rsvp/index.js:90>), righe 90–108.

**Prova:** esiste un solo contatore, `where id = true`, con soglia `current_limit.submissions >= 60`. Nessun limite per invitato o client nel codice. La definizione della procedura è stata letta anche sul DB remoto e conferma questo comportamento.

**Impatto:** un client può occupare tutti i 60 nuovi invii della finestra; gli invitati ricevono HTTP 429. Ripetere l’abuso nelle finestre successive può prolungare il blocco e accumulare risposte false. Le richieste respinte arrivano comunque alla funzione e, se valide, alla procedura DB: il limite agli inserimenti non è un limite alle invocazioni.

**Rimedio:** mantenere il tetto globale come protezione aggiuntiva, introducendo limiti per invito verificato e, se necessario, per client prima dell’inserimento. Usare solo identificatori/IP ottenuti da una catena proxy affidabile, non header liberamente dichiarati. Valutare challenge anti-bot con verifica server. Non occorre introdurre Redis automaticamente: scegliere una soluzione proporzionata al traffico. [Esempio ufficiale Supabase di rate limiting](https://supabase.com/docs/guides/functions/examples/rate-limiting).

**Limiti della prova:** nessun flood eseguito in produzione; blocco e soglia dedotti dalla procedura remota e dai test esistenti. Il limite è atomico e funziona: il problema è la condivisione della stessa finestra, già riconosciuta in `README.md`, righe 171–174.

## Gravità bassa

### 03 — CSP assente sul sito pubblicato

**Regola:** difesa aggiuntiva contro esecuzione di script indesiderati.

**Posizioni:** [`index.html`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/index.html:3>), righe 3–31 e script inline alle righe 163–504; risposta HTTPS della pagina pubblica.

**Prova:** HTTP 200 senza header `Content-Security-Policy`; nessuna CSP nel markup. Pagina pubblica identica al file locale al momento del controllo. La pagina 404 di GitHub ha una propria CSP, che non protegge l’invito.

**Impatto:** manca una barriera contro un’eventuale futura injection. Non è stata individuata una catena XSS sfruttabile nel codice attuale; l’assenza della CSP non dimostra da sola una XSS.

**Rimedio:** su hosting statico, aggiungere una CSP tramite meta molto presto nel `head`, con allowlist stretta di asset e destinazione Supabase. Per lo script inline usare hash aggiornato a ogni modifica, oppure spostarlo in un file locale. Verificare anche stili dinamici, animazioni e media prima dell’attivazione. Non aggiungere `unsafe-eval` per aggirare problemi. Preferire header HTTP se l’hosting lo consente. [Guida CSP di MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

### 04 — Protezione contro embedding in iframe assente

**Regola:** prevenzione del clickjacking.

**Posizioni:** risposta HTTPS della pagina pubblica; [`modulo RSVP`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/index.html:128>), righe 128–152.

**Prova:** assenti `X-Frame-Options` e CSP con `frame-ancestors`. Nel frontend non è presente un controllo di framing.

**Impatto:** una pagina ostile può incorporare l’invito e tentare di ingannare l’utente tramite sovrapposizioni, anche durante consenso e compilazione. Non può leggere direttamente i campi attraverso il confine tra origini. Gravità contenuta: nessuna sessione autenticata o operazione amministrativa nel sito.

**Rimedio:** se l’embedding non serve, impostare via header `Content-Security-Policy: frame-ancestors 'none'`, eventualmente anche `X-Frame-Options: DENY`. Serve hosting/proxy che consenta gli header. `frame-ancestors` in un meta HTML viene ignorato; una CSP meta per il punto 03 non risolve questo punto. [Documentazione MDN di `frame-ancestors`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

**Limiti della prova:** assenza dei controlli verificata online; non è stato eseguito un attacco con interfaccia ingannevole.

### 05 — Origine consentita mancante → fallback permissivo

**Regola:** configurazione sicura in caso di errore.

**Posizione:** [`handleRequest`](</Users/angeloalbanesi/Coding Progetti/Invito 18-esimo Kevin/Invito_18-esimo_Kevin/supabase/functions/rsvp/index.js:4>), righe 4–15.

**Prova:** `Deno.env.get('RSVP_ALLOWED_ORIGIN') || '*'`. Un test locale, rimuovendo la variabile, ha ottenuto HTTP 200 per un’origine estranea e `Access-Control-Allow-Origin: *`.

**Impatto:** una distribuzione con variabile mancante o vuota abilita invii browser da qualunque sito. Non attribuire a CORS capacità di autenticazione: i client esterni ai browser possono già dichiarare l’origine attesa.

**Rimedio:** rifiutare le richieste quando la variabile richiesta non è configurata; verificare che contenga una sola origine HTTPS valida. Configurare separatamente l’anteprima locale.

**Stato attuale:** il backend pubblico restituisce HTTP 204 per l’origine autorizzata e HTTP 403 per un’origine estranea. Il fallback è un rischio latente verificato localmente, non un’apertura CORS attiva in produzione.

## Protezioni verificate

| Controllo | Esito |
| --- | --- |
| RLS remoto | Attivo su entrambe le tabelle RSVP |
| Privilegi pubblici DB | Zero grant SELECT/INSERT/UPDATE/DELETE per `anon` e `authenticated` sulle due tabelle |
| Procedura `submit_rsvp` | Eseguibile da `service_role`; negata a `anon` e `authenticated` |
| Policy pubbliche sulle tabelle | Nessuna |
| Lettura HTTP pubblica delle tabelle | HTTP 401, codice PostgreSQL `42501`; query senza righe (`limit=0`) |
| File `.env` pubblicato | HTTP 404; ignorato da Git |
| Segreti amministrativi tracciati | Nessun candidato ai pattern verificati; nessun JWT `service_role` nelle 35 versioni testuali esaminate |
| Test Node RSVP | Passati: validazione, consenso, scadenza server, CORS, gestione errori |
| Test Python server locale | Passati: asset disponibili, file privati e traversal bloccati |
| Dati in DOM | Messaggi e valori inseriti con `textContent`; nessun sink HTML per input non fidato individuato |
| Query SQL | Parametri RPC, nessuna concatenazione di SQL da input; `SECURITY DEFINER` con `search_path` vuoto e accesso ristretto |
| Allergie | Consenso obbligatorio lato server; dettagli scartati per chi risponde No; nessuno storage persistente nel browser nel codice esaminato |
| Limite body | 8192 byte letti con controllo incrementale lato backend |
| Risposte e segreti nei log | Nessun logging dei payload o delle chiavi nel codice applicativo esaminato |
| Script esterni | Nessuna dipendenza JavaScript remota runtime individuata |

## Limiti e ordine consigliato

1. Risolvere **01** se le conferme devono essere attribuibili agli invitati; coordinare token e unicità DB con **02**.
2. Ridurre abuso e blocco collettivo tramite **02**, anche se si mantiene il form pubblico.
3. Eliminare fallback **05**; aggiungere CSP **03**.
4. Gestire **04** quando si possono impostare header HTTP sull’hosting.

Non controllati: sicurezza dell’account GitHub/Supabase, MFA, sessioni del pannello, eventuali servizi fuori dal repository, backup ed esportazioni private. Non eseguiti test di carico, inserimenti reali, attacchi clickjacking o test browser XSS dedicati. La scansione segreti usa pattern mirati e non esclude ogni possibile credenziale. La prova della procedura SQL è remota; le riproduzioni con payload valido dell’handler sono locali con DB simulato. Non è stato scaricato il sorgente della Edge Function distribuita.

I dettagli personali della festa sono deliberatamente pubblicati nel sito e nelle anteprime social: non costituiscono una fuga dal DB RSVP. Il termine di conservazione delle allergie resta una scelta da definire e attuare; non è stata attribuita una violazione normativa sulla base del solo codice.


## Aggiornamento: implementazione delle correzioni — 3 ottobre 2026

I cinque rilievi iniziali sono affrontati nel codice e nella configurazione
Cloudflare/Supabase. La lista CSV è sostituita, su richiesta dell’utente, da un
pannello privato dove Kevin crea e gestisce autonomamente inviti nominali.

| Rilievo | Correzione |
| --- | --- |
| 01 | Inviti privati, token casuali da 32 byte, solo SHA-256 nel DB, nomi server, risposta unica per invito; API pannello riservata all’UUID Auth Kevin |
| 02 | Turnstile obbligatorio prima del DB; 5 tentativi/minuto per invito, contatori persistenti su conflitti e rifiuti; limite globale 60 nuove risposte/minuto |
| 03 | JavaScript locale esterno, CSP effettiva su Pages senza `unsafe-inline`/`unsafe-eval`; font, immagini e musica locali |
| 04 | `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, no-referrer; iframe Turnstile consentito |
| 05 | Origine HTTPS produzione obbligatoria, nessun fallback CORS wildcard nel backend; configurazione invalida → 503 |

**Sito:** [Cloudflare Pages](https://invito-kevin-18.pages.dev/).
**Pannello:** [accesso Kevin](https://invito-kevin-18.pages.dev/admin.html).
L’account è preparato; attivazione e scelta della password spettano a Kevin.
Il link privato è in `output/private`, non nel repository o pacchetto pubblico;
nessuna email è stata inviata. Sessioni, token e payload non vengono scritti dai
codici applicativi nei log o nello storage browser.

### Prove eseguite

- Test Node degli handler: input, consenso, dimensione body, origine assente/malformata, hash del token, scadenza, codici HTTP e Retry-After; Auth verificato e UUID amministratore obbligatorio. Servizi simulati.
- Test Turnstile dell’handler: scadenza/riuso (`timeout-or-duplicate`), hostname o azione sbagliati, indisponibilità e challenge assente; nessuna richiesta DB quando fallisce. Esiti positivi simulati.
- Entrambe le migrazioni applicate su Supabase; vecchia `submit_rsvp` rimossa. Test SQL reale in rollback: privilegi/RLS su inviti, risposte e contatori; nomi nominali, unicità, idempotenza, conflitti, revoca, sostituzione e limiti indipendenti. Nessun dato fittizio lasciato dalla transazione.
- Prova API reale: attivazione Auth Kevin, creazione, elenco, sostituzione e revoca di un solo invito fittizio. Token base64url di 43 caratteri e hash SHA-256 nel DB; elenco privo di hash, token e allergie.
- Cinque chiamate RPC concorrenti con lo stesso invito e UUID: tutte successo, una sola risposta; sesta chiamata limitata. Rotazione invalida il token precedente; risposta già registrata conservata.
- Chiave pubblica: 12 operazioni GET/POST/PATCH/DELETE su inviti, risposte e contatori tutte negate; filtri limitati a record fittizi o inesistenti. Tutti i record creati per le prove eliminati e link di attivazione rigenerato.
- Siteverify reale: challenge deliberatamente non valida → HTTP 403, nessun incremento del contatore DB. Preflight produzione 204; vecchia origine GitHub 403; pannello senza login 401; RSVP senza challenge 403.
- Chrome locale 320, 360, 390, 430, 768, 1024, 1440 px: layout, tastiera/focus, consenso, decline, retry con UUID/dati invariati e challenge nuova, nessuno storage personale, nessun errore JavaScript o violazione CSP; servizi RSVP/Turnstile simulati. Successo ammesso solo con HTTP 200 e `{"ok":true}`.
- Test scadenza browser a 320/1440 px: ultimo millisecondo ammesso; mezzanotte chiude pagina e modulo già aperti; server 410 prevale su orologio locale errato.
- Pannello browser 320/1440 px: login, creazione, revoca, sostituzione, logout e attivazione simulati; nomi interpretati come testo; sessioni/link non persistiti.
- Musica: prima `We Did It! Party`, poi `To the Grand Line`, ritorno al primo; pausa/ripresa e retry autoplay verificati. Pulsante nella lettera senza sovrapposizioni a 320/390/768/1440 px.
- Build e anteprima: file ammessi, segreti/report/backend esclusi, symlink e configurazioni insicure respinti, percorsi privati bloccati.
- Chrome produzione 320/1440 px: HTTP 200, header effettivi verificati, invio disabilitato senza link, nessun asset mancante, errore JavaScript o violazione CSP. Tentativo di incorporamento da altra pagina bloccato dal browser.
- Widget Turnstile reale caricato in attesa di esecuzione: frame da `challenges.cloudflare.com` presente, nessuna violazione CSP o errore console. Non è stata risolta una challenge umana.
- Verifica HTTPS: `.env`, `deployment.json`, report, backend, test e `output/private/attivazione-kevin.txt` restituiscono 404 sul nuovo sito. Canonical/OG/Twitter puntano al nuovo URL e alla sua immagine locale.

### Limiti e uso operativo

Prima di distribuire gli inviti, Kevin deve attivare l’account e provare una
conferma con challenge reale completata. Il flusso positivo della challenge è
verificato con simulazione, non come CAPTCHA umana end-to-end. Safari/iPhone
reale e anteprima dentro WhatsApp restano da provare.

Il link personale è una credenziale al portatore: può essere inoltrato. Il
pannello non mostra allergie né offre modifica delle risposte definitive;
eventuali correzioni richiedono gestione privata del DB tramite amministratore.
Monitorare conteggi 403/429/503 nelle metriche Supabase, evitando esportazioni
con payload o header sensibili. Le invocazioni possono comunque essere oggetto
di abuso: Turnstile e limiti non eliminano questo rischio.

Rollback autorizzato soltanto verso versioni che mantengono inviti personali,
Turnstile, RLS, limiti e origine esatta; non ripristinare la RPC legacy.


### Chiusura distribuzione

- Implementazione salvata su GitHub in `ff2c022`; build GitHub Pages completata con HTTPS e sorgente `main /docs`.
- Cloudflare Pages distribuito sul solo pacchetto `output/site`, con configurazione Turnstile di produzione sul hostname previsto. Backend RSVP e pannello distribuiti su Supabase, entrambe le migrazioni applicate.
- Stato DB finale verificato: **0 inviti, 0 risposte, RPC legacy assente**. L’account Kevin resta predisposto per l’attivazione privata; tutti gli inviti e le risposte di prova sono eliminati.
- File privati ignorati da Git; scansione dei candidati al commit senza chiavi privilegiate, JWT amministrativi o email privata dell’organizzatore.

### Destinatario visibile nella lettera — 3 ottobre 2026

- Lettera e modulo mostrano nome e cognome ricavati dal token personale, con avviso di chiedere a Kevin il link corretto se il nome non corrisponde. Invio disabilitato fino alla verifica; errore temporaneo recuperabile senza registrare risposte.
- Lettura `action=identify` limitata al singolo token valido e non revocato: soltanto nome/cognome, CORS invariato, risposta `no-store`, nessun accesso pubblico alla tabella. Turnstile resta obbligatorio per gli invii; la sola lettura non richiede challenge e non consuma tentativi RSVP.
- Test Node e Chrome: destinatario a 320/1440 px, attesa, errore/retry, revoca, nomi lunghi e caratteri HTML resi come testo; nessun dato nello storage. Regressioni RSVP a sette larghezze e chiusura iscrizioni superate con servizi simulati.
- Backend online verificato con invito temporaneo: nome corretto, token sconosciuto e revocato HTTP 403, contatore tentativi invariato. Invito di prova rimosso senza conferme.
- Backend e frontend pubblicati; HTML, JavaScript e CSS online coincidono con il pacchetto testato. CSP e blocco iframe confermati negli header HTTPS.
- Mostrare il nome permette al destinatario di riconoscere un link inviato per errore; resta una credenziale al portatore, senza verifica indipendente dell’identità di chi apre il link.

### Dashboard presenze e cancellazione — 3 ottobre 2026

- Pannello Kevin: totale delle adesioni positive, nome/cognome e data della conferma, aggiornamento manuale e paginazione da 100 righe. Allergie escluse dal contratto API.
- Azioni `accepted` e `delete` protette dalla verifica Supabase Auth e dallo specifico UUID dell’organizzatore; cache disabilitata. Nessun accesso pubblico a elenco o procedura di cancellazione.
- **Elimina persona** richiede conferma con il nome e avvisa dell’effetto definitivo: risposta e invito cancellati insieme, token precedente inutilizzabile. La procedura privata usa lo stesso blocco sul singolo invito della procedura RSVP; i retry della cancellazione sono idempotenti.
- Test Node: accesso negato senza sessione o con UUID diverso, filtro delle sole adesioni positive, campi senza allergie, validazione identificativi ed errore del servizio di cancellazione.
- Chrome 320/1440 px con Auth/API simulati: conteggio, lista vuota, annullamento/conferma cancellazione, 101 persone su due pagine, nomi resi come testo, logout senza dati residui, nessun errore JavaScript o CSP.
- SQL reale in transazione annullata: privilegi pubblici negati, cancellazione di entrambe le righe, retry e rifiuto RSVP del token eliminato. REST reale con due record temporanei: esclusione di chi rifiuta, conteggio e campi corretti, cancellazione effettiva. API online senza autenticazione HTTP 401. Tutti i record di prova rimossi.
- Migrazione aggiuntiva, backend e frontend distribuiti. HTML, JavaScript e CSS della dashboard online confrontati con i file verificati. Il login e le azioni dal browser di Kevin con la nuova dashboard non sono stati eseguiti durante questi test.
