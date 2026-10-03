async (page) => {
    await page.unrouteAll();
    const scriptErrors = [];
    const missingAssets = [];
    page.on('pageerror', error => scriptErrors.push(error.message));
    page.on('response', response => {
        if (response.url().includes('/assets/') && response.status() >= 400) missingAssets.push(response.url());
    });
    await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
    });
    await page.emulateMedia({reducedMotion: 'reduce'});
    const site = 'https://invito-kevin-18.pages.dev';
    for (const width of [320, 1440]) {
        await page.setViewportSize({width, height: 900});
        const response = await page.goto(site + '/?width=' + width);
        if (response.status() !== 200) throw new Error('Site unavailable');
        const headers = response.headers();
        if (headers['x-frame-options'] !== 'DENY' || headers['referrer-policy'] !== 'no-referrer'
            || headers['x-content-type-options'] !== 'nosniff'
            || !headers['content-security-policy'].includes("frame-ancestors 'none'")
            || headers['content-security-policy'].includes('unsafe-')) throw new Error('Security headers missing');
        await page.locator('body.ready').waitFor();
        await page.getByRole('button', {name: 'Apri l’invito'}).click();
        await page.locator('body[data-state="opened"]').waitFor();
        await page.locator('#rsvp-open').click();
        if (!await page.locator('#rsvp-submit').isDisabled()) throw new Error('Shared URL can submit');
        if (!(await page.locator('#preview-note').textContent()).includes('link personale')) throw new Error('Personal link instructions missing');
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error('Production overflows');
        if (!await page.evaluate(() => window.cspViolations.length === 0)) throw new Error('Production CSP violation');
        await page.keyboard.press('Escape');
        await page.screenshot({path: `output/playwright/production-${width}.png`, fullPage: true});
    }
    const blockedFrames = [];
    page.on('console', message => {
        if (/frame-ancestors|X-Frame-Options/.test(message.text())) blockedFrames.push(message.text());
    });
    await page.route('http://127.0.0.1:8000/iframe-test.html', route => route.fulfill({contentType: 'text/html', body: '<iframe src="' + site + '/"></iframe>'}));
    await page.goto('http://127.0.0.1:8000/iframe-test.html');
    await page.waitForTimeout(1500);
    if (!blockedFrames.length) throw new Error('No evidence of blocked embedding');
    await page.unrouteAll();
    if (scriptErrors.length || missingAssets.length) throw new Error(JSON.stringify({scriptErrors,missingAssets}));
    return {production: '320/1440px, actual headers, no shared-link submission, no CSP violations', iframe: 'Embedding blocked by browser', scriptErrors, missingAssets};
}
