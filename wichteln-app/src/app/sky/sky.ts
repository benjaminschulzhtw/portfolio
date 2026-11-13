import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { SleighFlight } from './sleigh';

interface Flake {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

// kräftige, satte Farben, damit die Kette auch auf dunklem Himmel leuchtet
const LIGHT_COLORS = ['#ff2d55', '#ffd60a', '#30d158', '#0a84ff', '#ff9f0a', '#bf5af2'];
const GLOW = 46; // Durchmesser des Lichthofs in CSS-Pixeln

/**
 * Hintergrund mit Sternen, Schneeflocken, Lichterkette und Funkenspur des Schlittens auf einem Canvas.
 * Teilchenzahl hängt von Fläche und Gerät ab, devicePixelRatio ist auf 2 begrenzt,
 * und die Animation pausiert im Hintergrund-Tab.
 */
@Component({
  selector: 'app-sky',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // der Schlitten (<img class="sleigh">) wird nach dem Laden hier angehängt, über dem Canvas
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }
    canvas {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class Sky {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stop = this.start(this.canvas().nativeElement);
      destroyRef.onDestroy(stop);
    });
  }

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private start(canvas: HTMLCanvasElement): () => void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return () => {};

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const nav = navigator as Navigator & { deviceMemory?: number };
    const weakDevice = (nav.hardwareConcurrency ?? 4) <= 4 || (nav.deviceMemory ?? 4) <= 2;

    // Safe Area oben (Notch/Dynamic Island) messen, damit die Lichterkette darunter hängt
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)';
    document.body.append(probe);
    let safeTop = 0;

    let w = 0;
    let h = 0;
    let flakes: Flake[] = [];
    let stars: Star[] = [];
    let lights: { x: number; y: number; color: string; phase: number }[] = [];
    let glow: HTMLCanvasElement[] = [];
    let raf = 0;
    let last = 0;

    // Schlitten erst laden, wenn die Seite steht und der Browser Luft hat
    const sleigh = new SleighFlight(this.host.nativeElement, weakDevice);
    const hasIdle = typeof requestIdleCallback === 'function';
    const loadSleigh = () => {
      if (!reducedMotion.matches) sleigh.load('schlitten.webp');
    };
    const idleHandle = hasIdle ? requestIdleCallback(loadSleigh, { timeout: 2000 }) : setTimeout(loadSleigh, 1200);

    const makeGlow = (color: string, dpr: number) => {
      const size = Math.ceil(GLOW * dpr);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      // weißer Glühkern, satte Birne, weicher farbiger Lichthof
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.1, '#ffffff');
      grad.addColorStop(0.2, color);
      grad.addColorStop(0.38, color + 'b0');
      grad.addColorStop(0.62, color + '38');
      grad.addColorStop(1, color + '00');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      return c;
    };

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const sameWidth = w === innerWidth;
      safeTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      glow = LIGHT_COLORS.map((c) => makeGlow(c, dpr));
      sleigh.measure(dpr);
      // Ein-/Ausfahren der Adressleiste ändert nur die Höhe: Teilchen behalten, sonst flackert es
      if (sameWidth && flakes.length) {
        lights.forEach((l) => (l.y = safeTop + 16 + Math.sin((l.x / w) * Math.PI * 3) * 6));
        return;
      }

      // ca. 1 Flocke pro 9000 px², gedeckelt; schwache Geräte und Reduced Motion bekommen weniger
      const area = w * h;
      const factor = (weakDevice ? 0.55 : 1) * (reducedMotion.matches ? 0.4 : 1);
      const flakeCount = Math.round(Math.min(160, area / 9000) * factor);
      const starCount = Math.round(Math.min(120, area / 7000) * factor);

      flakes = Array.from({ length: flakeCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 2.4,
        vy: 18 + Math.random() * 38,
        drift: 8 + Math.random() * 16,
        phase: Math.random() * Math.PI * 2,
      }));
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.7,
        r: 0.4 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
      }));

      // Lichterkette als Girlande oben, unter der Safe Area
      const spacing = w < 480 ? 34 : 46;
      const n = Math.ceil(w / spacing) + 1;
      lights = Array.from({ length: n }, (_, i) => {
        const x = i * spacing + spacing / 2;
        return {
          x,
          y: safeTop + 16 + Math.sin((x / w) * Math.PI * 3) * 6,
          color: LIGHT_COLORS[i % LIGHT_COLORS.length],
          phase: i * 0.9,
        };
      });
    };


    const draw = (t: number, dt: number) => {
      // Farbverlauf und Polarlicht kommen statisch aus dem CSS-Hintergrund
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#eef7ff';
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(s.phase + t * s.speed));
        ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
      }

      // Kabel der Lichterkette
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#18321f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      lights.forEach((l, i) => (i ? ctx.lineTo(l.x, l.y - 4) : ctx.moveTo(l.x, l.y - 4)));
      ctx.stroke();
      // additiv mischen, damit sich benachbarte Lichthöfe gegenseitig aufhellen
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        ctx.globalAlpha = 0.78 + 0.22 * Math.sin(l.phase + t * 2.2);
        ctx.drawImage(glow[i % glow.length], l.x - GLOW / 2, l.y - GLOW / 2, GLOW, GLOW);
      }
      ctx.globalCompositeOperation = 'source-over';

      sleigh.step(ctx, t, dt, w);

      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.phase += dt;
        const x = f.x + Math.sin(f.phase) * f.drift;
        if (f.y - f.r > h) {
          f.y = -f.r;
          f.x = Math.random() * w;
        }
        ctx.moveTo(x + f.r, f.y);
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      draw(now / 1000, dt);
      raf = requestAnimationFrame(loop);
    };

    const play = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (reducedMotion.matches) draw(0, 0);
      else raf = requestAnimationFrame(loop);
    };

    const onResize = () => {
      resize();
      play();
    };
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : play());

    onResize();
    let resizeTimer = 0;
    const debounced = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(onResize, 120);
    };
    addEventListener('resize', debounced, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener?.('change', onResize);

    return () => {
      if (hasIdle) cancelIdleCallback(idleHandle as number);
      else clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      sleigh.dispose();
      probe.remove();
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      removeEventListener('resize', debounced);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener?.('change', onResize);
    };
  }
}
