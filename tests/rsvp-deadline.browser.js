async (page) => {
    const verify = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const closesAt = Date.parse('2026-11-16T00:00:00+01:00');
    const scriptErrors = [];
    let submissions = 0;
    let serverClosed = false;
    await page.unrouteAll();
    await page.route('**/functions/v1/rsvp?action=identify', route => route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': 'http://127.0.0.1:8000'}, body: JSON.stringify({firstName:'Mario',lastName:'Rossi'})}));
    await page.route('**/assets/site-config.js', route => route.fulfill({contentType: 'text/javascript', body: 'const PUBLIC_SITE_CONFIG = Object.freeze({turnstileSiteKey:"simulated-site",rsvpEndpoint:"https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp",supabasePublishableKey:"sb_publishable_fixture"});'}));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({contentType: 'text/javascript', body: 'let sequence=0; let callbacks; window.turnstile={remove(){},render(selector,options){callbacks=options; return "fixture";},execute(){callbacks.callback("simulated-challenge-"+(++sequence));}};'}));

    page.on('pageerror', (error) => scriptErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(closesAt - 1);
    await page.route('**/functions/v1/rsvp', async (route) => {
        submissions += 1;
        await route.fulfill({
            status: serverClosed ? 410 : 200,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(serverClosed ? { code: 'rsvp_closed', error: 'Iscrizioni chiuse.' } : { ok: true }),
        });
    });

    for (const dimensions of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(dimensions);
        await page.goto('http://127.0.0.1:8000/?security-test=rsvp-deadline.browser&width=' + dimensions.width + '#invito=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await page.locator('body.ready').waitFor();
    await page.waitForFunction(() => backendReady);
        await page.getByRole('button', { name: 'Apri l’invito' }).click();
        await page.locator('body[data-state="opened"]').waitFor();
        verify((await page.locator('#rsvp-deadline').textContent()).includes('15 novembre 2026'), 'Deadline missing from letter');
        verify(await page.locator('#rsvp-open').isEnabled(), 'Registration closed before the end of November 15');
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Letter overflows');
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `output/playwright/deadline-${dimensions.width}.png`, fullPage: true });
    }

    await page.locator('#rsvp-open').click();
    await page.getByRole('radio', { name: 'Sì, ci sarò' }).check();
    await page.locator('#rsvp-submit').click();
    await page.getByRole('heading', { name: 'Risposta ricevuta' }).waitFor();
    verify(submissions === 1, 'Registration before the deadline did not succeed');
    await page.reload();
    await page.locator('body.ready').waitFor();
    await page.waitForFunction(() => backendReady);
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await page.locator('body[data-state="opened"]').waitFor();
    await page.locator('#rsvp-open').click();
    await page.clock.setFixedTime(closesAt);
    await page.waitForFunction(() => document.getElementById('rsvp-submit').disabled);
    verify(await page.locator('#rsvp-open').isDisabled(), 'Open page did not close at midnight');
    verify(await page.locator('#rsvp-fields').evaluate(element => element.disabled), 'Open form fields remain enabled');
    verify((await page.locator('#form-message').textContent()).includes('iscrizioni sono chiuse'), 'Open form has no closure message');
    await page.evaluate(() => document.getElementById('rsvp-form').dispatchEvent(new Event('submit', { cancelable: true })));
    verify(submissions === 1, 'Expired form sent a request');
    await page.reload();
    verify(await page.locator('#rsvp-open').isDisabled(), 'Page loaded after midnight allows registration');

    await page.clock.setFixedTime(closesAt - 86400000);
    serverClosed = true;
    await page.reload();
    await page.locator('body.ready').waitFor();
    await page.waitForFunction(() => backendReady);
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await page.locator('body[data-state="opened"]').waitFor();
    await page.locator('#rsvp-open').click();
    await page.getByRole('radio', { name: 'Sì, ci sarò' }).check();
    await page.locator('#rsvp-submit').click();
    await page.waitForFunction(() => document.getElementById('rsvp-submit').textContent === 'Iscrizioni chiuse');
    verify(submissions === 2, 'Server closure was not received');
    verify(await page.locator('#rsvp-open').isDisabled(), 'Server closure did not disable registration');
    verify(await page.locator('#rsvp-fields').evaluate(element => element.disabled), 'Server closure did not disable fields');
    verify(await page.locator('#rsvp-success').isHidden(), 'Server closure showed success');
    await page.evaluate(() => document.getElementById('rsvp-form').dispatchEvent(new Event('submit', { cancelable: true })));
    verify(submissions === 2, 'Server closure still allows retries');
    verify(scriptErrors.length === 0, scriptErrors.join('; '));
    await page.screenshot({ path: 'output/playwright/deadline-closed.png', fullPage: true });
    await page.unrouteAll();
    return { deadline: 'Last millisecond accepted; midnight blocks loaded and open forms; HTTP 410 overrides a slow device clock', scriptErrors };
}
