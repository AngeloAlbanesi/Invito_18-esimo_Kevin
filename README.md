# Invito per il diciottesimo compleanno di Kevin Tobia

## Stato del progetto

Invito One Piece con busta di pergamena animata, sigillo della ciurma di
Cappello di Paglia, mare e nave illustrati, location, countdown e registro RSVP
collegato a Supabase. Palette carta, rosso e mare, con grafica SVG locale.
La festa è il **28 novembre 2026 alle 20:00**, presso La Fornace, SP40,
64042 Colledara TE. Il sito è online su
[GitHub Pages](https://angeloalbanesi.github.io/Invito_18-esimo_Kevin/).

## Anteprima locale

Nella cartella del progetto, con Python 3.7 o successivo:

```sh
python3 serve.py
```

Aprire [l’invito locale](http://127.0.0.1:8000). Per cambiare porta:
`python3 serve.py --port 8002`. Non servono npm, Docker o una build.
Il server ascolta solo sulla macchina locale e serve soltanto `index.html` e
gli asset pubblici; blocca `.env`, backend, directory e altri file del progetto.
Aprire direttamente il file con `file://` non è il flusso di anteprima verificato.

## File e personalizzazione

- `index.html`: struttura, dati dell’evento e JavaScript del sito.
- `assets/invitation.css`: stile, responsive e animazioni del redesign.
- `assets/`: illustrazioni SVG, favicon, font locale e relativa licenza.
- `serve.py`: anteprima locale protetta.
- `supabase/`: funzione RSVP e schema del database.
- `tests/`: verifiche del sito, del server e del backend.

Modificare `EVENT_CONFIG` nello script di `index.html` per cambiare i dati.
`time` è `20:00`; `startsAt` è `2026-11-28T20:00:00+01:00`, con l’offset
invernale corretto per Roma. Per un orario non ancora stabilito usare `null` per
entrambi: il sito mostra “Orario da definire” e non avvia il countdown.
Il contatore usa l’orologio del dispositivo, si ferma quando la scheda è nascosta
e arriva a zero all’inizio della festa. Non è impostata una scadenza RSVP.

Il pulsante Location apre Google Maps cercando il nome e l’indirizzo della
location; non è stato confermato un identificativo specifico della struttura.
Prima di condividere l’invito, controllare che il risultato sia quello desiderato.

L’apertura usa CSS e le API native del browser, senza GSAP o librerie esterne.
Una sola apertura genera al massimo 16 piccoli frammenti di carta, rimossi al
termine; la preferenza “riduci movimento” evita animazioni e frammenti. Se lo
sfondo non si carica, resta un gradiente mare/cielo e l’invito è utilizzabile. Senza JavaScript,
restano visibili i dettagli e la location, con un avviso per il form.
Il dialog gestisce tastiera, focus, Escape e ritorno al pulsante di conferma.

Le illustrazioni sono SVG originali creati nel progetto, senza acquisti né
hotlink. Immagini, CSS e font sono locali, circa 320 kB complessivi.
Provenienza, utilizzo e licenza del font conservato sono in
[`assets/README.md`](assets/README.md).

## Supabase

- Project ref: `dnpvzzrfdwbcecexuccm`.
- URL API: `https://dnpvzzrfdwbcecexuccm.supabase.co`.
- URL e chiave pubblica fornita sono salvati in `.env`, escluso da Git.
- `.env.example` contiene i nomi delle variabili senza credenziali.
- `supabase/config.toml` include la configurazione della funzione pubblica `rsvp`.
- Migrazione: `supabase/migrations/20261002000100_rsvp.sql`.
- Endpoint: `https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp`.

Il 2 ottobre 2026 sono stati verificati il login della CLI, il collegamento al
progetto attivo, il salvataggio tramite endpoint, i retry simultanei senza
duplicazioni e il rifiuto di richieste con dati non validi. Con la chiave pubblica
sono state provate e bloccate lettura, modifica, cancellazione e inserimento
diretto delle risposte; anche la chiamata diretta alla funzione SQL è bloccata.

## Collegare la CLI su un'altra macchina

Aprire un terminale nella cartella del progetto. Con Node.js 20 o successivo,
la CLI si può usare senza installarla globalmente:

```sh
npx --yes supabase@2.119.0 login
npx --yes supabase@2.119.0 link --project-ref dnpvzzrfdwbcecexuccm
```

Completare il login nel browser con il proprio account Supabase. Se il secondo
comando richiede la password del database, inserirla nel terminale.
`supabase init` è già stato eseguito e non serve ripeterlo.
Non è necessario avviare un database locale con Docker per collegare il progetto.

La chiave `sb_publishable_...` serve alle richieste pubbliche dell'applicazione.
Il login della CLI autorizza invece la gestione del progetto: la chiave pubblica
non sostituisce questo accesso. Password e chiavi amministrative devono restare
fuori dal frontend e dal repository.

La connection string fornita contiene il segnaposto `[YOUR-PASSWORD]`.
Per eventuali strumenti di amministrazione il segnaposto va sostituito con la
password del database, codificata correttamente come parte di un URL; non usare
questa stringa nel browser. Il nome host della connessione diretta non si è
risolto durante la verifica. Se il collegamento fallisce, verificare che il
progetto sia attivo nel pannello e copiare la connessione **Session pooler** dal
dialog **Connect**. Non acquistare l'add-on IPv4.

## Come consultare le conferme

Accedere con il proprio account al
[Table Editor del progetto](https://supabase.com/dashboard/project/dnpvzzrfdwbcecexuccm/editor)
e aprire `public.rsvp_responses`. Le risposte possono essere consultate ed
esportate dal pannello privato. `rsvp_rate_limit` contiene solo il contatore
tecnico degli invii. Non pubblicare esportazioni CSV nel repository.

## Form e contratto dell’endpoint

Inviare un `POST` con `Content-Type: application/json` e questi campi:

| Campo | Tipo e vincoli |
| --- | --- |
| `requestId` | UUID v4 generato con `crypto.randomUUID()` |
| `firstName` | Stringa obbligatoria, 1–80 caratteri dopo trim |
| `lastName` | Stringa obbligatoria, 1–80 caratteri dopo trim |
| `attending` | Booleano obbligatorio |
| `allergies` | Stringa facoltativa, massimo 1000 caratteri |
| `allergyConsent` | Deve essere `true` se si inviano dettagli sulle allergie |
| `website` | Honeypot facoltativo: deve restare vuoto |

Il form mostra successo soltanto dopo HTTP 200 con `{"ok":true}`. Conserva in memoria
lo stesso `requestId` e gli stessi dati durante un retry: il database conferma
l'invio già salvato senza creare un'altra riga. Cambiare i dati con lo stesso ID
restituisce HTTP 409. Due invii con ID diversi sono risposte distinte: il sistema
non identifica gli invitati dal nome e non offre ancora un flusso di correzione.
In caso di errore mantiene i campi e permette di riprovare. Dopo un timeout o un
errore transitorio blocca le modifiche ai campi e riprova lo stesso invio: una
risposta potrebbe essere già stata salvata anche senza conferma dal server.
Non conserva nomi o allergie nello storage del browser. Ricaricare la pagina
perde i dati non confermati. Dopo un invio riuscito non consente un secondo invio
nella stessa pagina.

Le allergie di chi risponde No non vengono salvate. Nel form il campo è
facoltativo e compare solo se richiesto; i dettagli servono a Kevin per
organizzare il menu e richiedono il consenso esplicito. Concordare chi accederà a questi dati e quando
eliminarli. Il codice non scrive i contenuti delle conferme nei log; non salvarli
in `localStorage` o in file pubblici.

La modalità predefinita è `rsvp.mode: 'backend'`, con l’endpoint già verificato.
La modalità facoltativa `'google-form'` apre il link configurato in
`googleFormUrl`; non viene attivata automaticamente in caso di guasto.
Senza endpoint configurato il dialog segnala l’anteprima e disabilita l’invio.

La tabella ha RLS abilitato e nessuna policy pubblica. Soltanto la funzione
serverless può chiamare la procedura SQL di inserimento con la chiave privilegiata
fornita dall'ambiente Supabase; nessuna chiave amministrativa è nel codice.

Il limite globale è di 60 nuove risposte al minuto, applicato atomicamente nel
database; non dipende da CORS o dal solo honeypot. È una protezione proporzionata
alla raccolta per una festa, non una difesa completa contro attacchi distribuiti:
un abuso può occupare la finestra e causare HTTP 429 anche a invitati legittimi.

Il backend pubblico usa `RSVP_ALLOWED_ORIGIN=https://angeloalbanesi.github.io`,
configurato su Supabase il 2 ottobre 2026. L'origine comprende protocollo e host,
senza il percorso del repository. Le altre origini ricevono HTTP 403: l'anteprima
locale resta utilizzabile, ma non invia conferme al backend pubblico.
CORS limita i browser, non autentica gli invitati.

## Verifiche e aggiornamenti

```sh
node tests/rsvp.test.mjs
python3 tests/serve.test.py
npx --yes supabase@2.119.0 db query --linked --file tests/rsvp-database.sql
```

Il controllo Node verifica handler, validazione, consenso, CORS e gestione degli
errori senza rete. Il controllo Python verifica quali percorsi il server può
servire. Il controllo SQL verifica privilegi, RLS, idempotenza, vincoli e limite
globale; la transazione viene annullata e non lascia risposte.

Il test browser `tests/invitation.browser.js` usa Playwright CLI. Con l’anteprima
già avviata e Chrome disponibile:

```sh
mkdir -p output/playwright
npx --yes --package @playwright/cli playwright-cli -s=kevin open http://127.0.0.1:8000 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/invitation.browser.js
```

### Verifiche del redesign One Piece — 2 ottobre 2026

Sono passate le verifiche in Chrome a 320, 360, 390, 430, 768, 1024 e 1440 px:
nessun overflow, busta interamente nel viewport, rotazione reale del lembo,
apertura da tastiera, click ripetuti con una sola apertura, sblocco dello scroll,
Location con destinazione corretta, dialog, focus ed Escape. Countdown,
movimento ridotto e funzionamento senza sfondo sono verificati.

Il flusso RSVP è stato verificato con risposte simulate: campi obbligatori,
nome composto soltanto da spazi, consenso allergie, caricamento, errore 503,
retry con gli stessi dati e ID, conferma positiva e negativa. Nessun dato
personale nello storage del browser. Nessun errore JavaScript o asset mancante
nel caricamento normale; i fallimenti di rete provocati dai test sono intenzionali.
Anche i test Node del backend e Python del server sono passati. Un controllo
aggiuntivo con touch emulato ha verificato due tap consecutivi, il popup
Location (navigazione intercettata per controllarne la destinazione), la vista
orizzontale 844 × 390 e il fallback senza JavaScript, senza errori console.

`EVENT_CONFIG` è identico alla versione precedente, compreso l’endpoint.
Il backend non è stato modificato o ridistribuito. Il preflight reale dell’endpoint
ha restituito HTTP 204 con CORS corretto; in questa verifica del redesign non è
stata creata una nuova risposta nel database. Le immagini SVG sono XML validi,
la sintassi JavaScript è verificata e non restano riferimenti agli asset precedenti.

Prima del redesign, nella stessa data, erano già stati verificati un invio reale
con salvataggio e successiva eliminazione del record fittizio e il caricamento
sotto un percorso di progetto Pages. Queste verifiche precedenti non vanno
confuse con gli invii simulati del nuovo tema.
I test mobili usano Chrome: Safari e un iPhone reale restano da provare.
Le anteprime sono in `output/playwright/`, escluso da Git.

Per applicare future migrazioni e distribuire modifiche alla funzione:

```sh
npx --yes supabase@2.119.0 db push --linked --skip-vault
npx --yes supabase@2.119.0 functions deploy rsvp --no-verify-jwt --use-api
```

Non sono stati attivati upgrade o add-on. Il
[piano Free](https://supabase.com/pricing) include 500 MB di database e 500.000
invocazioni Edge Functions; può sospendere i progetti dopo una settimana di
inattività. Prima di distribuire l'invito e prima della festa, controllare che il
progetto sia attivo; se sospeso, ripristinarlo dal pannello e provare il form.
Non generare traffico artificiale per evitarne la sospensione.

## Pubblicazione su GitHub Pages

### Anteprima dei link su WhatsApp

`index.html` contiene i metadati [Open Graph](https://ogp.me/) direttamente
nel `<head>`, disponibili anche senza JavaScript: titolo, descrizione in italiano,
URL della pagina e immagine JPEG da 1200 × 630 px. Sono presenti anche i metadati
Twitter Card. La card riprende pergamena, rosso e ciurma dell’invito e include
nome, età, data, ora e location.

Gli URL assoluti corrispondono al
[sito pubblico](https://angeloalbanesi.github.io/Invito_18-esimo_Kevin/),
ricavato dal repository `AngeloAlbanesi/Invito_18-esimo_Kevin`.
Se viene scelto un dominio o percorso diverso, aggiornare
`canonical`, `og:url`, `og:image` e `twitter:image` in `index.html`.

L’immagine è `assets/images/og-invito-v1.jpg`; il sorgente modificabile è
`assets/social-preview.html`. Quando cambiano i dati dell’evento, aggiornare
anche card e metadati, oltre a `EVENT_CONFIG`. Per rigenerare il JPEG,
con il server locale avviato e Chrome disponibile, dalla radice del progetto:

```sh
npx --yes --package @playwright/cli playwright-cli -s=kevin-og open http://127.0.0.1:8000/assets/social-preview.html --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=kevin-og run-code 'async page => {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode()));
    });
    await page.screenshot({ path: "assets/images/og-invito-v1.jpg", type: "jpeg", quality: 85 });
}'
```

Pagina e JPEG sono stati verificati pubblicamente via HTTPS il 2 ottobre 2026.
Incollare il link del sito in WhatsApp e controllare l’anteprima prima dell’invio:
il rendering effettivo dipende dall’app e dalle impostazioni del dispositivo e
resta da verificare direttamente in WhatsApp.

### Attivazione di Pages

GitHub Pages è attivo dal 2 ottobre 2026, con HTTPS obbligatorio e sorgente
**Deploy from a branch → main → / (root)**. `index.html` è il punto d’ingresso
e `.nojekyll` evita l’elaborazione Jekyll. Il frontend è statico: non servono
build, dipendenze o workflow personalizzati. `serve.py` serve soltanto per
l’anteprima; il backend pubblico resta la funzione Supabase.

Ogni push su `main` aggiorna automaticamente il sito. Lo stato della pubblicazione
è disponibile nelle [Actions del repository](https://github.com/AngeloAlbanesi/Invito_18-esimo_Kevin/actions)
e la sorgente nelle [impostazioni Pages](https://github.com/AngeloAlbanesi/Invito_18-esimo_Kevin/settings/pages).
`.env` è escluso da Git e il suo URL pubblico restituisce HTTP 404. Non caricare
chiavi amministrative, password o esportazioni delle conferme.

La pubblicazione iniziale è riuscita. Pagina e tutti gli asset pubblici coincidono
con i file locali; Chrome a 390 e 1440 px non presenta overflow, errori JavaScript
o asset mancanti. Apertura, Location, focus ed Escape del dialog sono verificati.
Il preflight RSVP restituisce HTTP 204 per il sito e HTTP 403 per un'altra origine.
Un invio fittizio dal form pubblico ha restituito HTTP 200 con `{"ok":true}`;
il record è stato verificato nel database, eliminato e la sua assenza confermata.
Sono passati anche i test Node del backend e Python del server locale.
Safari/iPhone e la card direttamente in WhatsApp restano da verificare.

Riferimento: [creare un sito GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Riferimenti: [CLI Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started),
[chiavi API](https://supabase.com/docs/guides/getting-started/api-keys),
[connessioni Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres).
