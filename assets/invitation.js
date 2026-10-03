const EVENT_CONFIG = {
    name: 'Kevin Tobia',
    age: 18,
    date: '2026-11-28',
    time: '20:00',
    startsAt: '2026-11-28T20:00:00+01:00',
    timeZone: 'Europe/Rome',
    venueName: 'La Fornace',
    venueAddress: 'SP40, 64042 Colledara TE',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('La Fornace, SP40, 64042 Colledara TE'),
    rsvpDeadline: '2026-11-16T00:00:00+01:00',
    rsvp: {
        mode: 'backend',
        endpoint: PUBLIC_SITE_CONFIG.rsvpEndpoint,
        googleFormUrl: null,
    },
};

function calculateCountdown(startsAt, currentTime = Date.now()) {
    if (typeof startsAt !== 'string') return null;
    const timestampParts = startsAt.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/);
    if (!timestampParts) return null;
    const [year, month, day] = timestampParts.slice(1, 4).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
    const eventTimestamp = Date.parse(startsAt);
    if (!Number.isFinite(eventTimestamp)) return null;
    const remainingSeconds = Math.max(0, Math.ceil((eventTimestamp - currentTime) / 1000));
    return {
        days: Math.floor(remainingSeconds / 86400),
        hours: Math.floor(remainingSeconds / 3600) % 24,
        minutes: Math.floor(remainingSeconds / 60) % 60,
        seconds: remainingSeconds % 60,
        ended: remainingSeconds === 0,
    };
}

const openButton = document.getElementById('open-invitation');
const intro = document.querySelector('.intro');
const invitation = document.getElementById('invitation');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dialog = document.getElementById('rsvp-dialog');
const form = document.getElementById('rsvp-form');
const formFields = document.getElementById('rsvp-fields');
const submitButton = document.getElementById('rsvp-submit');
const formMessage = document.getElementById('form-message');
const rsvpButton = document.getElementById('rsvp-open');
let openingState = 'closed';
let countdownTimer = null;
let pendingSubmission = null;
let sending = false;
let saved = false;
let rsvpClosedByServer = false;
let invitationRejected = false;
const invitationToken = new URLSearchParams(location.hash.slice(1)).get('invito');
const hasInvitation = typeof invitationToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(invitationToken);
let turnstileWidget;
let turnstileLoading;

function loadTurnstile() {
    if (!turnstileLoading) {
        turnstileLoading = new Promise((resolve, reject) => {
            if (window.turnstile) return resolve();
            const script = document.createElement('script');
            const loadTimeout = setTimeout(() => {
                script.remove();
                reject(new Error('Verifica non disponibile. Riprova.'));
            }, 15000);
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.addEventListener('load', () => { clearTimeout(loadTimeout); resolve(); }, { once: true });
            script.addEventListener('error', () => {
                clearTimeout(loadTimeout);
                script.remove();
                reject(new Error('Verifica non disponibile. Riprova.'));
            }, { once: true });
            document.head.append(script);
        });
        turnstileLoading.catch(() => { turnstileLoading = null; });
    }
    return turnstileLoading;
}

async function completeChallenge() {
    await loadTurnstile();
    return new Promise((resolve, reject) => {
        let completed = false;
        const finish = (token, error) => {
            if (completed) return;
            completed = true;
            clearTimeout(challengeTimeout);
            if (error) reject(new Error('Verifica non completata. Riprova.'));
            else resolve(token);
        };
        const challengeTimeout = setTimeout(() => finish(null, true), 120000);
        if (turnstileWidget !== undefined) window.turnstile.remove(turnstileWidget);
        turnstileWidget = window.turnstile.render('#turnstile-widget', {
            sitekey: PUBLIC_SITE_CONFIG.turnstileSiteKey,
            action: 'rsvp', execution: 'execute', appearance: 'interaction-only', size: 'flexible',
            callback: (token) => finish(token, false),
            'error-callback': () => { finish(null, true); return true; },
            'expired-callback': () => finish(null, true),
            'timeout-callback': () => finish(null, true),
        });
        window.turnstile.execute(turnstileWidget);
    });
}

const dateLabel = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: EVENT_CONFIG.timeZone,
}).format(new Date(EVENT_CONFIG.date + 'T12:00:00+01:00'));
document.title = EVENT_CONFIG.name + ' · 18 anni · One Piece';
document.querySelectorAll('[data-event-name]').forEach((element) => { element.textContent = EVENT_CONFIG.name; });
document.querySelectorAll('[data-event-date]').forEach((element) => {
    element.textContent = dateLabel;
    if (element.tagName === 'TIME') element.dateTime = EVENT_CONFIG.date;
});
document.querySelector('[data-event-age]').textContent = EVENT_CONFIG.age;
document.getElementById('signature').textContent = EVENT_CONFIG.name.split(' ')[0];
document.querySelector('.envelope-letter').textContent = EVENT_CONFIG.age;
document.getElementById('event-time').textContent = EVENT_CONFIG.time ? 'Ore ' + EVENT_CONFIG.time : 'Orario da definire';
document.getElementById('venue-name').textContent = EVENT_CONFIG.venueName || 'Location da definire';
document.getElementById('venue-address').textContent = EVENT_CONFIG.venueAddress || '';
if (EVENT_CONFIG.mapsUrl) document.getElementById('location-link').href = EVENT_CONFIG.mapsUrl;
else document.getElementById('location-link').addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('venue-address').textContent = 'L’indirizzo sarà comunicato appena disponibile.';
});

document.body.dataset.state = 'closed';
intro.hidden = false;
invitation.inert = true;
const scene = document.getElementById('scenery');
const sceneReady = scene.decode().catch(() => { document.body.classList.add('scene-unavailable'); });
Promise.race([
    Promise.allSettled([sceneReady, document.fonts.ready]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
]).then(() => { document.body.classList.add('ready'); });

const backgroundMusic = document.getElementById('background-music');
const musicButton = document.getElementById('music-toggle');
const musicTracks = [
    './assets/sound/we-did-it-party-one-piece-ost-320k_FSQmelMw.mp3',
    './assets/sound/to-the-grand-line-one-piece-ost-320k_9UMmntTG.mp3',
];
let musicTrackIndex = 0;
backgroundMusic.volume = .3;
musicButton.hidden = false;

function updateMusicButton() {
    const playing = !backgroundMusic.paused && !backgroundMusic.error;
    musicButton.setAttribute('aria-pressed', String(playing));
    musicButton.textContent = playing ? 'Pausa musica' : 'Attiva musica';
}

function playBackgroundMusic() {
    backgroundMusic.play().catch(updateMusicButton);
}

backgroundMusic.addEventListener('play', updateMusicButton);
backgroundMusic.addEventListener('pause', updateMusicButton);
backgroundMusic.addEventListener('error', updateMusicButton);
backgroundMusic.addEventListener('ended', () => {
    musicTrackIndex = (musicTrackIndex + 1) % musicTracks.length;
    backgroundMusic.src = musicTracks[musicTrackIndex];
    playBackgroundMusic();
});
musicButton.addEventListener('click', () => {
    if (backgroundMusic.paused || backgroundMusic.error) playBackgroundMusic();
    else backgroundMusic.pause();
});

function releasePaperFragments() {
    if (reducedMotion.matches || document.hidden) return;
    const container = document.getElementById('paper-fragments');
    for (let fragmentIndex = 0; fragmentIndex < 16; fragmentIndex += 1) {
        const fragment = document.createElement('span');
        fragment.className = 'paper-fragment';
        fragment.style.left = Math.random() * 100 + '%';
        fragment.style.opacity = .4 + Math.random() * .5;
        container.append(fragment);
        const drift = Math.random() * 160 - 80;
        const rotation = Math.random() * 540 - 270;
        const animation = fragment.animate([
            { transform: 'translate(0, -20px) rotate(0deg) scale(.7)', opacity: 0 },
            { opacity: .8, offset: .15 },
            { transform: `translate(${drift}px, ${window.innerHeight + 80}px) rotate(${rotation}deg) scale(1)`, opacity: 0 },
        ], { duration: 2700 + Math.random() * 1800, delay: Math.random() * 500, easing: 'ease-in', fill: 'both' });
        animation.finished.then(() => fragment.remove(), () => fragment.remove());
    }
}

openButton.addEventListener('click', async () => {
    if (openingState !== 'closed') return;
    openingState = 'opening';
    playBackgroundMusic();
    openButton.disabled = true;
    document.body.dataset.state = 'opening';
    releasePaperFragments();
    await new Promise((resolve) => setTimeout(resolve, reducedMotion.matches ? 0 : 2400));
    openingState = 'opened';
    document.body.dataset.state = 'opened';
    intro.hidden = true;
    invitation.inert = false;
    document.getElementById('event-name').focus({ preventScroll: true });
});

function updateCountdown() {
    updateRsvpAvailability();
    clearInterval(countdownTimer);
    countdownTimer = null;
    const note = document.getElementById('countdown-note');
    const grid = document.getElementById('countdown-grid');
    const remaining = calculateCountdown(EVENT_CONFIG.startsAt);
    if (!remaining) {
        grid.hidden = true;
        note.hidden = false;
        note.textContent = EVENT_CONFIG.startsAt
            ? 'Il countdown sarà disponibile appena la data sarà confermata.'
            : 'Countdown disponibile appena sarà definito l’orario.';
        return;
    }
    grid.hidden = false;
    note.hidden = !remaining.ended;
    if (remaining.ended) note.textContent = 'Il grande giorno è arrivato!';
    for (const unit of ['days', 'hours', 'minutes', 'seconds']) {
        document.getElementById('countdown-' + unit).textContent = String(remaining[unit]).padStart(2, '0');
    }
    if (!remaining.ended && !document.hidden) countdownTimer = setInterval(updateCountdown, 1000);
}
updateCountdown();
document.addEventListener('visibilitychange', () => {
    updateCountdown();
    if (document.hidden) document.getElementById('paper-fragments').replaceChildren();
});

const backendReady = EVENT_CONFIG.rsvp.mode === 'backend'
    && Boolean(EVENT_CONFIG.rsvp.endpoint) && Boolean(PUBLIC_SITE_CONFIG.turnstileSiteKey) && hasInvitation;
submitButton.disabled = !backendReady || updateRsvpAvailability();
formFields.disabled = !backendReady || updateRsvpAvailability();
document.getElementById('preview-note').hidden = backendReady;
document.getElementById('preview-note').textContent = hasInvitation
    ? 'La raccolta delle conferme non è ancora configurata.'
    : 'Per confermare, apri il link personale ricevuto da Kevin. Se non lo hai, chiedilo a lui.';
function updateRsvpAvailability() {
    const closed = rsvpClosedByServer || Date.now() >= Date.parse(EVENT_CONFIG.rsvpDeadline);
    if (!closed) return false;
    const closedMessage = 'Le iscrizioni sono chiuse. Il termine era il 15 novembre 2026.';
    const deadlineNote = document.getElementById('rsvp-deadline');
    if (deadlineNote.textContent !== closedMessage) deadlineNote.textContent = closedMessage;
    rsvpButton.disabled = true;
    rsvpButton.querySelector('span:last-child').textContent = 'Iscrizioni chiuse';
    formFields.disabled = true;
    submitButton.disabled = true;
    if (!sending) submitButton.textContent = 'Iscrizioni chiuse';
    if (!saved) {
        if (formMessage.textContent !== closedMessage) formMessage.textContent = closedMessage;
        formMessage.hidden = false;
    }
    return true;
}
rsvpButton.addEventListener('click', () => {
    if (updateRsvpAvailability()) return;
    if (EVENT_CONFIG.rsvp.mode === 'google-form' && EVENT_CONFIG.rsvp.googleFormUrl) {
        window.open(EVENT_CONFIG.rsvp.googleFormUrl, '_blank', 'noopener,noreferrer');
        return;
    }
    dialog.showModal();
    if (!saved && !pendingSubmission && backendReady) form.elements.attending[0].focus();
});
document.getElementById('rsvp-close').addEventListener('click', () => dialog.close());
document.getElementById('success-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => rsvpButton.focus({ preventScroll: true }));
dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusableElements = Array.from(dialog.querySelectorAll('button, input, textarea, a[href]'))
        .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
    }
});
dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});

function updateAllergyFields() {
    const attending = form.elements.attending.value === 'yes';
    const allergyToggle = document.getElementById('allergy-toggle');
    const collectingDetails = attending && allergyToggle.checked;
    document.getElementById('allergies-section').hidden = !attending;
    allergyToggle.disabled = !attending;
    document.getElementById('allergy-details').hidden = !collectingDetails;
    for (const fieldId of ['allergy-text', 'allergy-consent']) {
        const field = document.getElementById(fieldId);
        field.disabled = !collectingDetails;
        field.required = collectingDetails;
    }
}
form.addEventListener('change', updateAllergyFields);

function generateRequestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    randomBytes[6] = (randomBytes[6] & 15) | 64;
    randomBytes[8] = (randomBytes[8] & 63) | 128;
    const hexadecimal = Array.from(randomBytes, (byteValue) => byteValue.toString(16).padStart(2, '0')).join('');
    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (updateRsvpAvailability()) return;
    if (sending || saved || invitationRejected || !backendReady) return;
    if (!pendingSubmission) {
        if (!form.reportValidity()) return;
        const attending = form.elements.attending.value === 'yes';
        const collectingAllergies = attending && document.getElementById('allergy-toggle').checked;
        if (collectingAllergies && !form.elements.allergies.value.trim()) {
            formMessage.textContent = 'Indica i dettagli oppure disattiva la segnalazione delle allergie.';
            formMessage.hidden = false;
            return;
        }
        pendingSubmission = {
            requestId: generateRequestId(),
            invitationToken,
            attending,
            allergies: collectingAllergies ? form.elements.allergies.value.trim() : '',
            allergyConsent: collectingAllergies && form.elements.allergyConsent.checked,
            website: form.elements.website.value,
        };
    }
    sending = true;
    formFields.disabled = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Invio in corso…';
    submitButton.setAttribute('aria-busy', 'true');
    formMessage.hidden = true;
    const controller = new AbortController();
    let timeout;
    try {
        const turnstileToken = await completeChallenge();
        if (updateRsvpAvailability()) return;
        timeout = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(EVENT_CONFIG.rsvp.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...pendingSubmission, turnstileToken }),
            signal: controller.signal,
        });
        const result = await response.json();
        if (response.status !== 200 || result.ok !== true) {
            if (response.status === 410 && result.code === 'rsvp_closed') {
                rsvpClosedByServer = true;
                updateRsvpAvailability();
                return;
            }
            if ([400, 413, 415].includes(response.status)) {
                pendingSubmission = null;
                formFields.disabled = false;
            }
            if (response.status === 409 || result.code === 'invitation_invalid') invitationRejected = true;
            throw new Error(result.error || 'Invio non riuscito. Riprova tra poco.');
        }
        saved = true;
        form.hidden = true;
        document.getElementById('rsvp-success').hidden = false;
        document.getElementById('success-message').textContent = pendingSubmission.attending
            ? 'Sei a bordo! La ciurma ti aspetta per festeggiare insieme.'
            : 'Grazie per avermi avvisato. Ci ritroveremo alla prossima avventura!';
        document.getElementById('success-close').focus();
    } catch (error) {
        if (error.name === 'AbortError') {
            formMessage.textContent = 'La risposta tarda ad arrivare. I dati sono conservati: riprova con lo stesso invio.';
        } else if (error instanceof TypeError) {
            formMessage.textContent = 'Connessione non riuscita. I dati sono conservati: riprova.';
        } else {
            formMessage.textContent = error.message;
        }
        formMessage.hidden = false;
    } finally {
        clearTimeout(timeout);
        sending = false;
        submitButton.removeAttribute('aria-busy');
        submitButton.disabled = saved || invitationRejected || !backendReady;
        submitButton.textContent = pendingSubmission ? 'Riprova invio' : 'Invia la mia risposta';
        updateRsvpAvailability();
    }
});
