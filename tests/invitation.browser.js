async (page) => {
    const verify = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const scriptErrors = [];
    const missingAssets = [];
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
        { width: 1440, height: 900 },
    ]) {
        await page.setViewportSize(dimensions);
        await page.goto('http://127.0.0.1:8000/');
        await page.locator('body.ready').waitFor();
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Intro overflows horizontally');
        const envelope = page.getByRole('button', { name: 'Apri l’invito' });
        await envelope.focus();
        await page.keyboard.press('Enter');
        await page.evaluate(() => document.getElementById('open-invitation').click());
        verify(await page.locator('.petal').count() <= 16, 'Duplicate opening created too many petals');
        await page.locator('body[data-state="opened"]').waitFor();
        verify(await page.evaluate(() => document.activeElement.id === 'event-name'), 'Opening did not move focus');
        verify(await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'), 'Scroll stayed locked');
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Invitation overflows horizontally');
        verify(await page.getByRole('navigation').getByRole('link').count() === 1, 'Wrong number of links');
        verify(await page.getByRole('navigation').getByRole('button').count() === 1, 'Wrong number of action buttons');
        const mapDestination = await page.getByRole('link', { name: 'Location' }).evaluate((element) => new URL(element.href).searchParams.get('query'));
        verify(mapDestination === 'La Fornace, SP40, 64042 Colledara TE', 'Wrong map destination');
        await page.getByRole('button', { name: 'Conferma presenza', exact: true }).click();
        verify(await page.evaluate(() => document.activeElement.id === 'first-name'), 'Form did not focus the name');
        verify(await page.evaluate(() => document.getElementById('rsvp-dialog').scrollWidth <= document.getElementById('rsvp-dialog').clientWidth), 'Dialog overflows horizontally');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Shift+Tab');
        verify(await page.evaluate(() => document.getElementById('rsvp-dialog').contains(document.activeElement)), 'Focus escaped the dialog');
        await page.keyboard.press('Escape');
        verify(await page.evaluate(() => document.activeElement.id === 'rsvp-open'), 'Escape did not restore focus');
        await page.waitForFunction(() => document.querySelectorAll('.petal').length === 0);
        await page.screenshot({ path: `output/playwright/invitation-${dimensions.width}.png`, fullPage: true });
        console.log(`Layout and keyboard: ${dimensions.width} × ${dimensions.height} OK`);
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
    verify(await page.locator('.petal').count() === 0, 'Reduced motion created particles');
    await page.getByRole('button', { name: 'Conferma presenza', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Verifica');
    await page.getByRole('textbox', { name: 'Cognome', exact: true }).fill('Simulata');
    await page.getByRole('radio', { name: 'Sì, ci sarò' }).check();
    await page.getByRole('checkbox', { name: /Vorrei segnalare/ }).check();
    await page.getByRole('textbox', { name: 'Quali allergie o intolleranze?' }).fill('TEST: dato fittizio');
    verify(await page.locator('#allergy-consent').evaluate((element) => element.required), 'Consent is not required');
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
            status: firstAttempt ? 503 : 200,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(firstAttempt ? { error: 'Errore simulato: riprova.' } : { ok: true }),
        });
    });
    await page.getByRole('button', { name: 'Invia la mia risposta' }).click();
    await page.evaluate(() => document.getElementById('rsvp-form').dispatchEvent(new Event('submit', { cancelable: true })));
    await page.getByRole('button', { name: 'Riprova invio' }).waitFor();
    verify(submissions.length === 1, 'Repeated submit made duplicate requests');
    verify(await page.locator('#rsvp-success').isHidden(), 'Failure showed a fake success');
    verify(await page.getByRole('textbox', { name: 'Nome', exact: true }).inputValue() === 'Verifica', 'Failure cleared form data');
    verify(await page.getByRole('textbox', { name: 'Nome', exact: true }).isDisabled(), 'Uncertain request can be edited before retry');
    await page.getByRole('button', { name: 'Riprova invio' }).click();
    await page.getByRole('heading', { name: 'Risposta ricevuta' }).waitFor();
    verify(submissions.length === 2 && submissions[0].requestId === submissions[1].requestId, 'Retry changed the request ID');
    verify(JSON.stringify(submissions[0]) === JSON.stringify(submissions[1]), 'Retry changed the submitted data');
    verify(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'Guest data was saved in browser storage');
    await page.unroute('**/functions/v1/rsvp');
    await page.getByRole('button', { name: 'Torna all’invito' }).click();

    await page.route('**/assets/images/invitation-scene.jpg', (route) => route.abort());
    await page.reload();
    await page.locator('body.ready.scene-unavailable').waitFor();
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await page.locator('body[data-state="opened"]').waitFor();
    verify(await page.getByRole('button', { name: 'Conferma presenza', exact: true }).isVisible(), 'Missing background blocked the invitation');
    await page.unroute('**/assets/images/invitation-scene.jpg');
    verify(scriptErrors.length === 0, 'JavaScript errors: ' + scriptErrors.join('; '));
    verify(missingAssets.length === 0, 'Missing assets: ' + missingAssets.join('; '));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    console.log('Countdown, reduced motion, missing-image fallback and simulated RSVP retry: OK');
}
