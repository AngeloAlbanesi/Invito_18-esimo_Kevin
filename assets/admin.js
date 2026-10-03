const adminMessage = document.getElementById('admin-message');
const loginForm = document.getElementById('login-form');
const activateForm = document.getElementById('activate-form');
const privatePanel = document.getElementById('private-panel');
const invitationList = document.getElementById('invitation-list');
const moreButton = document.getElementById('more-invitations');
const acceptedList = document.getElementById('accepted-list');
const searchInput = document.getElementById('participant-search');
const allergyFilter = document.getElementById('allergy-filter');
const authUrl = 'https://dnpvzzrfdwbcecexuccm.supabase.co/auth/v1';
const invitationsUrl = 'https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/invitations';
let accessToken;
let refreshToken;
let sessionExpiresAt = 0;
let nextCursor;
let acceptedPeople = [];
let acceptedLoaded = false;
let sortColumn = 'last_name';
let sortDirection = 1;
let pendingCreation;
let operationRunning = false;

function setSession(session) {
    accessToken = session.access_token;
    refreshToken = session.refresh_token;
    sessionExpiresAt = Date.now() + Number(session.expires_in || 3600) * 1000;
}

async function requestAuth(path, payload, method = 'POST') {
    if (!PUBLIC_SITE_CONFIG.supabasePublishableKey) throw new Error('Pannello non configurato.');
    const response = await fetch(authUrl + path, {
        method, headers: { apikey: PUBLIC_SITE_CONFIG.supabasePublishableKey,
            'Content-Type': 'application/json', ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Accesso non riuscito. Verifica i dati o richiedi un nuovo link di attivazione.');
    if (response.status === 204) return {};
    return response.json();
}

async function requestInvitations(payload) {
    if (Date.now() >= sessionExpiresAt - 30000 && refreshToken) {
        setSession(await requestAuth('/token?grant_type=refresh_token', { refresh_token: refreshToken }));
    }
    const response = await fetch(invitationsUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (response.status === 401) {
        clearSession();
        throw new Error('Sessione scaduta. Accedi di nuovo.');
    }
    if (!response.ok) throw new Error(result.error || 'Operazione non riuscita.');
    return result;
}

function clearSession() {
    accessToken = null;
    refreshToken = null;
    sessionExpiresAt = 0;
    pendingCreation = null;
    invitationList.replaceChildren();
    acceptedList.replaceChildren();
    document.getElementById('accepted-total').textContent = '0';
    document.getElementById('accepted-empty').hidden = true;
    nextCursor = null;
    acceptedPeople = [];
    acceptedLoaded = false;
    searchInput.value = '';
    allergyFilter.value = 'all';
    clearPrintView();
    document.getElementById('invitation-link').value = '';
    document.getElementById('new-link').hidden = true;
    privatePanel.hidden = true;
    activateForm.hidden = true;
    loginForm.hidden = false;
}

async function runOperation(operation) {
    if (operationRunning) return;
    operationRunning = true;
    document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    adminMessage.textContent = 'Operazione in corso…';
    try {
        await operation();
    } catch (error) {
        adminMessage.textContent = error instanceof TypeError || error.name === 'TimeoutError'
            ? 'Operazione non confermata. Aggiorna l’elenco prima di creare altri inviti.' : error.message;
    } finally {
        operationRunning = false;
        document.querySelectorAll('button').forEach((button) => { button.disabled = false; });
        document.querySelectorAll('#create-invitation input').forEach((input) => { input.disabled = Boolean(pendingCreation); });
    }
}

function showLink(link) {
    document.getElementById('invitation-link').value = link;
    document.getElementById('new-link').hidden = false;
    adminMessage.textContent = 'Link personale pronto. Copialo e invialo all’invitato.';
}

async function loadInvitations(append = false) {
    const result = await requestInvitations({ action: 'list', ...(append && nextCursor ? { cursor: nextCursor } : {}) });
    if (!append) invitationList.replaceChildren();
    for (const invitation of result.invitations) {
        const item = document.createElement('tr');
        appendCell(item, invitation.first_name);
        appendCell(item, invitation.last_name);
        appendCell(item, invitation.revoked_at ? '· revocato' : '· attivo');
        const actions = document.createElement('td');
        actions.className = 'actions';
        item.append(actions);
        for (const action of ['rotate', 'revoke']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = action === 'rotate' ? 'Sostituisci link' : 'Revoca';
            button.addEventListener('click', () => {
                if (!confirm(action === 'rotate'
                    ? 'Il vecchio link smetterà di funzionare. Sostituirlo?'
                    : 'L’invitato non potrà più confermare con questo link. Revocarlo?')) return;
                runOperation(async () => {
                    const result = await requestInvitations({ action, invitationId: invitation.id });
                    await loadInvitations();
                    if (result.link) showLink(result.link);
                    else adminMessage.textContent = 'Invito revocato.';
                });
            });
            actions.append(button);
        }
        invitationList.append(item);
    }
    nextCursor = result.nextCursor;
    moreButton.hidden = !nextCursor;
}

function appendCell(row, value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value;
    cell.className = className;
    row.append(cell);
    return cell;
}

function formatRegistrationDate(value) {
    return new Date(value).toLocaleString('it-IT', {
        dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome',
    });
}

function compareParticipants(firstPerson, secondPerson) {
    const comparison = sortColumn === 'created_at'
        ? Date.parse(firstPerson.created_at) - Date.parse(secondPerson.created_at)
        : firstPerson[sortColumn].localeCompare(secondPerson[sortColumn], 'it', { sensitivity: 'base' });
    return sortDirection * comparison || firstPerson.invitation_id.localeCompare(secondPerson.invitation_id);
}

async function loadAccepted() {
    const participants = [];
    let cursor;
    let expectedTotal;
    do {
        const result = await requestInvitations({ action: 'accepted', ...(cursor ? { cursor } : {}) });
        if (expectedTotal === undefined) expectedTotal = result.total;
        participants.push(...result.accepted);
        if (result.nextCursor && result.nextCursor <= (cursor || '')) {
            throw new Error('Elenco incompleto. Aggiorna le presenze e riprova.');
        }
        cursor = result.nextCursor;
    } while (cursor);
    if (participants.length !== expectedTotal || new Set(participants.map(person => person.invitation_id)).size !== participants.length) {
        throw new Error('Le presenze sono cambiate durante il caricamento. Aggiorna e riprova.');
    }
    acceptedPeople = participants;
    acceptedLoaded = true;
    document.getElementById('accepted-total').textContent = String(participants.length);
    renderParticipants();
}

function renderParticipants() {
    const query = searchInput.value.trim().toLocaleLowerCase('it');
    const visiblePeople = acceptedPeople.filter(person => {
        const matchesName = (person.first_name + ' ' + person.last_name).toLocaleLowerCase('it').includes(query);
        const hasAllergies = Boolean(person.allergies?.trim());
        return matchesName && (allergyFilter.value === 'all' || hasAllergies === (allergyFilter.value === 'with'));
    }).sort(compareParticipants);
    acceptedList.replaceChildren();
    document.getElementById('visible-count').textContent = visiblePeople.length + ' di ' + acceptedPeople.length + ' presenze';
    const emptyMessage = document.getElementById('accepted-empty');
    emptyMessage.hidden = visiblePeople.length !== 0;
    emptyMessage.textContent = acceptedPeople.length ? 'Nessun partecipante corrisponde alla ricerca o al filtro.' : 'Nessuna presenza confermata al momento.';
    for (const person of visiblePeople) {
        const item = document.createElement('tr');
        const fullName = person.first_name + ' ' + person.last_name;
        appendCell(item, person.first_name);
        appendCell(item, person.last_name);
        appendCell(item, 'Accettato', 'status');
        appendCell(item, person.allergies?.trim() || 'Nessuna', 'allergies' + (person.allergies?.trim() ? ' has-allergies' : ''));
        appendCell(item, formatRegistrationDate(person.created_at), 'confirmed-date');
        const actions = appendCell(item, '', 'actions');
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger';
        deleteButton.textContent = 'Elimina persona';
        deleteButton.setAttribute('aria-label', 'Elimina persona: ' + fullName);
        deleteButton.addEventListener('click', () => {
            if (!confirm('Eliminare ' + fullName + '? La risposta e l’invito verranno cancellati definitivamente. Il vecchio link non funzionerà più.')) return;
            runOperation(async () => {
                await requestInvitations({ action: 'delete', invitationId: person.invitation_id });
                document.getElementById('invitation-link').value = '';
                document.getElementById('new-link').hidden = true;
                clearPrintView();
                await loadInvitations();
                await loadAccepted();
                adminMessage.textContent = 'Persona eliminata. Risposta e invito cancellati.';
            });
        });
        actions.append(deleteButton);
        acceptedList.append(item);
    }
}

function clearPrintView() {
    document.body.classList.remove('print-ready');
    document.getElementById('print-participants').replaceChildren();
    document.getElementById('print-generated').textContent = '';
    document.getElementById('print-total').textContent = '';
}

function preparePrintView() {
    if (!accessToken || !acceptedLoaded) return;
    const printRows = document.getElementById('print-participants');
    printRows.replaceChildren();
    for (const person of [...acceptedPeople].sort(compareParticipants)) {
        const row = document.createElement('tr');
        appendCell(row, person.first_name);
        appendCell(row, person.last_name);
        appendCell(row, 'Accettato');
        appendCell(row, person.allergies?.trim() || 'Nessuna');
        appendCell(row, formatRegistrationDate(person.created_at));
        printRows.append(row);
    }
    document.getElementById('print-generated').textContent = 'Generato il ' + formatRegistrationDate(new Date());
    document.getElementById('print-total').textContent = 'Totale partecipanti: ' + acceptedPeople.length;
    document.body.classList.add('print-ready');
}

searchInput.addEventListener('input', renderParticipants);
allergyFilter.addEventListener('change', renderParticipants);
document.querySelectorAll('[data-sort]').forEach(header => {
    header.querySelector('button').addEventListener('click', () => {
        sortDirection = sortColumn === header.dataset.sort ? -sortDirection : 1;
        sortColumn = header.dataset.sort;
        document.querySelectorAll('[data-sort]').forEach(column => {
            const active = column.dataset.sort === sortColumn;
            column.setAttribute('aria-sort', active ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none');
            const button = column.querySelector('button');
            button.textContent = button.textContent.slice(0, -1) + (active ? (sortDirection === 1 ? '↑' : '↓') : '↕');
        });
        renderParticipants();
    });
});
document.getElementById('print-reservations').addEventListener('click', () => runOperation(async () => {
    clearPrintView();
    await loadAccepted();
    preparePrintView();
    adminMessage.textContent = 'Elenco completo pronto. Nella finestra di stampa puoi scegliere Salva come PDF.';
    window.print();
}));
window.addEventListener('beforeprint', preparePrintView);
window.addEventListener('afterprint', clearPrintView);

loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runOperation(async () => {
        const session = await requestAuth('/token?grant_type=password', {
            email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value,
        });
        setSession(session);
        loginForm.elements.password.value = '';
        await loadInvitations();
        await loadAccepted();
        loginForm.hidden = true;
        privatePanel.hidden = false;
        adminMessage.textContent = 'Accesso confermato.';
    });
});

activateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runOperation(async () => {
        await requestAuth('/user', { password: activateForm.elements.password.value }, 'PUT');
        activateForm.elements.password.value = '';
        await loadInvitations();
        await loadAccepted();
        activateForm.hidden = true;
        privatePanel.hidden = false;
        adminMessage.textContent = 'Accesso attivato. Puoi creare gli inviti.';
    });
});

document.getElementById('create-invitation').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!form.elements.firstName.value.trim() || !form.elements.lastName.value.trim()) {
        adminMessage.textContent = 'Inserisci nome e cognome, non soltanto spazi.';
        return;
    }
    if (!pendingCreation) pendingCreation = {
        action: 'create', invitationId: crypto.randomUUID(),
        firstName: form.elements.firstName.value.trim(), lastName: form.elements.lastName.value.trim(),
    };
    runOperation(async () => {
        form.querySelectorAll('input').forEach((input) => { input.disabled = true; });
        const result = await requestInvitations(pendingCreation);
        pendingCreation = null;
        form.reset();
        showLink(result.link);
        await loadInvitations();
    });
});

document.getElementById('refresh-invitations').addEventListener('click', () => runOperation(async () => {
    await loadInvitations();
    pendingCreation = null;
    adminMessage.textContent = 'Elenco aggiornato. Se manca un link, usa Sostituisci link.';
}));
moreButton.addEventListener('click', () => runOperation(async () => { await loadInvitations(true); adminMessage.textContent = 'Elenco aggiornato.'; }));
document.getElementById('refresh-accepted').addEventListener('click', () => runOperation(async () => {
    await loadAccepted();
    adminMessage.textContent = 'Presenze aggiornate.';
}));
document.getElementById('logout').addEventListener('click', () => runOperation(async () => {
    try { await requestAuth('/logout', {}); } finally { clearSession(); }
    adminMessage.textContent = 'Sessione chiusa.';
}));
document.getElementById('copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('invitation-link').value).then(() => {
        adminMessage.textContent = 'Link copiato.';
    }).catch(() => { adminMessage.textContent = 'Seleziona il link e copialo manualmente.'; });
});

const activation = new URLSearchParams(location.hash.slice(1));
if (activation.get('access_token')) {
    setSession({ access_token: activation.get('access_token'), refresh_token: activation.get('refresh_token'),
        expires_in: activation.get('expires_in') });
    history.replaceState(null, '', location.pathname);
    loginForm.hidden = true;
    activateForm.hidden = false;
} else if (activation.get('token_hash') && ['invite', 'recovery'].includes(activation.get('type'))) {
    const tokenHash = activation.get('token_hash');
    const verificationType = activation.get('type');
    history.replaceState(null, '', location.pathname);
    runOperation(async () => {
        setSession(await requestAuth('/verify', { token_hash: tokenHash, type: verificationType }));
        await loadInvitations();
        loginForm.hidden = true;
        activateForm.hidden = false;
        adminMessage.textContent = 'Link verificato. Scegli la tua password.';
    });
}
