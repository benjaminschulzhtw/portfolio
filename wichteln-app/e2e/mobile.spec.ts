import {
  LONG_NAME,
  expect,
  expectAboveFold,
  expectNoHorizontalScroll,
  tapAt,
  test,
} from './fixture';

const GIVER = 'Testi Tanne';
/** Zufällige Teile (Schnee, Sterne, Schlitten) für stabile Screenshot-Vergleiche ausblenden. */
const HIDE_RANDOM =
  'app-sky, .sleigh, .snowball, .splat { display: none !important; } html { background: #0d1838 !important; }';

test.describe('Mobile-Ansicht', () => {
  test('Startansicht: Geschenk ohne Scrollen sichtbar, kein Querscrollen', async ({
    page,
    codeFor,
  }) => {
    await page.goto(`/#${codeFor(GIVER)}`);
    await expect(page.locator('.gift')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAboveFold(page, '.gift');
    await expectAboveFold(page, '.hits');
    await expectAboveFold(page, '.tap-hint');
    await expect(page.locator('.tap-hint')).toHaveText('Tippe auf das Geschenk');
    await page.addStyleTag({ content: HIDE_RANDOM });
    await expect(page).toHaveScreenshot('start.png');
  });

  test('alle Bedienelemente mindestens 44 × 44 px', async ({ page, codeFor }) => {
    await page.goto(`/#${codeFor(GIVER)}`);
    await expect(page.locator('.gift')).toBeVisible();
    for (const btn of await page.locator('button, a[href]').all()) {
      const box = (await btn.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('Viewport-Meta mit viewport-fit=cover, kein Tap-Highlight', async ({ page, codeFor }) => {
    await page.goto(`/#${codeFor(GIVER)}`);
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    );
    const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);
    expect(touchAction).toBe('manipulation');
  });

  test('Wischen löst keinen Wurf aus', async ({ page, codeFor }) => {
    await page.goto(`/#${codeFor(GIVER)}`);
    const btn = page.locator('.gift');
    await expect(btn).toBeVisible();
    const box = (await btn.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const thrown = await page.evaluate(
      async ({ cx, cy }) => {
        let balls = 0;
        new MutationObserver((m) =>
          m.forEach((r) =>
            r.addedNodes.forEach((n) => (balls += +(n as Element).classList?.contains('snowball'))),
          ),
        ).observe(document.body, { childList: true });
        const fire = (type: string, y: number) =>
          document
            .elementFromPoint(cx, cy)!
            .dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                pointerId: 7,
                isPrimary: true,
                pointerType: 'touch',
                clientX: cx,
                clientY: y,
              }),
            );
        fire('pointerdown', cy);
        fire('pointermove', cy - 30);
        fire('pointermove', cy - 80);
        fire('pointerup', cy - 80);
        await new Promise((r) => setTimeout(r, 600));
        return balls;
      },
      { cx, cy },
    );
    expect(thrown).toBe(0);
    await expect(page.locator('.hit.used')).toHaveCount(0);
  });

  test('drei Treffer rütteln das Geschenk auf, langer Name sprengt das Layout nicht', async ({
    page,
    codeFor,
  }, info) => {
    const touch = !!info.project.use.hasTouch;
    await page.goto(`/#${codeFor(GIVER)}`);
    for (let i = 1; i <= 3; i++) {
      const btn = page.locator('.gift');
      await expect(btn).toBeVisible();
      // auf das Ende der Rüttel-Animation warten
      await page.waitForTimeout(450);
      const box = (await btn.boundingBox())!;
      await tapAt(page, box.x + box.width / 2, box.y + box.height / 2, touch);
      if (i < 3) await expect(page.locator('.hit.used')).toHaveCount(i);
    }
    // kein zweiter Screen: der Goblin springt mit dem Schild aus dem Geschenk
    await expect(page.locator('.sign-name')).toHaveText(LONG_NAME, { timeout: 15_000 });
    await expect(page.locator('.sign-hello')).toHaveText('Du wichtelst für:');
    // Ende der Sprung-Animation abwarten, danach ist der leere Karton weg
    await page.waitForFunction(
      () => document.querySelector('.goblin')!.getAnimations().length === 0,
    );
    await expect(page.locator('.scene.popped')).toBeVisible();
    await page.waitForTimeout(600);
    await expectNoHorizontalScroll(page);
    await expectAboveFold(page, '.goblin');
    await expectAboveFold(page, '.sign');
    await page.addStyleTag({ content: HIDE_RANDOM });
    await expect(page).toHaveScreenshot('revealed.png');
  });

  test('keine Emojis im sichtbaren Text', async ({ page, codeFor }) => {
    await page.goto(`/#${codeFor(GIVER)}`);
    await expect(page.locator('.gift')).toBeVisible();
    const text = await page.evaluate(() => document.body.innerText + document.title);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test('Fehlvorlage: ungültiger und fehlender Code', async ({ page }) => {
    // Code aus dem richtigen Zeichenvorrat, aber kein echtes Los
    await page.goto('/#ZZZZZZZZZZZZ');
    for (let i = 0; i < 3; i++)
      await page
        .locator('.gift')
        .focus()
        .then(() => page.keyboard.press('Enter'));
    await expect(page.getByRole('alert')).toContainText('passt zu keinem Los');
    // Ohne Code bleibt die Startseite stehen; die App selbst liegt unter /wichteln/
    await page.goto('/');
    await expect(page.getByText('Work in Progress')).toBeVisible();
    await expect(page.locator('app-root')).toHaveCount(0);
    await page.goto('/wichteln/');
    await expect(page.getByText('Hier fehlt dein persönlicher Code.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('Weiche auf der Startseite', () => {
  test('ohne Code bleibt die Platzhalterseite stehen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Work in Progress');
    await expect(page.getByText('Work in Progress')).toBeVisible();
    await expect(page.locator('app-root')).toHaveCount(0);
    await expect(page.locator('.loader')).toBeVisible();
  });

  test('mit Code übernimmt die Wichtel-App, Adresse bleibt die Startseite', async ({
    page,
    codeFor,
  }) => {
    await page.goto(`/#${codeFor(GIVER)}`);
    await expect(page).toHaveTitle('Wichteln 2026');
    await expect(page.locator('.gift')).toBeVisible();
    // gleiche Adresse wie im verschickten Link, kein Umweg über /wichteln/
    expect(new URL(page.url()).pathname).toBe('/');
    expect(page.url()).toContain(`#${codeFor(GIVER)}`);
    // Platzhalter ist ausgeblendet und fängt keine Tipps mehr ab
    await expect(page.locator('.container')).toBeHidden();
  });
});

test.describe('In-App-Browser (WhatsApp)', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.25.78',
  });

  test('Link mit #code aus WebView öffnen und aufdecken (Tastatur)', async ({
    page,
    codeFor,
  }, info) => {
    test.skip(!info.project.name.startsWith('Pixel'), 'WebView-UA nur in Chromium sinnvoll');
    // Link wird wie aus einem Chat geöffnet: erst leere Seite, dann Navigation mit Fragment
    await page.goto('about:blank');
    await page.evaluate(
      (url) => (location.href = url),
      `${info.project.use.baseURL}/#${codeFor(GIVER)}`,
    );
    await expect(page.locator('.gift')).toBeVisible();
    for (let i = 0; i < 3; i++)
      await page
        .locator('.gift')
        .focus()
        .then(() => page.keyboard.press('Enter'));
    await expect(page.locator('.sign-name')).toHaveText(LONG_NAME, { timeout: 15_000 });
  });
});
