export async function handleRequest(request) {
    const allowedOrigin = Deno.env.get('RSVP_ALLOWED_ORIGIN') || '*';
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
        'Cache-Control': 'no-store',
        'Vary': 'Origin',
    };
    const respond = (status, payload) => Response.json(payload, { status, headers });

    if (allowedOrigin !== '*' && request.headers.get('origin') !== allowedOrigin) {
        return respond(403, { error: 'Origine non autorizzata.' });
    }
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
        return respond(405, { error: 'Metodo non consentito.' });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return respond(415, { error: 'Invia i dati in formato JSON.' });
    }

    let payload;
    try {
        const reader = request.body?.getReader();
        if (!reader) {
            return respond(400, { error: 'Dati mancanti.' });
        }
        const decoder = new TextDecoder();
        let body = '';
        let bodySize = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bodySize += value.byteLength;
            if (bodySize > 8192) {
                await reader.cancel();
                return respond(413, { error: 'Dati troppo lunghi.' });
            }
            body += decoder.decode(value, { stream: true });
        }
        payload = JSON.parse(body + decoder.decode());
    } catch {
        return respond(400, { error: 'Dati non validi.' });
    }

    const isName = (value) => typeof value === 'string'
        && value.trim().length >= 1 && value.trim().length <= 80;
    const isRequestId = typeof payload?.requestId === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId);
    if (!isRequestId || !isName(payload?.firstName) || !isName(payload?.lastName)
        || typeof payload?.attending !== 'boolean') {
        return respond(400, { error: 'Controlla nome, cognome e presenza.' });
    }
    if (payload.website !== undefined && payload.website !== '') {
        return respond(400, { error: 'Invio non valido.' });
    }
    if (payload.allergies !== undefined && typeof payload.allergies !== 'string') {
        return respond(400, { error: 'Controlla il campo allergie.' });
    }
    const allergies = payload.attending ? (payload.allergies?.trim() || null) : null;
    if (allergies && (allergies.length > 1000 || payload.allergyConsent !== true)) {
        return respond(400, { error: 'Controlla le allergie e il consenso alla loro raccolta.' });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
        const secretKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !secretKey) {
            return respond(503, { error: 'Raccolta conferme non configurata.' });
        }
        const databaseHeaders = {
            'apikey': secretKey,
            'Content-Type': 'application/json',
        };
        if (secretKey.startsWith('eyJ')) {
            databaseHeaders.Authorization = `Bearer ${secretKey}`;
        }
        const databaseResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_rsvp`, {
            method: 'POST',
            headers: databaseHeaders,
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
                request_id: payload.requestId,
                first_name: payload.firstName.trim(),
                last_name: payload.lastName.trim(),
                attending: payload.attending,
                allergies,
                allergy_consent: allergies !== null,
            }),
        });
        if (databaseResponse.ok) {
            return respond(200, { ok: true });
        }
        const databaseError = await databaseResponse.json();
        if (databaseError.message === 'rate_limit') {
            return respond(429, { error: 'Troppi invii. Attendi un minuto e riprova.' });
        }
        if (databaseError.code === '23505') {
            return respond(409, { error: 'Questa richiesta contiene già una risposta diversa.' });
        }
        return respond(503, { error: 'Invio non riuscito. Conserva i dati e riprova.' });
    } catch {
        return respond(503, { error: 'Connessione non riuscita. Conserva i dati e riprova.' });
    }
}

if (typeof Deno !== 'undefined') {
    Deno.serve(handleRequest);
}
