async (page) => {
    const verify = (condition, message) => { if (!condition) throw new Error(message); };
    const bridge = 'http://127.0.0.1:8766';
    const scriptErrors = [];
    page.on('pageerror', error => scriptErrors.push(error.message));
    await page.unrouteAll();
    await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
    });
    const forward = async (route, endpoint) => {
        const response = await page.request.post(bridge + endpoint, {
            headers: {Authorization: route.request().headers().authorization || ''},
            data: route.request().postDataJSON(),
        });
        await route.fulfill({status:response.status(),contentType:'application/json',
            headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8000','Cache-Control':'no-store'},body:await response.text()});
    };
    await page.route('**/functions/v1/rsvp**', route => forward(route, '/rsvp'));
    await page.route('**/functions/v1/invitations', route => forward(route, '/invitations'));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({contentType:'text/javascript',
        body:'let callbacks; window.turnstile={remove(){},render(selector,options){callbacks=options;return "fixture";},execute(){callbacks.callback("simulated-challenge");}};'}));
    try {
        const setupResponse = await page.request.get(bridge + '/setup');
        verify(setupResponse.ok(), 'Live fixture setup failed');
        const credentials = await setupResponse.json();
        for (const marker of ['A','B']) {
            await page.goto('http://127.0.0.1:8000/?live-allergy-test=' + marker + '#invito=' + marker.repeat(43));
            await page.waitForFunction(() => backendReady);
            await page.getByRole('button',{name:'Apri l’invito'}).click();
            await page.locator('body[data-state="opened"]').waitFor();
            await page.locator('#rsvp-open').click();
            await page.locator('input[name="attending"][value="yes"]').check();
            if (marker === 'A') {
                await page.locator('#allergy-toggle').check();
                await page.locator('#allergy-text').fill('TEST: arachidi e lattosio');
                await page.locator('#allergy-consent').check();
            }
            await page.locator('#rsvp-submit').click();
            await page.locator('#rsvp-success').waitFor({state:'visible',timeout:30000});
        }
        verify((await (await page.request.get(bridge + '/inspect')).json()).saved, 'Allergy/consent not saved in real database');
        await page.goto('http://127.0.0.1:8000/admin.html?live-allergy-test');
        await page.getByLabel('Email',{exact:true}).fill(credentials.email);
        await page.getByLabel('Password',{exact:true}).fill(credentials.password);
        await page.getByRole('button',{name:'Accedi',exact:true}).click();
        await page.locator('#private-panel').waitFor({state:'visible',timeout:30000});
        verify(await page.locator('#accepted-total').textContent() === '2','Dashboard total incorrect');
        verify(await page.locator('#accepted-list').textContent().then(text => text.includes('TEST: arachidi e lattosio')), 'Database allergy absent from dashboard');
        verify(await page.locator('#accepted-list').textContent().then(text => text.includes('Nessuna')), 'Empty allergy not labelled');
        for (const width of [320,1440]) {
            await page.setViewportSize({width,height:900});
            verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows');
            verify(await page.locator('#participants-table th').first().evaluate(element => getComputedStyle(element).position === 'sticky'), 'Header not sticky');
            if (width === 320) verify(await page.locator('#participants-table').evaluate(table => table.scrollWidth > table.parentElement.clientWidth), 'Mobile table lacks horizontal scroll');
            await page.screenshot({path:'output/playwright/admin-table-'+width+'.png',fullPage:true});
        }
        await page.locator('#allergy-filter').selectOption('with');
        verify(await page.locator('#accepted-list tr').count() === 1,'Allergy filter incorrect');
        await page.locator('#participant-search').fill('TestSenzaAllergia');
        verify(await page.locator('#accepted-list tr').count() === 0,'Combined search/filter incorrect');
        await page.locator('#allergy-filter').selectOption('without');
        verify(await page.locator('#accepted-list tr').count() === 1,'Search across database rows incorrect');
        await page.evaluate(() => { window.printCalls=0; window.print=()=>{window.printCalls+=1;window.dispatchEvent(new Event('beforeprint'));}; });
        await page.getByRole('button',{name:'Stampa Prenotazioni',exact:true}).click();
        await page.waitForFunction(() => window.printCalls === 1);
        verify(await page.locator('#print-participants tr').count() === 2, 'Print omitted filtered participants');
        verify((await page.locator('#print-participants').textContent()).includes('TEST: arachidi e lattosio'),'Print omitted database allergy');
        verify((await page.locator('#print-generated').textContent()).includes('Generato il'),'Generation date absent');
        await page.emulateMedia({media:'print'});
        verify(await page.locator('#private-panel').isHidden(),'Dashboard visible in print');
        verify(await page.locator('#print-view button').count() === 0,'Print includes controls');
        verify(await page.locator('#print-view table').evaluate(table=>table.scrollWidth <= table.clientWidth),'Print table clipped');
        await page.screenshot({path:'output/playwright/print-reservations.png',fullPage:true});
        await page.pdf({path:'output/playwright/prenotazioni-test.pdf',preferCSSPageSize:true,printBackground:true});
        await page.emulateMedia({media:'screen'});
        await page.getByRole('button',{name:'Esci',exact:true}).click();
        await page.locator('#login-form').waitFor({state:'visible'});
        verify(await page.locator('#accepted-list tr').count() === 0 && await page.locator('#print-participants tr').count() === 0,'Logout retained allergies');
        verify(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0),'Personal data persisted');
        verify(scriptErrors.length === 0,scriptErrors.join('; '));
        verify(await page.evaluate(() => window.cspViolations.length === 0),'CSP violations');
        return {flow:'Browser RSVP → real Supabase save/consent → real Auth/admin handler → allergy table → full filtered-independent print/PDF',layouts:[320,1440],turnstile:'simulated only in local harness',scriptErrors};
    } finally {
        const response = await page.request.get(bridge + '/cleanup');
        verify(response.ok() && (await response.json()).cleaned,'Live fixtures cleanup failed');
        await page.unrouteAll();
    }
}
