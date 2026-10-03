async (page) => {
    const verify = (condition, message) => { if (!condition) throw new Error(message); };
    await page.unrouteAll();
    await page.addInitScript(() => {
        window.confirm = () => true;
        window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
    });
    const scriptErrors = [];
    page.on('pageerror', error => scriptErrors.push(error.message));
    const invitations = [];
    const accepted = [{invitation_id:'11111111-1111-4111-8111-111111111111',
        first_name:'<img src=x onerror=alert(1)>',last_name:'Presente',created_at:'2026-10-03T16:00:00Z'}];
    const requests = [];
    await page.route('**/auth/v1/**', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:8000' },
            body: JSON.stringify({access_token: 'simulated-session', refresh_token: 'simulated-refresh', expires_in: 3600}) });
    });
    await page.route('**/functions/v1/invitations', async route => {
        const payload = route.request().postDataJSON();
        requests.push(payload);
        if (payload.action === 'create') invitations.push({id: payload.invitationId,
            first_name: payload.firstName, last_name: payload.lastName, revoked_at: null});
        if (payload.action === 'revoke') invitations[0].revoked_at = '2026-10-03T00:00:00Z';
        if (payload.action === 'rotate') invitations[0].revoked_at = null;
        if (payload.action === 'delete') accepted.splice(0);
        const remainingAccepted = payload.cursor ? accepted.filter(person => person.invitation_id > payload.cursor) : accepted;
        const acceptedPage = remainingAccepted.slice(0, 100);
        const result = payload.action === 'list' ? {invitations, nextCursor: null}
            : payload.action === 'accepted' ? {accepted:acceptedPage, total:remainingAccepted.length,
                nextCursor:acceptedPage.length === 100 ? acceptedPage[99].invitation_id : null}
            : {ok: true, ...(['create', 'rotate'].includes(payload.action) ? {link: 'https://invito.example/#invito=' + 'A'.repeat(43)} : {})};
        await route.fulfill({status: 200, contentType: 'application/json',
            headers: {'Access-Control-Allow-Origin': 'http://127.0.0.1:8000'}, body: JSON.stringify(result)});
    });
    for (const width of [320, 1440]) {
        await page.setViewportSize({width, height: 900});
        await page.goto('http://127.0.0.1:8000/admin.html?width=' + width);
        verify(await page.locator('#private-panel').isHidden(), 'Panel visible before authentication');
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin layout overflows');
    }
    await page.getByLabel('Email', {exact: true}).fill('organizer@example.invalid');
    await page.getByLabel('Password', {exact: true}).fill('simulated-password');
    await page.getByRole('button', {name: 'Accedi', exact: true}).click();
    await page.locator('#private-panel').waitFor({state: 'visible'});
    verify(await page.locator('#accepted-total').textContent() === '1', 'Accepted count absent');
    verify(await page.locator('#accepted-list li').count() === 1, 'Accepted person absent');
    verify(await page.locator('#accepted-list img').count() === 0, 'Confirmed name interpreted as HTML');
    for (const width of [320, 1440]) {
        await page.setViewportSize({width,height:900});
        verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dashboard overflows');
        await page.screenshot({path:'output/playwright/admin-dashboard-'+width+'.png',fullPage:true});
    }
    await page.evaluate(() => { window.confirm = () => false; });
    await page.getByRole('button',{name:/Elimina persona:/}).click();
    verify(!requests.some(request => request.action === 'delete'), 'Cancelled deletion reached backend');
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button',{name:/Elimina persona:/}).click();
    await page.locator('#accepted-empty').waitFor({state:'visible'});
    verify(await page.locator('#accepted-total').textContent() === '0', 'Deletion retained accepted count');
    verify(await page.locator('#accepted-list li').count() === 0, 'Deleted person remains in dashboard');
    verify(requests.filter(request => request.action === 'delete').length === 1, 'Deletion duplicated');
    for (let index = 0; index < 101; index += 1) accepted.push({
        invitation_id: String(index).padStart(8, '0') + '-1111-4111-8111-111111111111',
        first_name:'Persona',last_name:String(index),created_at:'2026-10-03T16:00:00Z',
    });
    await page.getByRole('button',{name:'Aggiorna presenze',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#accepted-list li').length === 100);
    verify(await page.locator('#accepted-total').textContent() === '101', 'Total limited to first page');
    await page.getByRole('button',{name:'Carica altre presenze',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('#accepted-list li').length === 101);
    verify(await page.locator('#accepted-total').textContent() === '101', 'Pagination changed total');
    verify(await page.locator('#more-accepted').isHidden(), 'Pagination did not finish');
    accepted.splice(0);
    await page.getByRole('button',{name:'Aggiorna presenze',exact:true}).click();
    await page.locator('#accepted-empty').waitFor({state:'visible'});
    await page.getByLabel('Nome', {exact: true}).fill('   ');
    await page.getByLabel('Cognome', {exact: true}).fill('Fittizio');
    await page.getByRole('button', {name: 'Crea link', exact: true}).click();
    verify(!requests.some(request => request.action === 'create'), 'Whitespace-only name sent');
    await page.getByLabel('Nome', {exact: true}).fill('<img src=x onerror=alert(1)>');
    await page.getByLabel('Cognome', {exact: true}).fill('Fittizio');
    await page.getByRole('button', {name: 'Crea link', exact: true}).click();
    await page.locator('#new-link').waitFor({state: 'visible'});
    verify((await page.locator('#invitation-link').inputValue()).includes('/#invito='), 'Personal link absent');
    verify(await page.locator('#invitation-list img').count() === 0, 'Guest name interpreted as HTML');
    await page.getByRole('button', {name: 'Revoca', exact: true}).click();
    await page.getByText(/· revocato/).waitFor();
    await page.getByRole('button', {name: 'Sostituisci link', exact: true}).click();
    await page.getByText(/· attivo/).waitFor();
    verify(requests.some(request => request.action === 'rotate'), 'Link rotation absent');
    verify(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'Session or links stored in browser');
    verify(await page.evaluate(() => window.cspViolations.length === 0), 'Admin CSP violation');
    await page.screenshot({path: 'output/playwright/admin-panel.png', fullPage: true});
    await page.getByRole('button', {name: 'Esci', exact: true}).click();
    await page.locator('#login-form').waitFor({state: 'visible'});
    verify(await page.locator('#invitation-link').inputValue() === '', 'Logout retained private link');
    verify(await page.locator('#accepted-list li').count() === 0, 'Logout retained confirmed guests');
    await page.goto('http://127.0.0.1:8000/admin.html#token_hash=simulated-activation&type=invite');
    await page.locator('#activate-form').waitFor({state: 'visible'});
    verify(!page.url().includes('#'), 'Activation token retained in URL');
    verify(scriptErrors.length === 0, scriptErrors.join('; '));
    await page.unrouteAll();
    return {admin: 'Dashboard count, 101-person pagination, cancelled/confirmed deletion, login, escaped names, revocation, rotation, logout and activation verified with simulated Auth/API responses', storage: 'empty', csp: 'OK', scriptErrors};
}
