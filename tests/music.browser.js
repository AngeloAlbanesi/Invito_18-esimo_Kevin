async (page) => {
    const scriptErrors = [];
    page.on('pageerror', (error) => scriptErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:8000/');
    await page.locator('body.ready').waitFor();
    const firstTrack = 'we-did-it-party-one-piece-ost-320k_FSQmelMw.mp3';
    const secondTrack = 'to-the-grand-line-one-piece-ost-320k_9UMmntTG.mp3';

    if (!await page.locator('#background-music').evaluate((audio) => audio.paused)) {
        throw new Error('Music started before opening the invitation');
    }
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await verifyPlaying(firstTrack);
    await page.locator('body[data-state="opened"]').waitFor();
    await page.getByRole('button', { name: 'Musica di sottofondo' }).click();
    await page.waitForFunction(() => document.getElementById('background-music').paused
        && document.getElementById('music-toggle').getAttribute('aria-pressed') === 'false');
    if (await page.locator('#music-toggle').getAttribute('aria-pressed') !== 'false') {
        throw new Error('Pause button state is incorrect');
    }
    const pausedTime = await page.locator('#background-music').evaluate((audio) => audio.currentTime);
    await page.getByRole('button', { name: 'Musica di sottofondo' }).focus();
    await page.keyboard.press('Enter');
    await verifyPlaying(firstTrack);
    if (await page.locator('#background-music').evaluate((audio) => audio.currentTime) < pausedTime) {
        throw new Error('Resume restarted the track');
    }

    await page.locator('#background-music').evaluate((audio) => {
        audio.defaultPlaybackRate = 16;
        audio.playbackRate = 16;
    });
    for (const nextTrack of [secondTrack, firstTrack]) {
        await verifyPlaying(nextTrack);
    }
    await page.locator('#background-music').evaluate((audio) => {
        audio.defaultPlaybackRate = 1;
        audio.playbackRate = 1;
    });

    await page.setViewportSize({ width: 320, height: 568 });
    const buttonIsVisible = await page.locator('#music-toggle').evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth
            && bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.height >= 44;
    });
    if (!buttonIsVisible) throw new Error('Music button is clipped on mobile');
    await page.screenshot({ path: 'output/playwright/music-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Musica di sottofondo' }).click();

    await page.addInitScript(() => {
        const nativePlay = HTMLMediaElement.prototype.play;
        let blockFirstPlay = true;
        HTMLMediaElement.prototype.play = function () {
            if (blockFirstPlay) {
                blockFirstPlay = false;
                return Promise.reject(new DOMException('Simulated autoplay block', 'NotAllowedError'));
            }
            return nativePlay.call(this);
        };
    });
    await page.reload();
    await page.locator('body.ready').waitFor();
    await page.getByRole('button', { name: 'Apri l’invito' }).click();
    await page.locator('body[data-state="opened"]').waitFor();
    if (await page.locator('#music-toggle').textContent() !== 'Attiva musica') {
        throw new Error('Blocked playback has no retry control');
    }
    await page.getByRole('button', { name: 'Musica di sottofondo' }).click();
    await verifyPlaying(firstTrack);
    await page.getByRole('button', { name: 'Musica di sottofondo' }).click();
    if (scriptErrors.length) throw new Error(scriptErrors.join('; '));
    return { order: 'We Did It! Party → To the Grand Line → We Did It! Party', pauseResume: 'OK', blockedPlaybackRetry: 'OK', mobile: 'OK', scriptErrors };

    async function verifyPlaying(trackName) {
        await page.waitForFunction((expectedTrack) => {
            const audio = document.getElementById('background-music');
            return audio.currentSrc.endsWith(expectedTrack) && !audio.paused
                && audio.readyState >= 3 && audio.currentTime > 0
                && document.getElementById('music-toggle').getAttribute('aria-pressed') === 'true';
        }, trackName);
    }
}
