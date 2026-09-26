import type { BehaviorSample, Dna } from "./types";
import { emptySample } from "./dna";

export const ARENA_W = 960;
export const ARENA_H = 600;
const R = 14;
const MAX_HP = 100;
const ROUND_TIME = 75;

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  own: "player" | "echo";
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: "signal" | "echo" | "warn";
}

interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  fireCd: number;
  dashCd: number;
  dashT: number;
  aimX: number;
  aimY: number;
  hit: number;
  trail: { x: number; y: number }[];
}

export interface FrameState {
  playerHp: number;
  echoHp: number;
  timeLeft: number;
  dashCd: number;
  accuracy: number;
  over: null | { won: boolean; sample: BehaviorSample; duration: number };
}

const SPEED = 235;
const DASH_SPEED = 720;
const BULLET_SPEED = 520;

function mk(x: number, y: number): Fighter {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    hp: MAX_HP,
    fireCd: 0,
    dashCd: 0,
    dashT: 0,
    aimX: 1,
    aimY: 0,
    hit: 0,
    trail: [],
  };
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private keys = new Set<string>();
  private mouse = { x: ARENA_W * 0.75, y: ARENA_H / 2, down: false };
  private player = mk(ARENA_W * 0.25, ARENA_H / 2);
  private echo = mk(ARENA_W * 0.75, ARENA_H / 2);
  private bullets: Bullet[] = [];
  private parts: Particle[] = [];
  private sample = emptySample();
  private rangeAccum = 0;
  private time = 0;
  private finished = false;
  private shake = 0;
  private wobble = Math.random() * 10;
  private echoFireCd = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private dna: Dna,
    private onFrame: (s: FrameState) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    canvas.width = ARENA_W;
    canvas.height = ARENA_H;
  }

  private kd = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", " ", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
      e.preventDefault();
    this.keys.add(k);
  };
  private ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private mm = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) / r.width) * ARENA_W;
    this.mouse.y = ((e.clientY - r.top) / r.height) * ARENA_H;
  };
  private md = () => (this.mouse.down = true);
  private mu = () => (this.mouse.down = false);

  start() {
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    this.canvas.addEventListener("mousemove", this.mm);
    this.canvas.addEventListener("mousedown", this.md);
    window.addEventListener("mouseup", this.mu);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.kd);
    window.removeEventListener("keyup", this.ku);
    this.canvas.removeEventListener("mousemove", this.mm);
    this.canvas.removeEventListener("mousedown", this.md);
    window.removeEventListener("mouseup", this.mu);
  }

  private loop = (now: number) => {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (!this.finished) this.update(dt);
    this.render();
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };

  private emit() {
    this.onFrame({
      playerHp: Math.max(0, this.player.hp),
      echoHp: Math.max(0, this.echo.hp),
      timeLeft: Math.max(0, ROUND_TIME - this.time),
      dashCd: Math.max(0, this.player.dashCd),
      accuracy: this.sample.shotsFired ? this.sample.shotsHit / this.sample.shotsFired : 0,
      over: this.finished
        ? {
            won: this.echo.hp <= 0 || (this.player.hp > this.echo.hp && this.time >= ROUND_TIME),
            sample: this.finalSample(),
            duration: this.time,
          }
        : null,
    });
  }

  private finalSample(): BehaviorSample {
    return { ...this.sample, duration: this.time, avgRange: this.rangeAccum / Math.max(this.time, 0.1) };
  }

  private update(dt: number) {
    this.time += dt;
    this.wobble += dt;
    const p = this.player;
    const e = this.echo;

    // ---- player input
    let ix = 0;
    let iy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) ix -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) ix += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) iy -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) iy += 1;
    const il = Math.hypot(ix, iy) || 1;
    ix /= il;
    iy /= il;

    if ((this.keys.has("shift") || this.keys.has(" ")) && p.dashCd <= 0 && (ix || iy)) {
      p.dashCd = 1.4;
      p.dashT = 0.16;
      this.sample.dashes++;
      this.burst(p.x, p.y, "signal", 10);
    }
    p.dashCd -= dt;
    p.dashT -= dt;
    const pSpeed = p.dashT > 0 ? DASH_SPEED : SPEED;
    p.vx = ix * pSpeed;
    p.vy = iy * pSpeed;
    this.move(p, dt);

    const dxE = e.x - p.x;
    const dyE = e.y - p.y;
    const range = Math.hypot(dxE, dyE) || 1;
    this.rangeAccum += range * dt;

    // ---- behavior recording
    const dist = Math.hypot(p.vx, p.vy) * dt;
    this.sample.distanceTravelled += dist;
    if (!ix && !iy) this.sample.timeIdle += dt;
    else {
      const towards = (ix * dxE + iy * dyE) / range;
      if (towards > 0.45) this.sample.timeApproaching += dt;
      else if (towards < -0.45) this.sample.timeRetreating += dt;
      else this.sample.timeStrafing += dt;
    }
    if (p.x < 90 || p.x > ARENA_W - 90 || p.y < 90 || p.y > ARENA_H - 90)
      this.sample.nearWallTime += dt;

    // ---- player fire
    const ax = this.mouse.x - p.x;
    const ay = this.mouse.y - p.y;
    const al = Math.hypot(ax, ay) || 1;
    p.aimX = ax / al;
    p.aimY = ay / al;
    p.fireCd -= dt;
    if (this.mouse.down && p.fireCd <= 0) {
      p.fireCd = 0.18;
      this.sample.shotsFired++;
      this.spawnBullet(p, "player");
    }

    // ---- echo AI driven by DNA
    this.echoBrain(dt, range, -dxE, -dyE);

    // ---- bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const target = b.own === "player" ? e : p;
      if (Math.hypot(b.x - target.x, b.y - target.y) < R + 5) {
        b.life = -1;
        target.hp -= 7;
        target.hit = 0.18;
        this.shake = Math.min(10, this.shake + 4);
        this.burst(b.x, b.y, b.own === "player" ? "signal" : "echo", 8);
        if (b.own === "player") {
          this.sample.shotsHit++;
          this.sample.damageDealt += 7;
        } else this.sample.damageTaken += 7;
      }
      if (b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H) b.life = -1;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    for (const q of this.parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.94;
      q.vy *= 0.94;
      q.life -= dt;
    }
    this.parts = this.parts.filter((q) => q.life > 0);

    p.hit -= dt;
    e.hit -= dt;
    this.shake *= 0.88;
    this.pushTrail(p);
    this.pushTrail(e);

    if (p.hp <= 0 || e.hp <= 0 || this.time >= ROUND_TIME) this.finished = true;
  }

  private pushTrail(f: Fighter) {
    f.trail.push({ x: f.x, y: f.y });
    if (f.trail.length > 14) f.trail.shift();
  }

  private move(f: Fighter, dt: number) {
    f.x = Math.max(R, Math.min(ARENA_W - R, f.x + f.vx * dt));
    f.y = Math.max(R, Math.min(ARENA_H - R, f.y + f.vy * dt));
  }

  private spawnBullet(f: Fighter, own: "player" | "echo") {
    this.bullets.push({
      x: f.x + f.aimX * (R + 6),
      y: f.y + f.aimY * (R + 6),
      vx: f.aimX * BULLET_SPEED,
      vy: f.aimY * BULLET_SPEED,
      own,
      life: 2,
    });
  }

  private echoBrain(dt: number, range: number, dxP: number, dyP: number) {
    const e = this.echo;
    const p = this.player;
    const d = this.dna;
    const nx = dxP / (range || 1);
    const ny = dyP / (range || 1);

    // preferred engagement range comes from aggression
    const want = 420 - d.aggression * 300;
    const radial = range > want ? 1 : -1;
    const drift = Math.sin(this.wobble * (1.2 + d.mobility * 2.6)) * (0.4 + d.mobility);

    let mx = nx * radial * (0.5 + d.aggression * 0.8) + -ny * drift;
    let my = ny * radial * (0.5 + d.aggression * 0.8) + nx * drift;

    // territorial echoes hug the arena edge, others avoid it
    const edgePull = d.territorial > 0.5 ? 1 : -1;
    const cx = ARENA_W / 2;
    const cy = ARENA_H / 2;
    mx += ((e.x - cx) / cx) * edgePull * 0.25 * Math.abs(d.territorial - 0.35);
    my += ((e.y - cy) / cy) * edgePull * 0.25 * Math.abs(d.territorial - 0.35);

    // patience: stall instead of committing
    if (d.patience > 0.6 && Math.sin(this.wobble * 0.8) > 0.75) {
      mx *= 0.15;
      my *= 0.15;
    }

    // evasion: dash away from the nearest incoming bullet
    e.dashCd -= dt;
    e.dashT -= dt;
    if (e.dashCd <= 0 && d.evasion > 0.25) {
      const threat = this.bullets.find(
        (b) => b.own === "player" && Math.hypot(b.x - e.x, b.y - e.y) < 90 + d.evasion * 70,
      );
      if (threat) {
        e.dashCd = 1.8 - d.evasion * 0.9;
        e.dashT = 0.16;
        const tl = Math.hypot(threat.vx, threat.vy) || 1;
        mx = -threat.vy / tl;
        my = threat.vx / tl;
        this.burst(e.x, e.y, "echo", 8);
      }
    }

    const ml = Math.hypot(mx, my) || 1;
    const spd = (e.dashT > 0 ? DASH_SPEED : SPEED * (0.72 + d.mobility * 0.45));
    e.vx = (mx / ml) * spd;
    e.vy = (my / ml) * spd;
    this.move(e, dt);

    // aim with DNA-scaled target leading and spread
    const travel = range / BULLET_SPEED;
    const lead = d.precision;
    const tx = p.x + p.vx * travel * lead - e.x;
    const ty = p.y + p.vy * travel * lead - e.y;
    const tl2 = Math.hypot(tx, ty) || 1;
    const spread = (1 - d.precision) * 0.38;
    const ang = Math.atan2(ty / tl2, tx / tl2) + (Math.random() - 0.5) * spread;
    e.aimX = Math.cos(ang);
    e.aimY = Math.sin(ang);

    this.echoFireCd -= dt;
    const interval = 0.62 - d.aggression * 0.3 - d.precision * 0.08 + (d.patience - 0.5) * 0.18;
    if (this.echoFireCd <= 0 && range < 620) {
      this.echoFireCd = Math.max(0.16, interval);
      this.spawnBullet(e, "echo");
    }
  }

  private burst(x: number, y: number, hue: Particle["hue"], n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 180;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
        hue,
      });
    }
  }

  // ---------- render ----------
  private render() {
    const c = this.ctx;
    const SIG = "#4fe3e8";
    const ECHO = "#ff5fc8";
    const WARN = "#ffc25a";
    c.save();
    if (this.shake > 0.2) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    c.fillStyle = "#0b0e16";
    c.fillRect(-20, -20, ARENA_W + 40, ARENA_H + 40);

    // grid
    c.strokeStyle = "rgba(90,110,150,0.13)";
    c.lineWidth = 1;
    for (let x = 0; x <= ARENA_W; x += 40) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, ARENA_H);
      c.stroke();
    }
    for (let y = 0; y <= ARENA_H; y += 40) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(ARENA_W, y);
      c.stroke();
    }
    c.strokeStyle = "rgba(120,150,200,0.35)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);

    // particles
    for (const q of this.parts) {
      const a = Math.max(0, q.life / q.max);
      c.fillStyle = q.hue === "signal" ? SIG : q.hue === "echo" ? ECHO : WARN;
      c.globalAlpha = a;
      c.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    c.globalAlpha = 1;

    this.drawTrail(this.player, SIG);
    this.drawTrail(this.echo, ECHO);

    for (const b of this.bullets) {
      const col = b.own === "player" ? SIG : ECHO;
      c.shadowBlur = 12;
      c.shadowColor = col;
      c.fillStyle = col;
      c.beginPath();
      c.arc(b.x, b.y, 4, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }

    this.drawFighter(this.player, SIG, false);
    this.drawFighter(this.echo, ECHO, true);
    c.restore();
  }

  private drawTrail(f: Fighter, col: string) {
    const c = this.ctx;
    f.trail.forEach((t, i) => {
      c.globalAlpha = (i / f.trail.length) * 0.22;
      c.fillStyle = col;
      c.beginPath();
      c.arc(t.x, t.y, R * 0.7, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;
  }

  private drawFighter(f: Fighter, col: string, isEcho: boolean) {
    const c = this.ctx;
    c.save();
    c.translate(f.x, f.y);
    c.rotate(Math.atan2(f.aimY, f.aimX));
    c.shadowBlur = 20;
    c.shadowColor = col;
    c.strokeStyle = f.hit > 0 ? "#ffffff" : col;
    c.lineWidth = 2.5;
    c.beginPath();
    if (isEcho) {
      c.moveTo(R, 0);
      c.lineTo(-R * 0.8, R * 0.85);
      c.lineTo(-R * 0.35, 0);
      c.lineTo(-R * 0.8, -R * 0.85);
      c.closePath();
    } else {
      c.moveTo(R, 0);
      c.lineTo(-R * 0.7, R * 0.8);
      c.lineTo(-R * 0.7, -R * 0.8);
      c.closePath();
    }
    c.stroke();
    c.fillStyle = f.hit > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.07)";
    c.fill();
    c.restore();

    // hp ring
    c.beginPath();
    c.strokeStyle = col;
    c.globalAlpha = 0.5;
    c.lineWidth = 3;
    c.arc(f.x, f.y, R + 8, -Math.PI / 2, -Math.PI / 2 + (Math.max(0, f.hp) / MAX_HP) * Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
  }
}

export { MAX_HP, ROUND_TIME };
