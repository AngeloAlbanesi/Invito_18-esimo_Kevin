# Asset dell’invito One Piece

## Provenienza e utilizzo

Gli SVG sono stati disegnati direttamente nel progetto il 2 ottobre 2026.
Sono interpretazioni grafiche per questo invito personale, non materiale ufficiale.
Le due immagini JPEG della ciurma in festa sono state scaricate il 2 ottobre 2026
e sono servite localmente, senza richieste a siti di immagini durante la visita.
Non sono stati acquistati asset.
One Piece e i suoi personaggi appartengono ai rispettivi titolari; i disegni
originali non attribuiscono diritti sul marchio o sui personaggi.

| Asset locale | Utilizzo |
| --- | --- |
| `images/crew-party-mobile.jpg` | Sfondo verticale su telefono, con cielo libero e ciurma in festa nella parte inferiore. |
| `images/Crew_upscale.jpeg` | Sfondo sopra 600 px e illustrazione sul foglio fino a 600 px. |
| `images/crew-party.jpg` | Illustrazione sul foglio aperto sopra 600 px. |
| `images/og-invito-v1.jpg` | Card Open Graph da 1200 × 630 px con titolo, invito, data, location e ciurma. |
| `social-preview.html` | Sorgente HTML/CSS della card, renderizzato in JPEG per la condivisione. |
| `images/ocean-scene.svg` | Sfondo SVG precedente, conservato nel progetto. |
| `images/crew-mark.svg` | Teschio con cappello di paglia e ossa incrociate; intestazione, sigillo e invito. |
| `images/nautical-map.svg` | Mappa con rotta tratteggiata, coste e bussola; busta, pergamena e registro RSVP. |
| `images/favicon.svg` | Cappello di paglia e numero 18 per la scheda del browser. |
| `invitation.css` | Carta, pieghe della busta, sigillo rosso, corde, frammenti di carta e interfaccia. |

Gli SVG hanno un `viewBox`, mantengono le proporzioni e restano nitidi anche su
schermi ad alta densità. Le quattro immagini pesano insieme meno di 12 kB.
Le decorazioni sono escluse dalla lettura assistita e non intercettano i tap.
Testi, dati della festa, pulsanti e campi sono HTML, non testo dentro le immagini
(la favicon e la card di condivisione contengono testo; la card ha anche metadati testuali in `index.html`).

Fonti delle immagini della ciurma:

- [Composizione verticale su Pinterest](https://www.pinterest.com/pin/343751384077872097/).
- [Illustrazione orizzontale su La Tercera](https://www.latercera.com/mouse/one-piece-luffy-muestra-su-nuevo-ataque-en-el-capitulo-1000-del-manga/).

Lo sfondo resta fissato alla finestra del browser: il foglio può scorrere senza
allungare o ingrandire ulteriormente l’immagine. L’illustrazione sul foglio mantiene
le proporzioni complete ed è decorativa; testo e pulsanti restano in HTML.

## Font

È conservato il font locale **Cormorant Garamond**, peso 500, per le brevi frasi
in corsivo. Il file già presente è distribuito con la licenza SIL Open Font
License in `fonts/LICENSE-cormorant-garamond.txt`.
Nome, numero e titoli usano Georgia; etichette e form usano Arial, entrambi con
fallback di sistema. Il sito non contatta servizi di font esterni.

Fonte del font conservato:
[Cormorant Garamond su Google Fonts](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond).
