async (page) => {
    const verify = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const scriptErrors = [];
    const missingAssets = [];
    const verifiedLayouts = [];
    await page.unrouteAll();
    await page.route('**/assets/site-config.js', route => route.fulfill({contentType: 'text/javascript', body: 'const PUBLIC_SITE_CONFIG = Object.freeze({turnstileSiteKey:"simulated-site",rsvpEndpoint:"https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp",supabasePublishableKey:"sb_publishable_fixture"});'}));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({contentType: 'text/javascript', body: 'let sequence=0; let callbacks; window.turnstile={remove(){},render(selector,options){callbacks=options; return "fixture";},execute(){callbacks.callback("simulated-challenge-"+(++sequence));}};'}));

    await page.addInitScript(() => { window.cspViolations = []; document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective)); });
    page.on('pageerror', (error) => scriptErrors.push(error.message));
    page.on('response', (response) => {
        if (response.url().includes('/assets/') && response.status() >= 400) missingAssets.push(response.url());
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const dimensions of [
        { width: 320, height: 568 },
        { width: 360, height: 740 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 },
        { width: 1440, height: 900 },
    ]) {
        await page.setViewportSize(dimensions);
        await page.goto('http://127.0.0.1:8000/?security-test=invitation.browser&width=' + dimensions.width + '#invito=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await page.locator('body.ready').waitFor();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.envelope')).opacity === '1'
            && getComputedStyle(document.querySelector('.intro')).opacity === '1');
        verify(await page.locator('#scenery').evaluate((element) => element.naturalWidth > 0), 'Ocean illustration did not load');
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Intro overflows horizontally');
        verify(await envelopeIsInsideViewport(page), 'Envelope is clipped by the viewport');
        await page.screenshot({ path: `output/playwright/intro-${dimensions.width}.png` });
        const envelope = page.getByRole('button', { name: 'Apri l’invito' });
        await envelope.focus();
        await page.keyboard.press('Enter');
        await page.locator('#open-invitation').dispatchEvent('click');
        verify(await page.locator('.paper-fragment').count() === 16, 'Repeated opening did not create exactly one batch of fragments');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.envelope-flap')).transform.startsWith('matrix3d'));
        await page.locator('body[data-state="opened"]').waitFor();
        verify(await page.evaluate(() => document.activeElement.id === 'event-name'), 'Opening did not move focus');
        verify(await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'), 'Scroll stayed locked');
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Invitation overflows horizontally');
        verify(await page.getByRole('navigation').getByRole('link').count() === 1, 'Wrong number of links');
        verify(await page.getByRole('navigation').getByRole('button').count() === 1, 'Wrong number of action buttons');
        const mapDestination = await page.getByRole('link', { name: 'Location' }).evaluate((element) => new URL(element.href).searchParams.get('query'));
        verify(mapDestination === 'La Fornace, SP40, 64042 Colledara TE', 'Wrong map destination');
        await page.getByRole('button', { name: 'Conferma presenza', exact: true }).click();
        verify(await page.evaluate(() => document.activeElement.name === 'attending'), 'Form did not focus attendance');
        verify(await page.evaluate(() => document.getElementById('rsvp-dialog').scrollWidth <= document.getElementById('rsvp-dialog').clientWidth), 'Dialog overflows horizontally');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Shift+Tab');
        verify(await page.evaluate(() => document.getElementById('rsvp-dialog').contains(document.activeElement)), 'Focus escaped the dialog');
        await page.keyboard.press('Escape');
        verify(await page.evaluate(() => document.activeElement.id === 'rsvp-open'), 'Escape did not restore focus');
        await page.waitForFunction(() => document.querySelectorAll('.paper-fragment').length === 0);
        await page.screenshot({ path: `output/playwright/invitation-${dimensions.width}.png`, fullPage: true });
        verifiedLayouts.push(`${dimensions.width} × ${dimensions.height}`);
    }

    const countdownChecks = await page.evaluate(() => {
        const timestamp = '2026-11-28T20:30:00+01:00';
        return {
            missing: calculateCountdown(null),
            invalid: calculateCountdown('2026-02-30T20:30:00+01:00'),
            ambiguous: calculateCountdown('28/11/2026'),
            noOffset: calculateCountdown('2026-11-28T20:30:00'),
            future: calculateCountdown(timestamp, Date.parse(timestamp) - 90061000),
            ended: calculateCountdown(timestamp, Date.parse(timestamp) + 1000),
        };
    });
    verify(countdownChecks.missing === null && countdownChecks.invalid === null
        && countdownChecks.ambiguous === null && countdownChecks.noOffset === null, 'Invalid countdown was accepted');
    verify(JSON.stringify(countdownChecks.future) === JSON.stringify({ days: 1, hours: 1, minutes: 1, seconds: 1, ended: false }), 'Countdown calculation failed');
    verify(countdownChecks.ended.ended && countdownChecks.ended.days === 0 && countdownChecks.ended.seconds === 0, 'Countdown went below zero');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.locator('body.ready').waitFor();
    await page.getByRole('button', { name: 'Apri l’invito' }).focus();
    await page.keyboard.press('Space');
    await page.locator('body[data-state="opened"]').waitFor();
    verify(await page.locator('.paper-fragment').count() === 0, 'Reduced motion created particles');
    await page.getByRole('button', { name: 'Conferma presenza', exact: true }).click();
    await page.getByRole('radio', { name: 'Sì, ci sarò' }).check();
    await page.getByRole('checkbox', { name: /Vorrei segnalare/ }).check();
    await page.getByRole('textbox', { name: 'Quali allergie o intolleranze?' }).fill('TEST: dato fittizio');
    verify(await page.locator('#allergy-consent').evaluate((element) => element.required), 'Consent is not required');
    verify(await page.locator('#rsvp-form').evaluate((element) => !element.checkValidity()), 'Allergy details without consent are accepted');
    await page.getByRole('checkbox', { name: /Acconsento/ }).check();
    await page.screenshot({ path: 'output/playwright/form-mobile.png' });

    const submissions = [];
    await page.route('**/functions/v1/rsvp', async (route) => {
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' } });
            return;
        }
        submissions.push(route.request().postDataJSON());
        await page.waitForTimeout(200);
        const firstAttempt = submissions.length === 1;
        await route.fulfill({
            status: firstAttempt ? 503 : submissions.length === 2 ? 201 : 200,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(firstAttempt ? { error: 'Errore simulato: riprova.' } : { ok: true }),
        });
    });
    await page.getByRole('button', { name: 'Invia la mia risposta' }).click();
    verify(await page.locator('#rsvp-submit').getAttribute('aria-busy') === 'true', 'Sending state is missing');
    await page.evaluate(() => document.getElementById('rsvp-form').dispatchEvent(new Event('submit', { cancelable: true })));
    await page.getByRole('button', { name: 'Riprova invio' }).waitFor();
    verify(submissions.length === 1, 'Repeated submit made duplicate requests');
    verify(await page.locator('#rsvp-success').isHidden(), 'Failure showed a fake success');
    await page.getByRole('button', { name: 'Riprova invio' }).click();
    await page.getByRole('button', { name: 'Riprova invio' }).waitFor();
    verify(await page.locator('#rsvp-success').isHidden(), 'HTTP 201 showed success');
    await page.getByRole('button', { name: 'Riprova invio' }).click();
    await page.getByRole('heading', { name: 'Risposta ricevuta' }).waitFor();
    verify(submissions.length === 3 && submissions[0].requestId === submissions[1].requestId, 'Retry changed the request ID');
    const {turnstileToken: firstChallenge, ...firstPayload} = submissions[0];
    const {turnstileToken: secondChallenge, ...secondPayload} = submissions[1];
    verify(firstChallenge !== secondChallenge, 'Retry reused the challenge');
    verify(JSON.stringify(firstPayload) === JSON.stringify(secondPayload), 'Retry changed RSVP data');
    verify(await page.locator('#allergy-text').isDisabled(), 'Uncertain request can be edited');
    verify(await page.locator('#rsvp-submit').getAttribute('aria-busy') === null, 'Sending state did not finish');
    await page.screenshot({ path: 'output/playwright/rsvp-success-mobile.png' });
    verify(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'Guest data was saved in browser storage');
    await page.unroute('**/functions/v1/rsvp');
    await page.getByRole('button', { name: 'Torna all’invito' }).click();

    await page.reload();
    await page.locator('body.ready').waitFor();
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await page.locator('body[data-state="opened"]').waitFor();
    await page.getByRole('button', { name: 'Conferma presenza', exact: true }).click();
    let declinedSubmission;
    await page.route('**/functions/v1/rsvp', async (route) => {
        declinedSubmission = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
    });
    await page.getByRole('button', { name: 'Invia la mia risposta' }).click();
    verify(declinedSubmission === undefined, 'Empty form sent a request');
    await page.getByRole('radio', { name: 'Sì, ci sarò' }).check();
    await page.getByRole('checkbox', { name: /Vorrei segnalare/ }).check();
    await page.getByRole('textbox', { name: 'Quali allergie o intolleranze?' }).fill('Non deve essere inviato');
    await page.getByRole('radio', { name: 'Non potrò esserci' }).check();
    verify(await page.locator('#allergies-section').isHidden(), 'Declining attendance still shows allergy fields');
    await page.getByRole('button', { name: 'Invia la mia risposta' }).click();
    await page.getByRole('heading', { name: 'Risposta ricevuta' }).waitFor();
    verify(declinedSubmission.attending === false && declinedSubmission.allergies === '' && declinedSubmission.allergyConsent === false, 'Declining attendance sent allergy details');
    verify(!('firstName' in declinedSubmission) && !('lastName' in declinedSubmission), 'Browser sent an identity');
    await page.unroute('**/functions/v1/rsvp');
    await page.getByRole('button', { name: 'Torna all’invito' }).click();

    await page.route('**/assets/images/**', (route) => route.abort());
    await page.reload();
    await page.locator('body.ready.scene-unavailable').waitFor();
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await page.locator('body[data-state="opened"]').waitFor();
    await page.getByRole('button', { name: 'Conferma presenza', exact: true }).waitFor({ state: 'visible' });
    await page.unroute('**/assets/images/**');
    verify(await page.evaluate(() => window.cspViolations.length === 0), 'CSP violations detected');
    verify(scriptErrors.length === 0, 'JavaScript errors: ' + scriptErrors.join('; '));
    verify(missingAssets.length === 0, 'Missing assets: ' + missingAssets.join('; '));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    return { verifiedLayouts, scriptErrors, missingAssets, rsvp: 'Required fields, consent, loading, success, decline and retry verified with simulated responses', countdown: 'OK', reducedMotion: 'OK', missingImageFallback: 'OK' };

    async function envelopeIsInsideViewport(browserPage) {
        return browserPage.locator('#open-invitation').evaluate((element) => {
            const rectangle = element.getBoundingClientRect();
            return rectangle.top >= 0 && rectangle.bottom <= innerHeight && rectangle.left >= 0 && rectangle.right <= innerWidth;
        });
    }
}
