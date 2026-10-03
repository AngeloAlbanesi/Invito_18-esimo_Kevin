export async function handleInvitationRequest(request) {
    const origin = Deno.env.get('RSVP_ALLOWED_ORIGIN');
    const adminUserId = Deno.env.get('RSVP_ADMIN_USER_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    let secretKey;
    try {
        if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://') || !adminUserId) {
            throw new Error('Missing configuration');
        }
        secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
            || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !secretKey) throw new Error('Missing configuration');
    } catch {
        return Response.json({ error: 'Pannello non configurato.' }, {
            status: 503, headers: { 'Cache-Control': 'no-store' },
        });
    }
    const headers = {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, authorization',
        'Cache-Control': 'no-store', 'Vary': 'Origin',
    };
    const respond = (status, payload) => Response.json(payload, { status, headers });
    if (request.headers.get('origin') !== origin) return respond(403, { error: 'Accesso negato.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond(405, { error: 'Metodo non consentito.' });
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 4096) {
        return respond(401, { error: 'Accedi con il tuo account.' });
    }
    try {
        // Verify the signed session with Auth; a decoded JWT alone is not authorization.
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: { apikey: secretKey, Authorization: authorization }, signal: AbortSignal.timeout(5000),
        });
        if (userResponse.status === 401 || userResponse.status === 403) {
            return respond(401, { error: 'Sessione scaduta. Accedi di nuovo.' });
        }
        if (!userResponse.ok) throw new Error('Auth unavailable');
        const user = await userResponse.json();
        if (user.id !== adminUserId) return respond(403, { error: 'Accesso negato.' });
    } catch {
        return respond(503, { error: 'Verifica accesso non disponibile. Riprova.' });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return respond(415, { error: 'Formato non valido.' });
    }
    let payload;
    try {
        const reader = request.body?.getReader();
        if (!reader) return respond(400, { error: 'Dati mancanti.' });
        const chunks = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 4096) {
                await reader.cancel();
                return respond(413, { error: 'Dati troppo lunghi.' });
            }
            chunks.push(value);
        }
        payload = await new Response(new Blob(chunks)).json();
        if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Invalid input');
    } catch {
        return respond(400, { error: 'Dati non validi.' });
    }
    const isUuid = (value) => typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const databaseHeaders = { apikey: secretKey, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    if (secretKey.startsWith('eyJ')) databaseHeaders.Authorization = `Bearer ${secretKey}`;
    const databaseUrl = `${supabaseUrl}/rest/v1/rsvp_invitations`;
    const queryDatabase = (url, options = {}) => fetch(url, {
        ...options, headers: databaseHeaders, signal: AbortSignal.timeout(10000),
    });
    try {
        if (payload.action === 'accepted') {
            if (payload.cursor !== undefined && !isUuid(payload.cursor)) return respond(400, { error: 'Pagina non valida.' });
            const cursorFilter = payload.cursor ? `&invitation_id=gt.${payload.cursor}` : '';
            const result = await fetch(`${supabaseUrl}/rest/v1/rsvp_responses`
                + '?select=invitation_id,first_name,last_name,created_at,allergies&attending=eq.true'
                + `&invitation_id=not.is.null&order=invitation_id.asc&limit=100${cursorFilter}`, {
                headers: { ...databaseHeaders, Prefer: 'count=exact' }, signal: AbortSignal.timeout(10000),
            });
            if (!result.ok) throw new Error('Database unavailable');
            const accepted = await result.json();
            const total = Number(result.headers.get('content-range')?.split('/')[1]);
            if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid count');
            return respond(200, { accepted, total, nextCursor: accepted.length === 100
                ? accepted[accepted.length - 1].invitation_id : null });
        }
        if (payload.action === 'delete') {
            if (!isUuid(payload.invitationId)) return respond(400, { error: 'Invito non valido.' });
            const result = await queryDatabase(`${supabaseUrl}/rest/v1/rpc/delete_personal_invitation`, {
                method: 'POST', body: JSON.stringify({ invitation_id: payload.invitationId }),
            });
            if (!result.ok || (await result.json()).ok !== true) throw new Error('Deletion unavailable');
            return respond(200, { ok: true });
        }
        if (payload.action === 'list') {
            if (payload.cursor !== undefined && !isUuid(payload.cursor)) return respond(400, { error: 'Pagina non valida.' });
            const cursorFilter = payload.cursor ? `&id=gt.${payload.cursor}` : '';
            const result = await queryDatabase(`${databaseUrl}?select=id,first_name,last_name,revoked_at&order=id.asc&limit=100${cursorFilter}`);
            if (!result.ok) throw new Error('Database unavailable');
            const invitations = await result.json();
            return respond(200, { invitations,
                nextCursor: invitations.length === 100 ? invitations[invitations.length - 1].id : null });
        }
        if (!['create', 'rotate', 'revoke'].includes(payload.action) || !isUuid(payload.invitationId)) {
            return respond(400, { error: 'Operazione non valida.' });
        }
        const invitationId = payload.invitationId;
        if (payload.action === 'revoke') {
            const result = await queryDatabase(`${databaseUrl}?id=eq.${invitationId}&select=id`, {
                method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }),
            });
            if (!result.ok) throw new Error('Database unavailable');
            if ((await result.json()).length !== 1) return respond(404, { error: 'Invito non trovato.' });
            return respond(200, { ok: true });
        }
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const invitationToken = btoa(String.fromCharCode(...randomBytes))
            .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(invitationToken));
        const tokenHash = Array.from(new Uint8Array(digest), (byteValue) => byteValue.toString(16).padStart(2, '0')).join('');
        let result;
        if (payload.action === 'create') {
            const validName = (value) => typeof value === 'string' && value.trim().length >= 1
                && value.trim().length <= 80 && !value.includes('\u0000');
            if (!validName(payload.firstName) || !validName(payload.lastName)) {
                return respond(400, { error: 'Inserisci nome e cognome validi.' });
            }
            result = await queryDatabase(`${databaseUrl}?select=id`, {
                method: 'POST', body: JSON.stringify({ id: invitationId, first_name: payload.firstName.trim(),
                    last_name: payload.lastName.trim(), token_hash: tokenHash }),
            });
            if (result.status === 409) {
                return respond(409, { error: 'Invito già creato. Aggiorna l’elenco e sostituisci il link per recuperarlo.' });
            }
        } else {
            result = await queryDatabase(`${databaseUrl}?id=eq.${invitationId}&select=id`, {
                method: 'PATCH', body: JSON.stringify({ token_hash: tokenHash, revoked_at: null }),
            });
        }
        if (!result.ok) throw new Error('Database unavailable');
        if ((await result.json()).length !== 1) return respond(404, { error: 'Invito non trovato.' });
        return respond(200, { ok: true, link: `${origin}/#invito=${invitationToken}` });
    } catch {
        return respond(503, { error: 'Operazione non confermata. Aggiorna l’elenco prima di creare altri inviti.' });
    }
}

if (typeof Deno !== 'undefined') Deno.serve(handleInvitationRequest);
