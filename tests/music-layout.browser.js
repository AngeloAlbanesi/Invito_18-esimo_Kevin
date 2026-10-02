async (page) => {
    const scriptErrors = [];
    const verifiedWidths = [];
    page.on('pageerror', (error) => scriptErrors.push(error.message));
    await page.route('**/assets/invitation.css', (route) => route.continue());
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const dimensions of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
    ]) {
        await page.setViewportSize(dimensions);
        await page.goto('http://127.0.0.1:8000/');
        await page.locator('body.ready').waitFor();
        await page.getByRole('button', { name: 'Apri l’invito' }).click();
        await page.locator('body[data-state="opened"]').waitFor();
        const musicButton = page.getByRole('button', { name: 'Musica di sottofondo' });
        await musicButton.scrollIntoViewIfNeeded();
        const layout = await musicButton.evaluate((button) => {
            const bounds = button.getBoundingClientRect();
            const letter = document.getElementById('invitation');
            const letterBounds = letter.getBoundingClientRect();
            const emblemBounds = letter.querySelector('.crew-emblem').getBoundingClientRect();
            return {
                insideLetter: letter.contains(button) && bounds.left >= letterBounds.left
                    && bounds.right <= letterBounds.right && bounds.top >= letterBounds.top
                    && bounds.bottom <= letterBounds.bottom,
                visible: bounds.top >= 0 && bounds.bottom <= innerHeight
                    && document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === button,
                noOverlap: bounds.bottom <= emblemBounds.top,
                touchSize: bounds.height >= 44,
                top: bounds.top,
                scroll: scrollY,
            };
        });
        if (!layout.insideLetter || !layout.visible || !layout.noOverlap || !layout.touchSize) {
            throw new Error(`Music button layout failed at ${dimensions.width}px: ${JSON.stringify(layout)}`);
        }
        await page.screenshot({ path: `output/playwright/music-layout-${dimensions.width}.png` });
        await page.evaluate(() => window.scrollBy(0, 200));
        const scrollLayout = await musicButton.evaluate((button) => ({ top: button.getBoundingClientRect().top, scroll: scrollY }));
        if (scrollLayout.scroll - layout.scroll < 50
            || Math.abs((scrollLayout.top - layout.top) + (scrollLayout.scroll - layout.scroll)) > 1) {
            throw new Error(`Music button stayed fixed to the viewport at ${dimensions.width}px`);
        }
        await musicButton.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => !document.getElementById('background-music').paused);
        await musicButton.click();
        await page.waitForFunction(() => document.getElementById('background-music').paused
            && document.getElementById('music-toggle').getAttribute('aria-pressed') === 'false');
        await musicButton.click();
        await page.waitForFunction(() => !document.getElementById('background-music').paused
            && document.getElementById('music-toggle').getAttribute('aria-pressed') === 'true');
        await musicButton.click();
        verifiedWidths.push(dimensions.width);
    }
    if (scriptErrors.length) throw new Error(scriptErrors.join('; '));
    await page.unroute('**/assets/invitation.css');
    return { verifiedWidths, insideLetter: 'OK', scroll: 'OK', pauseResume: 'OK', scriptErrors };
}
