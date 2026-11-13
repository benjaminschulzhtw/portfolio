interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  sprite: number;
  phase: number;
}

const SPARK_SPRITE = 24; // CSS-Pixel
const SPARK_COLORS = ['#ffd98a', '#fff3c4', '#e6f5ff', '#ffe7a3'];
const PAUSE_S = 1.4; // kurze Pause außerhalb des Bildschirms, bevor er umkehrt
const PASS_S = 15; // ungefähre Dauer eines Überflugs

/**
 * Fliegender Rentierschlitten mit Funkenspur.
 * Das Bild ist ein normales <img> (nur transform wird animiert), die Funken landen
 * auf dem Himmel-Canvas darunter, also optisch hinter dem Schlitten.
 * Das Bild zeigt nach links; für den Rückflug wird es gespiegelt.
 */
export class SleighFlight {
  private img?: HTMLImageElement;
  private sprites: HTMLCanvasElement[] = [];
  private sparks: Spark[] = [];
  private x = 0;
  private dir = -1; // -1 = nach links (Bild ungespiegelt), 1 = nach rechts
  private pause = 0;
  private emitDebt = 0;
  private imgW = 0;
  private imgH = 0;
  private top = 0;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly weak: boolean,
  ) {}

  /** Lädt das Bild erst, wenn der Browser Zeit hat; bis dahin kostet der Schlitten nichts. */
  load(src: string): void {
    const img = new Image();
    img.className = 'sleigh';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    img.width = 1000;
    img.height = 360;
    img.src = new URL(src, document.baseURI).toString();
    img
      .decode()
      .then(() => {
        if (this.disposed) return;
        this.host.append(img);
        this.img = img;
        this.measure();
        this.x = innerWidth + 30; // startet rechts und fliegt nach links los
      })
      .catch(() => {
        /* ohne Bild eben ohne Schlitten */
      });
  }

  /** Nach Größenänderungen neu vermessen (Breite kommt aus dem CSS). */
  measure(dpr = Math.min(devicePixelRatio || 1, 2)): void {
    this.sprites = SPARK_COLORS.map((c) => this.makeSprite(c, dpr));
    const img = this.img;
    if (!img) return;
    this.placeBetweenTitleAndGift(img);
    this.imgW = img.offsetWidth;
    this.imgH = img.offsetHeight;
    this.top = img.offsetTop;
  }

  /**
   * Flughöhe: mittig in der Lücke zwischen Überschrift und Schneeflocken, damit nichts
   * den Schlitten verdeckt. Ist die Lücke zu schmal, wird er kleiner; passt er gar nicht,
   * weicht er auf den Bereich bis zum Geschenk aus (flaches Querformat: Höhe aus dem CSS).
   */
  private placeBetweenTitleAndGift(img: HTMLImageElement): void {
    img.style.width = '';
    img.style.top = '';
    const title = document.querySelector('.title')?.getBoundingClientRect();
    if (!title) return;
    // Unterkante der Lücke: was zuerst kommt, Schneeflocken oder Geschenk
    const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
    const tops = [rect('.prompt')?.top, rect('.scene')?.top].filter((t): t is number => t != null);
    if (!tops.length) return;
    const bottom = Math.min(...tops);
    const minGap = 10; // Platz fürs Auf-und-ab-Schweben
    const room = bottom - title.bottom - 2 * minGap;
    if (room < 46) return; // zu schmal (flaches Querformat): Höhe aus dem CSS
    const h = Math.min(img.offsetHeight, room);
    if (h < img.offsetHeight) img.style.width = `${h / (img.height / img.width)}px`;
    img.style.top = `${title.bottom + (bottom - title.bottom - h) / 2}px`;
  }

  step(ctx: CanvasRenderingContext2D, t: number, dt: number, w: number): void {
    const img = this.img;
    if (img) this.fly(img, t, dt, w);
    this.drawSparks(ctx, t, dt);
  }

  dispose(): void {
    this.disposed = true;
    this.img?.remove();
  }

  private fly(img: HTMLImageElement, t: number, dt: number, w: number): void {
    const margin = 30;
    const speed = Math.min(110, Math.max(40, (w + this.imgW) / PASS_S));
    if (this.pause > 0) {
      this.pause -= dt;
    } else {
      this.x += this.dir * speed * dt;
      if (this.dir < 0 && this.x < -this.imgW - margin) {
        this.dir = 1;
        this.x = -this.imgW - margin;
        this.pause = PAUSE_S;
      } else if (this.dir > 0 && this.x > w + margin) {
        this.dir = -1;
        this.x = w + margin;
        this.pause = PAUSE_S;
      }
    }

    const bob = Math.sin(t * 1.3) * 7;
    const tilt = Math.sin(t * 1.3 + 0.9) * 1.6;
    img.style.transform = `translate3d(${this.x}px, ${bob}px, 0) rotate(${tilt}deg) scaleX(${-this.dir})`;

    if (this.pause > 0) return;
    // Funken am hinteren Ende, wo der Schlitten hängt (rechts im Bild bzw. links, wenn gespiegelt)
    const tailX = this.dir < 0 ? this.x + this.imgW * 0.96 : this.x + this.imgW * 0.04;
    const tailY = this.top + bob + this.imgH * 0.74;
    const rate = this.weak ? 24 : 45;
    this.emitDebt += rate * dt;
    while (this.emitDebt >= 1 && this.sparks.length < (this.weak ? 90 : 180)) {
      this.emitDebt -= 1;
      this.sparks.push({
        x: tailX + (Math.random() - 0.5) * this.imgW * 0.06,
        y: tailY + (Math.random() - 0.5) * this.imgH * 0.25,
        vx: -this.dir * (8 + Math.random() * 30) + (Math.random() - 0.5) * 16,
        vy: -6 + Math.random() * 18,
        age: 0,
        life: 0.9 + Math.random() * 1.1,
        size: 0.45 + Math.random() * 0.75,
        sprite: (Math.random() * this.sprites.length) | 0,
        phase: Math.random() * Math.PI * 2,
      });
    }
    if (this.emitDebt > 1) this.emitDebt = 1;
  }

  private drawSparks(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    if (!this.sparks.length) return;
    ctx.globalCompositeOperation = 'lighter';
    let alive = 0;
    for (const s of this.sparks) {
      s.age += dt;
      if (s.age >= s.life) continue;
      s.vy += 14 * dt; // sinken langsam ab
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.age / s.life;
      const twinkle = 0.55 + 0.45 * Math.sin(s.phase + t * 14);
      const size = SPARK_SPRITE * s.size * (0.5 + 0.5 * k);
      ctx.globalAlpha = k * twinkle;
      ctx.drawImage(this.sprites[s.sprite], s.x - size / 2, s.y - size / 2, size, size);
      this.sparks[alive++] = s;
    }
    this.sparks.length = alive;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Vierzackiger Glitzerstern mit weichem Schein, einmal vorgerendert. */
  private makeSprite(color: string, dpr: number): HTMLCanvasElement {
    const size = Math.ceil(SPARK_SPRITE * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const m = size / 2;
    const halo = g.createRadialGradient(m, m, 0, m, m, m);
    halo.addColorStop(0, '#ffffff');
    halo.addColorStop(0.15, color);
    halo.addColorStop(0.45, color + '55');
    halo.addColorStop(1, color + '00');
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#ffffff';
    g.beginPath();
    const arm = m * 0.95;
    const waist = m * 0.09;
    g.moveTo(m, m - arm);
    g.quadraticCurveTo(m + waist, m - waist, m + arm, m);
    g.quadraticCurveTo(m + waist, m + waist, m, m + arm);
    g.quadraticCurveTo(m - waist, m + waist, m - arm, m);
    g.quadraticCurveTo(m - waist, m - waist, m, m - arm);
    g.fill();
    return c;
  }
}
