async (page) => {
    const verify = (condition, message) => { if (!condition) throw new Error(message); };
    await page.unrouteAll();
    await page.emulateMedia({reducedMotion: 'reduce'});
    const scriptErrors = [];
    page.on('pageerror', error => scriptErrors.push(error.message));
    let status = 200;
    let identity = {firstName: 'Mario', lastName: 'Rossi'};
    let lookupCount = 0;
    let writes = 0;
    const runId = Date.now();
    let pauseLookup = false;
    let resumeLookup;
    let lookupStarted;
    await page.route('**/assets/site-config.js', route => route.fulfill({contentType: 'text/javascript',
        body: 'const PUBLIC_SITE_CONFIG={turnstileSiteKey:"test",rsvpEndpoint:"https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp"};'}));
    await page.route('**/functions/v1/rsvp?action=identify', async route => {
        lookupCount += 1;
        const payload = route.request().postDataJSON();
        verify(Object.keys(payload).length === 2 && payload.action === 'identify', 'Identity request contains extra data');
        if (pauseLookup) await new Promise(resolve => { resumeLookup = resolve; lookupStarted(); });
        await route.fulfill({status, contentType:'application/json',
            headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8000'}, body: JSON.stringify(identity)});
    });
    await page.route('**/functions/v1/rsvp', route => { writes += 1; return route.abort(); });
    for (const width of [320, 1440]) {
        pauseLookup = true;
        const lookupStartedPromise = new Promise(resolve => { lookupStarted = resolve; });
        await page.setViewportSize({width, height:900});
        await page.goto('http://127.0.0.1:8000/?recipient-test=' + width + '&run=' + runId + '#invito=' + 'A'.repeat(43));
        await lookupStartedPromise;
        verify(await page.locator('#rsvp-submit').isDisabled(), 'Submission enabled before identity verification');
        pauseLookup = false;
        resumeLookup();
        await page.waitForFunction(() => document.getElementById('invitation-recipient').textContent === 'Per Mario Rossi');
        await page.getByRole('button',{name:'Apri l’invito'}).click();
        await page.locator('body[data-state="opened"]').waitFor();
        await page.locator('#invitation-recipient').waitFor({state:'visible'});
        verify((await page.locator('#recipient-note').textContent()).includes('Se non è il tuo nome'), 'Mismatch warning absent');
        await page.locator('#rsvp-open').click();
        verify((await page.locator('#rsvp-recipient').textContent()).includes('Mario Rossi'), 'Recipient absent from form');
        verify(await page.locator('#rsvp-submit').isEnabled(), 'Verified invitation cannot respond');
        await page.keyboard.press('Escape');
        await page.screenshot({path:'output/playwright/recipient-'+width+'.png', fullPage:true});
    }
    status = 503;
    await page.reload();
    await page.getByRole('button',{name:'Apri l’invito'}).click();
    await page.locator('body[data-state="opened"]').waitFor();
    await page.locator('#retry-invitation').waitFor({state:'visible'});
    verify(await page.locator('#rsvp-submit').isDisabled(), 'Network failure permits submission');
    status = 200;
    await page.setViewportSize({width:320,height:900});
    identity = {firstName: '<img src=x onerror=alert(1)>', lastName: 'B'.repeat(80)};
    await page.locator('#retry-invitation').click();
    await page.waitForFunction(() => backendReady);
    verify(await page.locator('#invitation-recipient img').count() === 0, 'Name interpreted as HTML');
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long name overflows');
    status = 403;
    await page.reload();
    await page.waitForFunction(() => document.getElementById('invitation-recipient').textContent.includes('non è valido'));
    verify(await page.locator('#rsvp-submit').isDisabled(), 'Invalid/revoked invitation permits submission');
    verify(await page.locator('#recipient-note').isHidden(), 'Revoked invitation displays a stale name');
    const previousLookups = lookupCount;
    await page.goto('http://127.0.0.1:8000/?recipient-test=generic');
    await page.locator('body.ready').waitFor();
    verify(await page.locator('#invitation-recipient').isHidden(), 'Shared link displays a personal name');
    verify(lookupCount === previousLookups && writes === 0, 'Page lookup submitted a response');
    verify(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'Name/token persisted in storage');
    verify(scriptErrors.length === 0, scriptErrors.join('; '));
    await page.unrouteAll();
    return {recipient:'Letter and form at 320/1440; waiting/failure/retry/revocation; names rendered as text; no public lookup without token', writes, scriptErrors};
}
