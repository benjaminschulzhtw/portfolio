import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURE_DIR = join(__dirname, '.fixture');
export const LONG_NAME = 'Maximiliane-Friederike von Schneeflockenhausen-Lebkuchenstein';

interface Link {
  name: string;
  code: string;
}

export const test = base.extend<{ codeFor: (name: string) => string }>({
  page: async ({ page }, use) => {
    // Testdaten statt der echten public/data/pairs.json ausliefern
    await page.route('**/data/pairs.json', (route) =>
      route.fulfill({ path: join(FIXTURE_DIR, 'pairs.json'), contentType: 'application/json' }),
    );
    await use(page);
  },
  codeFor: async ({}, use) => {
    const links: Link[] = JSON.parse(readFileSync(join(FIXTURE_DIR, 'links.json'), 'utf8'));
    await use((name) => links.find((l) => l.name === name)!.code);
  },
});

export { expect };

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'horizontales Scrollen').toBeLessThanOrEqual(clientWidth);
}

/** Element liegt vollständig im sichtbaren Bereich, ohne zu scrollen. */
export async function expectAboveFold(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  const vp = page.viewportSize()!;
  expect(box, `${selector} sichtbar`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height, `${selector} ohne Scrollen sichtbar`).toBeLessThanOrEqual(vp.height);
}

export async function tapAt(page: Page, x: number, y: number, touch: boolean): Promise<void> {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
