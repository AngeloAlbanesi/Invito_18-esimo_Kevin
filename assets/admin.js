const adminMessage = document.getElementById('admin-message');
const loginForm = document.getElementById('login-form');
const activateForm = document.getElementById('activate-form');
const privatePanel = document.getElementById('private-panel');
const invitationList = document.getElementById('invitation-list');
const moreButton = document.getElementById('more-invitations');
const acceptedList = document.getElementById('accepted-list');
const moreAcceptedButton = document.getElementById('more-accepted');
const authUrl = 'https://dnpvzzrfdwbcecexuccm.supabase.co/auth/v1';
const invitationsUrl = 'https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/invitations';
let accessToken;
let refreshToken;
let sessionExpiresAt = 0;
let nextCursor;
let acceptedCursor;
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
    acceptedCursor = null;
    moreAcceptedButton.hidden = true;
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
        const item = document.createElement('li');
        const title = document.createElement('span');
        title.textContent = invitation.first_name + ' ' + invitation.last_name
            + (invitation.revoked_at ? ' · revocato' : ' · attivo');
        item.append(title);
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
            item.append(button);
        }
        invitationList.append(item);
    }
    nextCursor = result.nextCursor;
    moreButton.hidden = !nextCursor;
}

async function loadAccepted(append = false) {
    const result = await requestInvitations({ action: 'accepted',
        ...(append && acceptedCursor ? { cursor: acceptedCursor } : {}) });
    if (!append) {
        acceptedList.replaceChildren();
        document.getElementById('accepted-total').textContent = String(result.total);
        document.getElementById('accepted-empty').hidden = result.total !== 0;
    }
    for (const person of result.accepted) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        const fullName = person.first_name + ' ' + person.last_name;
        name.textContent = fullName;
        const confirmedDate = document.createElement('span');
        confirmedDate.className = 'confirmed-date';
        confirmedDate.textContent = 'Confermato il ' + new Date(person.created_at).toLocaleString('it-IT', {
            dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome',
        });
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Elimina persona';
        deleteButton.setAttribute('aria-label', 'Elimina persona: ' + fullName);
        deleteButton.addEventListener('click', () => {
            if (!confirm('Eliminare ' + fullName + '? La risposta e l’invito verranno cancellati definitivamente. Il vecchio link non funzionerà più.')) return;
            runOperation(async () => {
                await requestInvitations({ action: 'delete', invitationId: person.invitation_id });
                document.getElementById('invitation-link').value = '';
                document.getElementById('new-link').hidden = true;
                await loadInvitations();
                await loadAccepted();
                adminMessage.textContent = 'Persona eliminata. Risposta e invito cancellati.';
            });
        });
        item.append(name, confirmedDate, deleteButton);
        acceptedList.append(item);
    }
    acceptedCursor = result.nextCursor;
    moreAcceptedButton.hidden = !acceptedCursor;
}

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
moreAcceptedButton.addEventListener('click', () => runOperation(async () => {
    await loadAccepted(true);
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
