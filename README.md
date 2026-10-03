# Invito per il diciottesimo compleanno di Kevin Tobia

Invito One Piece per il **28 novembre 2026 alle 20:00**, La Fornace, SP40,
64042 Colledara TE. Grafica, apertura della busta, accessibilità, musica e
metadati WhatsApp conservati. Backend Supabase, repository GitHub, hosting gratuito Cloudflare Pages.

- [Invito pubblico](https://invito-kevin-18.pages.dev/).
- [Pannello organizzatore](https://invito-kevin-18.pages.dev/admin.html).
- Il vecchio GitHub Pages serve soltanto `docs/index.html`, con il nuovo indirizzo.

## Come usa il pannello Kevin

1. Riceve manualmente il link privato di attivazione, apre il link e sceglie una password di almeno 12 caratteri.
2. Accede al pannello con la propria email e password.
3. Inserisce nome e cognome dell’invitato e seleziona **Crea link**.
4. Copia subito il link e lo invia personalmente all’invitato.
5. Può revocarlo o sostituirlo dall’elenco. Se perde un link, lo sostituisce: il database conserva soltanto il suo hash.

Non serve consegnare preventivamente una lista allo sviluppatore. Ogni invito
ammette una risposta definitiva. Il link autorizza chi lo possiede: inoltrarlo
permette ad altri di utilizzarlo. Sostituire il link non cancella una risposta
già ricevuta. Per correzioni si contatta Kevin; l’amministratore del progetto
può intervenire dal database privato. Il pannello gestisce inviti e non mostra allergie.

Solo lo specifico UUID Auth configurato sul server può usare le API del pannello.
Un account Supabase diverso non ottiene accesso, anche se riesce ad autenticarsi.
Sessioni e link restano in memoria: ricaricare il pannello richiede un nuovo login.
Nessuna registrazione pubblica è offerta dall’interfaccia.

Il link di attivazione è monouso, con scadenza gestita da Supabase. È in
`output/private/attivazione-kevin.txt`, escluso da Git e pubblicazione, con
permessi privati. Consegnarlo soltanto a Kevin. Non incollarlo in report o log.
Per rigenerarlo con una CLI Supabase già autenticata:

```sh
python3 scripts/provision_admin.py --email EMAIL_DI_KEVIN --supabase-cli /percorso/alla/cli/supabase
```

Il comando prepara il link senza inviare email e conserva l’UUID in
`output/private/backend.env`. Non sceglie né stampa la password.

## Protezioni RSVP

`POST https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp`:

| Campo | Contratto |
| --- | --- |
| `requestId` | UUID v4, invariato nei retry |
| `invitationToken` | Token casuale da 32 byte, base64url, dal frammento `/#invito=TOKEN` |
| `attending` | Booleano |
| `allergies` | Stringa facoltativa, massimo 1000 caratteri |
| `allergyConsent` | `true` obbligatorio quando si inviano allergie |
| `website` | Honeypot vuoto |
| `turnstileToken` | Challenge nuova a ogni tentativo |

Nome e cognome arrivano dall’invito nel database; campi omonimi nel payload
vengono rifiutati. RLS e privilegi negano ogni accesso pubblico a inviti,
risposte e contatori. Si salva SHA-256 del token, con risposta unica per invito.
Un retry con stesso invito, UUID e dati conferma l’inserimento già avvenuto.
Conflitti e retry consumano i 5 tentativi/minuto per invito; soltanto nuove
risposte consumano il limite globale di 60/minuto. I rifiuti non annullano i
contatori aggiornati. Il limite per invito resta valido dopo la sostituzione del link.

Turnstile viene verificato **prima** della procedura DB: successo, hostname
`invito-kevin-18.pages.dev` e azione `rsvp`. Challenge mancanti, scadute,
riutilizzate o non valide ricevono 403; indisponibilità del servizio riceve 503.
Il frontend conserva dati e UUID nei retry e richiede una challenge nuova.
Body massimo 8192 byte; chiusura server il **16 novembre 2026 alle 00:00 Europe/Rome**.

Successo esclusivamente HTTP 200 `{"ok":true}`; invito non valido/revocato 403
con messaggio generico, conflitto 409, chiusura 410, limite 429 con `Retry-After`.
L’origine consentita è soltanto `https://invito-kevin-18.pages.dev`. Una
configurazione CORS assente o malformata chiude il servizio con 503.
`verify_jwt=false` per RSVP è intenzionale: l’autorizzazione è il token personale.
Per `invitations`, l’handler verifica invece la sessione firmata con Supabase Auth e il suo UUID.
Nessuna credenziale privilegiata arriva al browser.

Senza link personale il sito è visibile, ma invio e campi sono disabilitati.
Il sito non usa `localStorage` o `sessionStorage` per dati personali.
Immagini, font e musica sono locali. CSP via header vieta script inline/eval,
blocca l’incorporamento dell’invito e consente gli iframe Turnstile. Presenti
`X-Frame-Options: DENY`, `nosniff` e `Referrer-Policy: no-referrer`.

## Anteprima, file e distribuzione

```sh
python3 serve.py
```

Aprire [l’anteprima](http://127.0.0.1:8000). Il server serve pagina, pannello e
asset con gli header di sicurezza; blocca backend, credenziali e documenti.
L’origine locale non può inviare al backend produzione.

- `index.html`, `admin.html`, `404.html`: pagine pubbliche.
- `assets/invitation.js`: comportamento e `EVENT_CONFIG`; `assets/admin.js`: pannello.
- `assets/invitation.css`, `assets/admin.css`: stili.
- `deployment.json`: soltanto origine, site key Turnstile, chiave **pubblica** Supabase ed endpoint.
- `_headers`: CSP e header Cloudflare Pages.
- `supabase/functions/`: backend; `supabase/migrations/`: schema e rimozione della vecchia RPC.
- `scripts/build_site.py`: pacchetto pubblico con elenco consentito di file.

La musica parte all’apertura: `We Did It! Party → To the Grand Line`, in loop.
Il controllo pausa/ripresa resta nella lettera. Metadati canonici, Open Graph e
Twitter vengono allineati all’origine nuova dalla build; l’immagine social è
`assets/images/og-invito-v1.jpg`. `assets/social-preview.html` resta solo sorgente
locale e non viene pubblicato. Per cambiare evento modificare `EVENT_CONFIG`,
metadati e immagine social; per cambiare scadenza anche handler e procedura SQL.

```sh
python3 scripts/build_site.py
npx --yes wrangler@4 pages deploy output/site --project-name invito-kevin-18 --branch main --commit-dirty=true
```

**Pubblicare solo `output/site`, mai la radice.** La build rifiuta campi extra,
chiavi Turnstile di test e symlink; esclude `.env`, report, test, backend e file
privati. GitHub Pages usa `main /docs`, contenente soltanto il rimando.

Backend, con CLI Supabase autenticata e progetto collegato:

```sh
supabase secrets set --env-file output/private/backend.env --project-ref dnpvzzrfdwbcecexuccm
supabase db push --linked --skip-vault
supabase functions deploy rsvp --no-verify-jwt --use-api
supabase functions deploy invitations --no-verify-jwt --use-api
```

Per una prima migrazione da un vecchio sito applicare prima la migrazione
aggiuntiva `20261003000100`, distribuire il backend protetto e il nuovo frontend,
attivare il rimando, infine applicare `20261003000200` che rimuove `submit_rsvp`.
Sul progetto corrente entrambe le migrazioni sono già applicate.

## Verifiche e gestione

```sh
node tests/rsvp.test.mjs
python3 tests/build.test.py
python3 tests/serve.test.py
supabase db query --linked --file tests/personal-rsvp-database.sql
```

I test SQL operano in transazione annullata, senza lasciare conferme. I test
Node verificano validazione, CORS, Turnstile, autorizzazione pannello e mapping
degli errori con servizi simulati. Test browser tramite Playwright CLI, con
anteprima già avviata:

```sh
npx --yes --package @playwright/cli playwright-cli -s=kevin open http://127.0.0.1:8000 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/invitation.browser.js
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/rsvp-deadline.browser.js
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/admin.browser.js
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/music.browser.js
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/music-layout.browser.js
npx --yes --package @playwright/cli playwright-cli -s=kevin run-code --filename tests/production.browser.js
```

Test browser RSVP e Auth simulano le risposte e le challenge; non salvano
conferme reali. Il test produzione legge il sito reale e verifica iframe/header.
Screenshot in `output/playwright`, escluso da Git. Prove e limiti nel
`security_best_practices_report.md`: distinguere servizi simulati, DB reale,
API reale e challenge umana da verificare prima della distribuzione agli invitati.

Consultare le metriche Edge Functions Supabase per i conteggi HTTP **403, 429,
503**, senza esportare payload, header Authorization o URL di attivazione.
Un aumento 403 può indicare challenge/link errati; 429 i limiti; 503 un guasto
di Auth, Turnstile o DB. Controllare lo stato del progetto Free prima della festa.
Le conferme e le allergie sono consultabili solo dal Table Editor privato da
persone autorizzate: concordare accessi e cancellazione dopo l’evento.
Turnstile e limiti riducono gli abusi; non eliminano gli attacchi alle invocazioni.

Un rollback conserva **token personali, Turnstile, RLS, limiti e origine esatta**.
Non ripristinare la vecchia RPC o il form pubblico. In emergenza revocare gli
inviti interessati o sospendere l’invio mantenendo la pagina visibile.

Riferimenti ufficiali: [Turnstile server-side](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[CSP Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/),
[header Pages](https://developers.cloudflare.com/pages/configuration/headers/),
[attivazione Supabase](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).
