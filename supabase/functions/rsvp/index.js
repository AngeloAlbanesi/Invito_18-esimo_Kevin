const RSVP_CLOSES_AT = Date.parse('2026-11-16T00:00:00+01:00');

export async function handleRequest(request) {
    const configuredOrigin = Deno.env.get('RSVP_ALLOWED_ORIGIN');
    let allowedOrigin;
    try {
        const originUrl = new URL(configuredOrigin);
        if (originUrl.protocol !== 'https:' || originUrl.origin !== configuredOrigin) {
            throw new Error('Invalid origin');
        }
        allowedOrigin = originUrl.origin;
    } catch {
        return Response.json({ code: 'unavailable', error: 'Raccolta conferme non configurata.' }, {
            status: 503, headers: { 'Cache-Control': 'no-store', 'Vary': 'Origin' },
        });
    }
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Expose-Headers': 'Retry-After',
        'Cache-Control': 'no-store', 'Vary': 'Origin',
    };
    const respond = (status, code, error, extraHeaders = {}) => Response.json(
        error ? { code, error } : { ok: true },
        { status, headers: { ...headers, ...extraHeaders } },
    );
    if (request.headers.get('origin') !== allowedOrigin) {
        return respond(403, 'forbidden', 'Origine non autorizzata.');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond(405, 'invalid_method', 'Metodo non consentito.');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return respond(415, 'invalid_input', 'Invia i dati in formato JSON.');
    }
    let payload;
    try {
        const reader = request.body?.getReader();
        if (!reader) return respond(400, 'invalid_input', 'Dati mancanti.');
        const decoder = new TextDecoder();
        let body = '';
        let bodySize = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bodySize += value.byteLength;
            if (bodySize > 8192) {
                await reader.cancel();
                return respond(413, 'invalid_input', 'Dati troppo lunghi.');
            }
            body += decoder.decode(value, { stream: true });
        }
        payload = JSON.parse(body + decoder.decode());
    } catch {
        return respond(400, 'invalid_input', 'Dati non validi.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return respond(400, 'invalid_input', 'Dati non validi.');
    }
    const validRequestId = typeof payload.requestId === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId);
    if (!validRequestId || typeof payload.attending !== 'boolean'
        || (payload.website !== undefined && payload.website !== '')
        || (payload.allergies !== undefined && typeof payload.allergies !== 'string')
        || (payload.allergyConsent !== undefined && typeof payload.allergyConsent !== 'boolean')
        || 'firstName' in payload || 'lastName' in payload) {
        return respond(400, 'invalid_input', 'Controlla i dati nel modulo del tuo invito personale.');
    }
    if (typeof payload.invitationToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.invitationToken)) {
        return respond(403, 'invitation_invalid', 'Apri un invito personale valido ricevuto da Kevin.');
    }
    const allergies = payload.attending ? (payload.allergies?.trim() || null) : null;
    if (allergies && (allergies.length > 1000 || payload.allergyConsent !== true)) {
        return respond(400, 'invalid_input', 'Controlla le allergie e il consenso alla loro raccolta.');
    }
    if (Date.now() >= RSVP_CLOSES_AT) {
        return respond(410, 'rsvp_closed', 'Le iscrizioni sono chiuse. Il termine era il 15 novembre 2026.');
    }
    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    let secretKey;
    try {
        const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
        secretKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !secretKey || !turnstileSecret) throw new Error('Missing configuration');
    } catch {
        return respond(503, 'unavailable', 'Raccolta conferme non configurata.');
    }
    if (typeof payload.turnstileToken !== 'string' || !payload.turnstileToken
        || payload.turnstileToken.length > 2048) {
        return respond(403, 'challenge_required', 'Completa nuovamente la verifica prima di inviare.');
    }
    try {
        const challengeResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({ secret: turnstileSecret, response: payload.turnstileToken }),
        });
        if (!challengeResponse.ok) throw new Error('Challenge unavailable');
        const challenge = await challengeResponse.json();
        if (challenge['error-codes']?.some((code) => [
            'internal-error', 'missing-input-secret', 'invalid-input-secret',
        ].includes(code))) {
            return respond(503, 'unavailable', 'Verifica temporaneamente non disponibile. Riprova.');
        }
        if (challenge.success !== true || challenge.hostname !== new URL(allowedOrigin).hostname
            || challenge.action !== 'rsvp') {
            return respond(403, 'challenge_required', 'Completa nuovamente la verifica prima di inviare.');
        }
    } catch {
        return respond(503, 'unavailable', 'Verifica temporaneamente non disponibile. Riprova.');
    }
    try {
        const tokenDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.invitationToken));
        const tokenHash = Array.from(new Uint8Array(tokenDigest), (byteValue) =>
            byteValue.toString(16).padStart(2, '0')).join('');
        const databaseHeaders = { 'apikey': secretKey, 'Content-Type': 'application/json' };
        if (secretKey.startsWith('eyJ')) databaseHeaders.Authorization = `Bearer ${secretKey}`;
        const databaseResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_personal_rsvp`, {
            method: 'POST', headers: databaseHeaders, signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ token_hash: tokenHash, request_id: payload.requestId,
                attending: payload.attending, allergies, allergy_consent: allergies !== null }),
        });
        if (!databaseResponse.ok) throw new Error('Database unavailable');
        const result = await databaseResponse.json();
        if (result.code === 'ok') return respond(200);
        if (result.code === 'invitation_invalid') {
            return respond(403, result.code, 'Apri un invito personale valido ricevuto da Kevin.');
        }
        if (['request_conflict', 'invitation_used'].includes(result.code)) {
            return respond(409, result.code, 'Risposta già ricevuta. Per correggerla contatta Kevin.');
        }
        if (result.code === 'rate_limit') {
            const retryAfter = Number.isInteger(result.retry_after)
                ? Math.max(1, Math.min(60, result.retry_after)) : 60;
            return respond(429, result.code, 'Troppi invii. Attendi un minuto e riprova.', {
                'Retry-After': String(retryAfter),
            });
        }
        if (result.code === 'rsvp_closed') return respond(410, result.code, 'Le iscrizioni sono chiuse.');
        return respond(503, 'unavailable', 'Invio non riuscito. Conserva i dati e riprova.');
    } catch {
        return respond(503, 'unavailable', 'Connessione non riuscita. Conserva i dati e riprova.');
    }
}

if (typeof Deno !== 'undefined') Deno.serve(handleRequest);
