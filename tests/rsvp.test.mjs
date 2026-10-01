import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleRequest } from '../supabase/functions/rsvp/index.js';

const environment = new Map([
    ['SUPABASE_URL', 'https://example.supabase.co'],
    ['SUPABASE_SECRET_KEYS', '{"default":"sb_secret_test"}'],
]);
globalThis.Deno = { env: { get: (name) => environment.get(name) } };
const originalFetch = globalThis.fetch;
let databaseCalls = 0;
let savedPayload;
globalThis.fetch = async (_url, options) => {
    databaseCalls += 1;
    savedPayload = JSON.parse(options.body);
    return new Response(null, { status: 204 });
};

const validPayload = {
    requestId: randomUUID(),
    firstName: ' Invitato ',
    lastName: ' Test ',
    attending: true,
};
const submit = (payload) => handleRequest(new Request('https://example.test/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
}));

try {
    assert.equal((await handleRequest(new Request('https://example.test/rsvp'))).status, 405);
    assert.equal((await handleRequest(new Request('https://example.test/rsvp', { method: 'OPTIONS' }))).status, 204);
    for (const invalidPayload of [
        null,
        { ...validPayload, firstName: ' ' },
        { ...validPayload, lastName: 'x'.repeat(81) },
        { ...validPayload, attending: 'yes' },
        { ...validPayload, requestId: 'invalid' },
        { ...validPayload, allergies: [] },
        { ...validPayload, allergies: 'example', allergyConsent: false },
        { ...validPayload, allergies: 'x'.repeat(1001), allergyConsent: true },
        { ...validPayload, website: 'spam' },
    ]) {
        assert.equal((await submit(invalidPayload)).status, 400);
    }
    assert.equal((await submit({ ...validPayload, allergies: 'x'.repeat(9000) })).status, 413);
    assert.equal(databaseCalls, 0);
    assert.deepEqual(await (await submit(validPayload)).json(), { ok: true });
    assert.equal(savedPayload.first_name, 'Invitato');
    assert.equal(savedPayload.allergies, null);
    assert.equal((await submit({ ...validPayload, allergies: 'example', allergyConsent: true })).status, 200);
    assert.equal(savedPayload.allergy_consent, true);
    assert.equal((await submit({ ...validPayload, attending: false, allergies: 'example' })).status, 200);
    assert.equal(savedPayload.allergies, null);
    environment.set('RSVP_ALLOWED_ORIGIN', 'https://invito.example');
    assert.equal((await submit(validPayload)).status, 403);
    environment.delete('RSVP_ALLOWED_ORIGIN');
    globalThis.fetch = async () => Response.json({ message: 'rate_limit' }, { status: 400 });
    assert.equal((await submit(validPayload)).status, 429);
    globalThis.fetch = async () => Response.json({ code: '23505' }, { status: 409 });
    assert.equal((await submit(validPayload)).status, 409);
    globalThis.fetch = async () => { throw new Error('Offline'); };
    assert.equal((await submit(validPayload)).status, 503);
    environment.delete('SUPABASE_SECRET_KEYS');
    assert.equal((await submit(validPayload)).status, 503);
    console.log('RSVP: validazione, consenso, CORS, limiti ed errori verificati.');
} finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
}
