import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import type { Pairing } from './crypto/wichtel-crypto';
import { normalizeCode } from './crypto/wichtel-crypto';
import { RevealFailure, WichtelService, type RevealError } from './crypto/wichtel.service';
import { Sky } from './sky/sky';

type Phase = 'missing' | 'play' | 'decrypting' | 'revealed' | 'error';

/** Treffer, die zum Aufdecken nötig sind. */
export const HITS_NEEDED = 3;
/** Ein Tipp, der weiter wandert oder länger dauert, ist ein Wisch/Scroll und kein Wurf. */
const TAP_MAX_MOVE = 10;
const TAP_MAX_MS = 500;
const FLIGHT_MS = 380;

interface PendingTap {
  id: number;
  x: number;
  y: number;
  t: number;
}

@Component({
  selector: 'app-root',
  imports: [Sky, HlmButtonImports],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onPointerDown($event)',
    '(document:pointermove)': 'onPointerMove($event)',
    '(document:pointerup)': 'onPointerUp($event)',
    '(document:pointercancel)': 'tap = null',
    '(window:hashchange)': 'readCode()',
  },
})
export class App {
  private readonly wichtel = inject(WichtelService);
  private readonly gift = viewChild<ElementRef<HTMLElement>>('gift');
  private readonly goblin = viewChild<ElementRef<HTMLElement>>('goblin');
  private readonly sign = viewChild<ElementRef<HTMLElement>>('sign');
  private readonly injector = inject(Injector);

  protected readonly hitsNeeded = HITS_NEEDED;
  protected readonly phase = signal<Phase>('play');
  protected readonly hits = signal(0);
  /** Deckel springt nach dem letzten Treffer auf, kurz bevor entschlüsselt wird. */
  protected readonly opened = signal(false);
  /** Goblin ist draußen: der leere Karton wird ausgeblendet. */
  protected readonly popped = signal(false);
  /** Ab dem höchsten Punkt des Sprungs steht der Goblin vor dem Geschenk. */
  protected readonly front = signal(false);
  /** Goblin-Bild erst nach dem ersten Rendern laden. */
  protected readonly goblinReady = signal(false);
  protected readonly error = signal<RevealError>('invalid');
  protected readonly pairing = signal<Pairing | null>(null);
  /** Geschenk, Zettel und Treffer bleiben vom ersten Wurf bis zum Namen auf derselben Bühne. */
  protected readonly onStage = computed(() =>
    ['play', 'decrypting', 'revealed'].includes(this.phase()),
  );
  protected readonly hitsLeft = computed(() => HITS_NEEDED - this.hits());
  protected readonly hitSlots = computed(() =>
    Array.from({ length: HITS_NEEDED }, (_, i) => i < this.hits()),
  );
  protected readonly giftLabel = computed(() => {
    if (this.phase() !== 'play') return 'Geöffnetes Geschenk';
    return `Geschenk. Noch ${this.hitsLeft()} Treffer mit dem Schneeball, dann geht es auf.`;
  });

  protected tap: PendingTap | null = null;
  private code = '';
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    this.readCode();
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // Bild erst holen, wenn die Seite steht; bis zum Aufdecken ist es dann da
      const load = () => this.goblinReady.set(true);
      const hasIdle = typeof requestIdleCallback === 'function';
      const handle = hasIdle
        ? requestIdleCallback(load, { timeout: 2500 })
        : setTimeout(load, 1500);
      const onResize = () => {
        if (this.phase() !== 'revealed') return;
        this.sizeGoblin();
        this.fitSign();
      };
      addEventListener('resize', onResize, { passive: true });
      destroyRef.onDestroy(() => {
        removeEventListener('resize', onResize);
        if (hasIdle) cancelIdleCallback(handle as number);
        else clearTimeout(handle as ReturnType<typeof setTimeout>);
      });
    });
  }

  protected readCode(): void {
    this.code = normalizeCode(location.hash);
    this.hits.set(0);
    this.opened.set(false);
    this.popped.set(false);
    this.front.set(false);
    this.pairing.set(null);
    if (!this.code) {
      this.phase.set('missing');
      return;
    }
    this.phase.set('play');
    this.wichtel.prefetch().catch(() => {
      /* Fehler wird beim Aufdecken angezeigt */
    });
  }

  // --- Schneeball-Spiel ----------------------------------------------------

  protected onPointerDown(e: PointerEvent): void {
    if (this.phase() !== 'play' || !e.isPrimary || e.button > 0) return;
    this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
  }

  protected onPointerMove(e: PointerEvent): void {
    const tap = this.tap;
    if (
      tap &&
      e.pointerId === tap.id &&
      Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MAX_MOVE
    ) {
      this.tap = null;
    }
  }

  protected onPointerUp(e: PointerEvent): void {
    const tap = this.tap;
    this.tap = null;
    if (!tap || e.pointerId !== tap.id || this.phase() !== 'play') return;
    if (e.timeStamp - tap.t > TAP_MAX_MS) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MAX_MOVE) return;
    this.throwSnowball(e.clientX, e.clientY, e.pointerType !== 'mouse');
  }

  /** Tastatur und Screenreader: Enter/Leertaste zählt direkt als Treffer. */
  protected onGiftClick(e: MouseEvent): void {
    if (e.detail === 0) this.registerHit();
  }

  private throwSnowball(x: number, y: number, touch: boolean): void {
    const w = innerWidth;
    const h = innerHeight;
    // Abwurf vom unteren Rand (Daumenbereich), leicht in Richtung Ziel versetzt
    const ox = w / 2 + (x - w / 2) * 0.35;
    const oy = h + 24;
    const arc = Math.min(120, Math.abs(oy - y) * 0.25);

    const ball = document.createElement('div');
    ball.className = 'snowball';
    document.body.append(ball);
    const at = (px: number, py: number, s: number) =>
      `translate3d(${px - 11}px, ${py - 11}px, 0) scale(${s})`;
    const flight = ball.animate(
      [
        { transform: at(ox, oy, 1.4) },
        { transform: at((ox + x) / 2, (oy + y) / 2 - arc, 1) },
        { transform: at(x, y, 0.7) },
      ],
      { duration: this.reducedMotion ? 1 : FLIGHT_MS, easing: 'cubic-bezier(.2,.6,.4,1)' },
    );
    flight.finished
      .catch(() => {})
      .then(() => {
        ball.remove();
        this.splat(x, y);
        if (this.phase() === 'play' && this.isHit(x, y, touch)) this.registerHit();
      });
  }

  private isHit(x: number, y: number, touch: boolean): boolean {
    const el = this.gift()?.nativeElement;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    // Auf Touch-Geräten ist die Trefferzone großzügiger als die sichtbare Fläche
    const slop = touch ? 18 : 4;
    return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
  }

  private splat(x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'splat';
    el.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0)`;
    document.body.append(el);
    el.animate(
      [
        { opacity: 1, transform: `${el.style.transform} scale(.3)` },
        { opacity: 0.9, transform: `${el.style.transform} scale(1.1)`, offset: 0.3 },
        { opacity: 0, transform: `${el.style.transform} scale(1.3)` },
      ],
      { duration: 550, easing: 'ease-out' },
    )
      .finished.catch(() => {})
      .then(() => el.remove());
  }

  /** Jeder Treffer rüttelt das Geschenk, mit jedem Mal stärker. */
  private registerHit(): void {
    if (this.phase() !== 'play' || this.hits() >= HITS_NEEDED) return;
    const hits = this.hits() + 1;
    this.hits.set(hits);
    navigator.vibrate?.(hits >= HITS_NEEDED ? [30, 40, 30] : 30);
    this.shake(hits);
    if (hits >= HITS_NEEDED) void this.reveal();
  }

  private shake(strength: number): void {
    const body = this.gift()?.nativeElement.querySelector<SVGElement>('.gift-art');
    if (!body) return;
    const a = 4 + strength * 3; // Grad
    const dx = 2 + strength * 2; // px
    body.getAnimations().forEach((anim) => anim.cancel());
    body.animate(
      [
        { transform: 'translate3d(0,0,0) rotate(0) scale(1, 1)' },
        { transform: `translate3d(${-dx}px,0,0) rotate(${-a}deg) scale(1.04, .96)`, offset: 0.15 },
        {
          transform: `translate3d(${dx}px,-${dx}px,0) rotate(${a}deg) scale(.97, 1.04)`,
          offset: 0.35,
        },
        { transform: `translate3d(${-dx / 2}px,0,0) rotate(${-a * 0.6}deg)`, offset: 0.55 },
        { transform: `translate3d(${dx / 2}px,0,0) rotate(${a * 0.35}deg)`, offset: 0.75 },
        { transform: 'translate3d(0,0,0) rotate(0) scale(1, 1)' },
      ],
      { duration: this.reducedMotion ? 1 : 520 + strength * 60, easing: 'ease-out' },
    );
  }

  // --- Aufdecken -----------------------------------------------------------

  private async reveal(): Promise<void> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, this.reducedMotion ? 0 : ms));
    // Entschlüsselung sofort starten, während das Geschenk noch rüttelt und aufspringt
    const pairingPromise = this.wichtel.reveal(this.code);
    pairingPromise.catch(() => {});
    await sleep(500);
    this.opened.set(true);
    this.phase.set('decrypting');
    try {
      // kurz warten, bis der Deckel oben ist; danach pulsiert das Licht, bis entschlüsselt ist
      const [pairing] = await Promise.all([pairingPromise, sleep(550)]);
      this.pairing.set(pairing);
      this.phase.set('revealed');
      afterNextRender({ write: () => this.popGoblin() }, { injector: this.injector });
      navigator.vibrate?.([40, 60, 80]);
    } catch (e) {
      this.error.set(e instanceof RevealFailure ? e.reason : 'invalid');
      this.phase.set('error');
    }
  }

  /**
   * Aufdeck-Animation: Der Goblin springt aus dem Karton, wechselt im höchsten Punkt
   * nach vorne und hüpft dann ein paar Mal federnd aus, bevor er steht.
   * Der leere Karton blendet währenddessen im Hintergrund still aus.
   */
  private popGoblin(): void {
    const goblin = this.goblin()?.nativeElement;
    const gift = this.gift()?.nativeElement;
    if (!goblin || !gift) {
      this.front.set(true);
      this.popped.set(true);
      return;
    }
    gift.blur(); // kein Fokusrahmen um das geöffnete Geschenk
    this.sizeGoblin();
    this.fitSign();

    if (this.reducedMotion) {
      this.front.set(true);
      this.popped.set(true);
      return;
    }

    const g = gift.getBoundingClientRect();
    const b = goblin.getBoundingClientRect();
    // Startpunkt: klein und so tief, dass der Goblin hinter der Kartonfront steckt
    const hidden = g.top + g.height * 0.62 - (b.top + b.height);
    // Sprunghöhe so wählen, dass das Schild die Überschrift nicht verdeckt
    const title = document.querySelector('.title')?.getBoundingClientRect();
    const up = Math.max(24, Math.min(b.height * 0.18, b.top - (title?.bottom ?? 0) - 8));
    const at = (
      y: number,
      rot: number,
      sx: number,
      sy: number,
      easing: string,
      offset: number,
    ) => ({
      transform: `translate3d(0, ${y}px, 0) rotate(${rot}deg) scale(${sx}, ${sy})`,
      easing,
      offset,
    });

    const duration = 1800;
    const apex = 0.4;
    const jump = goblin.animate(
      [
        // raus aus dem Karton
        at(hidden, 0, 0.42, 0.42, 'cubic-bezier(.15,.75,.4,1)', 0),
        at(hidden * 0.42, 5, 0.66, 0.7, 'cubic-bezier(.3,.7,.5,1)', 0.18),
        // höchster Punkt: ab hier vor dem Geschenk
        at(-up, -4, 0.94, 0.98, 'cubic-bezier(.5,0,.85,.5)', apex),
        // erster Aufprall, danach drei abklingende Hüpfer
        at(0, 0, 1.14, 0.84, 'cubic-bezier(.2,.7,.4,1)', 0.53),
        at(-up * 0.52, 3, 0.95, 1.07, 'cubic-bezier(.5,0,.85,.5)', 0.63),
        at(0, 0, 1.1, 0.89, 'cubic-bezier(.2,.7,.4,1)', 0.73),
        at(-up * 0.26, -2, 0.97, 1.04, 'cubic-bezier(.5,0,.85,.5)', 0.81),
        at(0, 0, 1.06, 0.94, 'cubic-bezier(.2,.7,.4,1)', 0.88),
        at(-up * 0.1, 0, 0.99, 1.02, 'cubic-bezier(.5,0,.85,.5)', 0.94),
        at(0, 0, 1, 1, 'ease-out', 1),
      ],
      { duration },
    );

    // im höchsten Punkt nach vorne holen und den Karton still ausblenden
    this.after(jump, duration * apex, () => {
      this.front.set(true);
      this.popped.set(true);
    });
    // Schneestaub bei den ersten beiden Landungen
    this.after(jump, duration * 0.53, () => this.puff(goblin, 1));
    this.after(jump, duration * 0.73, () => this.puff(goblin, 0.7));
    jump.finished.catch(() => {}).then(() => navigator.vibrate?.(20));
  }

  /** Rückruf zu einem Zeitpunkt der Animation; bricht ab, wenn sie vorher endet. */
  private after(animation: Animation, ms: number, fn: () => void): void {
    const timer = setTimeout(fn, ms);
    animation.finished.catch(() => clearTimeout(timer));
  }

  /** Kleine Schneewolke unter den Füßen; entfällt, wenn der Goblin unten abgeschnitten ist. */
  private puff(goblin: HTMLElement, strength: number): void {
    const inner = goblin.firstElementChild as HTMLElement | null;
    if (inner && inner.offsetHeight > goblin.offsetHeight + 2) return;
    const r = goblin.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'puff';
    const base = `translate3d(${r.left + r.width / 2 - 70}px, ${r.bottom - 18}px, 0)`;
    el.style.transform = base;
    document.body.append(el);
    el.animate(
      [
        { opacity: 0.85 * strength, transform: `${base} scale(.35, .5)` },
        { opacity: 0, transform: `${base} scale(${1.1 * strength + 0.25}, 1)` },
      ],
      { duration: 620, easing: 'cubic-bezier(.2,.8,.4,1)' },
    )
      .finished.catch(() => {})
      .then(() => el.remove());
  }

  /** Im flachen Querformat darf der Goblin nur bis zum unteren Rand reichen (dort läuft er weich aus). */
  private sizeGoblin(): void {
    const goblin = this.goblin()?.nativeElement;
    const scene = goblin?.offsetParent as HTMLElement | null;
    if (!goblin || !scene) return;
    const top = scene.getBoundingClientRect().top + goblin.offsetTop;
    goblin.style.setProperty('--goblin-max-h', `${Math.max(120, innerHeight - top - 6)}px`);
  }

  /** Größte Schrift wählen, die auf dem Schild des Goblins noch Platz hat. */
  private fitSign(): void {
    const box = this.sign()?.nativeElement;
    if (!box) return;
    let lo = 7;
    let hi = 30;
    while (hi - lo > 0.4) {
      const mid = (lo + hi) / 2;
      box.style.setProperty('--sign-fs', `${mid}px`);
      if (box.scrollHeight <= box.clientHeight) lo = mid;
      else hi = mid;
    }
    box.style.setProperty('--sign-fs', `${lo}px`);
  }

  protected retry(): void {
    this.readCode();
  }
}
