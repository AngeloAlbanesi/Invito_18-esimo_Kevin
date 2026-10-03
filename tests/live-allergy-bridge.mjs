// Local integration harness: real Supabase Auth/DB, simulated Turnstile only.
// Requires a private config; never deploy this file or change production secrets.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { handleRequest } from '../supabase/functions/rsvp/index.js';
import { handleInvitationRequest } from '../supabase/functions/invitations/index.js';

const configuration = JSON.parse(await readFile('output/private/allergy-test-config.json', 'utf8'));
const supabaseUrl = 'https://dnpvzzrfdwbcecexuccm.supabase.co';
const origin = 'https://invito-kevin-18.pages.dev';
const databaseHeaders = { apikey: configuration.serviceKey, Authorization: 'Bearer ' + configuration.serviceKey,
    'Content-Type': 'application/json' };
const originalFetch = globalThis.fetch;
const invitations = new Map();
let organizerId;
let fixtureCredentials;
const environment = new Map([
    ['SUPABASE_URL', supabaseUrl], ['SUPABASE_SERVICE_ROLE_KEY', configuration.serviceKey],
    ['RSVP_ALLOWED_ORIGIN', origin], ['TURNSTILE_SECRET_KEY', 'integration-only'],
]);
globalThis.Deno = { env: { get: name => environment.get(name) } };
globalThis.fetch = async (url, options) => {
    if (String(url).includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
        return Response.json({ success: true, hostname: new URL(origin).hostname, action: 'rsvp' });
    }
    if (String(url).includes('/rest/v1/rsvp_responses?')) {
        const ownedIds = [...invitations.values()].map(invitation => invitation.id);
        url += '&invitation_id=in.(' + ownedIds.join(',') + ')';
    }
    return originalFetch(url, options);
};

async function setup() {
    if (fixtureCredentials) return fixtureCredentials;
    const email = 'integration-' + randomUUID() + '@example.invalid';
    const password = randomBytes(24).toString('base64url');
    const created = await originalFetch(supabaseUrl + '/auth/v1/admin/users', {
        method: 'POST', headers: databaseHeaders,
        body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!created.ok) throw new Error('Fixture account creation failed');
    organizerId = (await created.json()).id;
    environment.set('RSVP_ADMIN_USER_ID', organizerId);
    const signedIn = await originalFetch(supabaseUrl + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: configuration.publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!signedIn.ok) throw new Error('Fixture sign-in failed');
    const session = await signedIn.json();
    for (const [marker, firstName] of [['A', 'TestAllergia'], ['B', 'TestSenzaAllergia']]) {
        const invitationId = randomUUID();
        invitations.set(marker.repeat(43), { id: invitationId });
        const response = await handleInvitationRequest(new Request(origin + '/api', {
            method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
            body: JSON.stringify({ action: 'create', invitationId, firstName, lastName: 'Fittizio' }),
        }));
        if (!response.ok) throw new Error('Fixture invitation creation failed');
        const invitationToken = new URL((await response.json()).link).hash.slice('#invito='.length);
        invitations.get(marker.repeat(43)).token = invitationToken;
    }
    fixtureCredentials = { email, password };
    return fixtureCredentials;
}

async function cleanup() {
    for (const invitation of invitations.values()) {
        const response = await originalFetch(supabaseUrl + '/rest/v1/rpc/delete_personal_invitation', {
            method: 'POST', headers: databaseHeaders, body: JSON.stringify({ invitation_id: invitation.id }),
        });
        if (!response.ok) throw new Error('Fixture invitation cleanup failed');
    }
    if (organizerId) {
        const response = await originalFetch(supabaseUrl + '/auth/v1/admin/users/' + organizerId, { method: 'DELETE', headers: databaseHeaders });
        if (!response.ok) throw new Error('Fixture account cleanup failed');
    }
    invitations.clear();
    organizerId = undefined;
    fixtureCredentials = undefined;
}

const server = createServer(async (incoming, outgoing) => {
    try {
        let response;
        if (incoming.url === '/setup') response = Response.json(await setup());
        else if (incoming.url === '/cleanup') { await cleanup(); response = Response.json({ cleaned: true }); }
        else if (incoming.url === '/inspect') {
            const invitation = invitations.get('A'.repeat(43));
            const result = await originalFetch(supabaseUrl + '/rest/v1/rsvp_responses?select=allergies,allergy_consent&invitation_id=eq.' + invitation.id, { headers: databaseHeaders });
            const rows = await result.json();
            response = Response.json({ saved: rows.length === 1 && rows[0].allergies === 'TEST: arachidi e lattosio' && rows[0].allergy_consent === true });
        } else if (['/rsvp', '/invitations'].includes(incoming.url)) {
            const chunks = [];
            for await (const chunk of incoming) chunks.push(chunk);
            const payload = JSON.parse(Buffer.concat(chunks).toString());
            if (incoming.url === '/rsvp') {
                const invitation = invitations.get(payload.invitationToken);
                if (!invitation) throw new Error('Unknown fixture');
                payload.invitationToken = invitation.token;
            }
            const request = new Request(origin + '/api', { method: 'POST',
                headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: incoming.headers.authorization || '' },
                body: JSON.stringify(payload) });
            response = await (incoming.url === '/rsvp' ? handleRequest(request) : handleInvitationRequest(request));
        } else response = Response.json({ error: 'Not found' }, { status: 404 });
        outgoing.writeHead(response.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        outgoing.end(await response.text());
    } catch {
        outgoing.writeHead(500, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ error: 'Integration failed; no credentials logged' }));
    }
});
server.listen(8766, '127.0.0.1', () => process.stdout.write('Local integration harness ready; Auth and DB live, Turnstile simulated.\n'));
process.on('SIGINT', async () => { await cleanup(); server.close(); process.exit(0); });
