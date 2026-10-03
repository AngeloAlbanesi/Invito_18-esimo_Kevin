import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { handleRequest } from '../supabase/functions/rsvp/index.js';
import { handleInvitationRequest } from '../supabase/functions/invitations/index.js';

const origin = 'https://invito.example';
const adminUserId = randomUUID();
const environment = new Map([
    ['RSVP_ALLOWED_ORIGIN', origin], ['SUPABASE_URL', 'https://example.supabase.co'],
    ['SUPABASE_SECRET_KEYS', '{"default":"sb_secret_test"}'],
    ['TURNSTILE_SECRET_KEY', 'test-only'], ['RSVP_ADMIN_USER_ID', adminUserId],
]);
globalThis.Deno = { env: { get: (name) => environment.get(name) } };
const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
const closesAt = Date.parse('2026-11-16T00:00:00+01:00');
Date.now = () => closesAt - 1;
let calls = [];
let challenge = { success: true, hostname: 'invito.example', action: 'rsvp' };
let databaseResult = { code: 'ok' };
let verifiedUser = adminUserId;
let createdInvitation;
let unavailableService;
let identifiedInvitations = [{ first_name: 'Mario', last_name: 'Rossi' }];
globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes(unavailableService || 'never-match')) throw new Error('Offline');
    if (url.includes('siteverify')) return Response.json(challenge);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: verifiedUser });
    if (url.includes('/rsvp_responses')) return Response.json([
        { invitation_id: '11111111-1111-4111-8111-111111111111', first_name: 'Mario', last_name: 'Rossi', created_at: '2026-10-03T16:00:00Z', allergies: 'TEST: arachidi' },
    ], { headers: { 'Content-Range': '0-0/1' } });
    if (url.endsWith('/rpc/delete_personal_invitation')) return Response.json({ ok: true });
    if (url.includes('/rsvp_invitations')) {
        if (url.includes('select=first_name,last_name')) return Response.json(identifiedInvitations);
        if (options.method === 'POST') createdInvitation = JSON.parse(options.body);
        return Response.json(options.method ? [{ id: createdInvitation?.id || randomUUID() }] : []);
    }
    return Response.json(databaseResult);
};
const payload = { requestId: randomUUID(), invitationToken: randomBytes(32).toString('base64url'),
    attending: true, website: '', turnstileToken: 'challenge-test' };
const request = (body, headers = {}, method = 'POST') => new Request(origin + '/api', {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
const submit = (body = payload, headers = {}, method = 'POST') => handleRequest(request(body, headers, method));
const databaseCalls = () => calls.filter((call) => call.url.includes('/rest/v1/'));
try {
    const identityPayload = { action: 'identify', invitationToken: payload.invitationToken };
    let identityResponse = await submit(identityPayload);
    assert.equal(identityResponse.status, 200);
    assert.equal(identityResponse.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await identityResponse.json(), { firstName: 'Mario', lastName: 'Rossi' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('revoked_at=is.null'));
    assert.ok(calls[0].url.includes(createHash('sha256').update(payload.invitationToken).digest('hex')));
    assert.ok(!calls[0].url.includes(payload.invitationToken));
    calls = [];
    assert.equal((await submit({ action: 'identify', invitationToken: 'bad' })).status, 403);
    assert.equal((await submit({ ...identityPayload, attending: true })).status, 400);
    assert.equal(calls.length, 0);
    identifiedInvitations = [];
    assert.equal((await submit(identityPayload)).status, 403);
    unavailableService = 'rsvp_invitations';
    assert.equal((await submit(identityPayload)).status, 503);
    unavailableService = undefined;
    identifiedInvitations = [{ first_name: 'Mario', last_name: 'Rossi' }];
    calls = [];
    assert.equal((await submit(payload, {}, 'GET')).status, 405);
    assert.equal((await submit(payload, {}, 'OPTIONS')).status, 204);
    assert.equal((await submit(payload, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await submit(payload, { 'Content-Type': 'text/plain' })).status, 415);
    for (const allowedOrigin of [undefined, '', '*', origin + '/', 'http://invito.example', origin + '/path']) {
        if (allowedOrigin === undefined) environment.delete('RSVP_ALLOWED_ORIGIN');
        else environment.set('RSVP_ALLOWED_ORIGIN', allowedOrigin);
        const response = await submit();
        assert.equal(response.status, 503);
        assert.notEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
    }
    environment.set('RSVP_ALLOWED_ORIGIN', origin);
    for (const invalid of [null, [], { ...payload, requestId: 'invalid' },
        { ...payload, attending: 'yes' }, { ...payload, firstName: 'Impersonated' },
        { ...payload, website: 'spam' }, { ...payload, allergies: [] },
        { ...payload, allergyConsent: 'true' },
        { ...payload, allergies: 'example', allergyConsent: false },
        { ...payload, allergies: 'x'.repeat(1001), allergyConsent: true }]) {
        assert.equal((await submit(invalid)).status, 400);
    }
    assert.equal((await submit({ ...payload, invitationToken: undefined })).status, 403);
    assert.equal((await submit({ ...payload, allergies: 'x'.repeat(9000) })).status, 413);
    assert.equal(databaseCalls().length, 0);
    for (const invalidChallenge of [
        { success: false, 'error-codes': ['timeout-or-duplicate'] },
        { success: true, hostname: 'evil.example', action: 'rsvp' },
        { success: true, hostname: 'invito.example', action: 'other' },
    ]) {
        challenge = invalidChallenge;
        assert.equal((await submit()).status, 403);
        assert.equal(databaseCalls().length, 0);
    }
    challenge = { success: false, 'error-codes': ['internal-error'] };
    assert.equal((await submit()).status, 503);
    unavailableService = 'siteverify';
    assert.equal((await submit()).status, 503);
    assert.equal(databaseCalls().length, 0);
    unavailableService = undefined;
    challenge = { success: true, hostname: 'invito.example', action: 'rsvp' };
    assert.equal((await submit({ ...payload, turnstileToken: '' })).status, 403);
    assert.deepEqual(await (await submit()).json(), { ok: true });
    const saved = JSON.parse(databaseCalls().at(-1).options.body);
    assert.equal(saved.token_hash, createHash('sha256').update(payload.invitationToken).digest('hex'));
    assert.equal(saved.first_name, undefined);
    assert.equal(saved.invitationToken, undefined);
    assert.equal(saved.allergies, null);
    assert.equal((await submit({ ...payload, attending: false, allergies: 'discard' })).status, 200);
    assert.equal(JSON.parse(databaseCalls().at(-1).options.body).allergies, null);
    for (const [code, status] of [['invitation_invalid', 403], ['invitation_used', 409],
        ['request_conflict', 409], ['rate_limit', 429], ['rsvp_closed', 410], ['unknown', 503]]) {
        databaseResult = { code, retry_after: 12 };
        const response = await submit();
        assert.equal(response.status, status);
        if (status === 429) assert.equal(response.headers.get('Retry-After'), '12');
    }
    for (const timestamp of [closesAt, closesAt + 1]) {
        Date.now = () => timestamp;
        const previousCalls = calls.length;
        assert.equal((await submit()).status, 410);
        assert.equal(calls.length, previousCalls);
    }
    Date.now = () => closesAt - 1;
    environment.delete('TURNSTILE_SECRET_KEY');
    assert.equal((await submit()).status, 503);
    environment.set('TURNSTILE_SECRET_KEY', 'test-only');
    calls = [];
    const adminRequest = (body, authorization = 'Bearer test-session') => handleInvitationRequest(
        request(body, { Authorization: authorization }));
    assert.equal((await adminRequest({ action: 'list' }, '')).status, 401);
    assert.equal((await adminRequest({ action: 'accepted' }, '')).status, 401);
    assert.equal((await adminRequest({ action: 'delete', invitationId: randomUUID() }, '')).status, 401);
    assert.equal(databaseCalls().length, 0);
    verifiedUser = randomUUID();
    assert.equal((await adminRequest({ action: 'list' })).status, 403);
    assert.equal((await adminRequest({ action: 'accepted' })).status, 403);
    assert.equal((await adminRequest({ action: 'delete', invitationId: randomUUID() })).status, 403);
    assert.equal(databaseCalls().length, 0);
    verifiedUser = adminUserId;
    const acceptedResponse = await adminRequest({ action: 'accepted' });
    assert.equal(acceptedResponse.status, 200);
    assert.equal(acceptedResponse.headers.get('Cache-Control'), 'no-store');
    const acceptedBody = await acceptedResponse.json();
    assert.equal(acceptedBody.total, 1);
    assert.equal(acceptedBody.accepted[0].first_name, 'Mario');
    const acceptedQuery = calls.find(call => call.url.includes('/rsvp_responses'));
    assert.ok(acceptedQuery.url.includes('attending=eq.true'));
    assert.ok(acceptedQuery.url.includes('created_at,allergies'));
    assert.equal(acceptedBody.accepted[0].allergies, 'TEST: arachidi');
    assert.equal((await adminRequest({ action: 'accepted', cursor: 'invalid' })).status, 400);
    const deletedId = randomUUID();
    assert.equal((await adminRequest({ action: 'delete', invitationId: deletedId })).status, 200);
    assert.deepEqual(JSON.parse(calls.find(call => call.url.endsWith('/rpc/delete_personal_invitation')).options.body), { invitation_id: deletedId });
    assert.equal((await adminRequest({ action: 'delete', invitationId: 'invalid' })).status, 400);
    unavailableService = 'delete_personal_invitation';
    assert.equal((await adminRequest({ action: 'delete', invitationId: deletedId })).status, 503);
    unavailableService = undefined;
    const result = await adminRequest({ action: 'create', invitationId: randomUUID(),
        firstName: ' Kevin ', lastName: ' Test ' });
    assert.equal(result.status, 200);
    const link = (await result.json()).link;
    const token = new URL(link).hash.slice('#invito='.length);
    assert.equal(Buffer.from(token, 'base64url').length, 32);
    assert.equal(createdInvitation.token_hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(createdInvitation.first_name, 'Kevin');
    assert.equal(JSON.stringify(createdInvitation).includes(token), false);
    assert.equal((await adminRequest({ action: 'list' })).status, 200);
    assert.equal((await adminRequest({ action: 'rotate', invitationId: randomUUID() })).status, 200);
    assert.equal((await adminRequest({ action: 'revoke', invitationId: randomUUID() })).status, 200);
    assert.equal((await adminRequest({ action: 'create', invitationId: randomUUID(), firstName: ' ', lastName: 'Test' })).status, 400);
    console.log('RSVP e pannello: autorizzazione, challenge, hash, CORS, scadenza, errori e assenza di token nel DB verificati.');
} finally {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
    delete globalThis.Deno;
}
