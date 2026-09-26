import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DnaRadar } from "@/components/DnaRadar";
import { TraitBars } from "@/components/TraitBars";
import {
  analyze,
  evolve,
  generateStrategy,
  loadProfile,
  newProfile,
  resetProfile,
  saveProfile,
  threatOf,
} from "@/game/dna";
import { ARENA_H, ARENA_W, Game, MAX_HP, ROUND_TIME, type FrameState } from "@/game/engine";
import type { Dna, Profile, RoundResult } from "@/game/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ECHO//LOOP — The Game Remembers How You Play" },
      {
        name: "description",
        content:
          "A browser arena duel where your own playstyle is recorded, turned into behavioral DNA, and rebuilt as an Echo that fights you back — and evolves every round.",
      },
      { property: "og:title", content: "ECHO//LOOP — The Game Remembers How You Play" },
      {
        property: "og:description",
        content: "Fight your own playstyle. Your behavior becomes the opponent, generation after generation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EchoLoop,
});

type Phase = "boot" | "briefing" | "fight" | "analysis" | "debrief";

function EchoLoop() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const [frame, setFrame] = useState<FrameState | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  const finishRound = useCallback(
    (over: NonNullable<FrameState["over"]>, p: Profile) => {
      const playerDna = analyze(over.sample);
      const nextEcho = evolve(p.echoDna, playerDna, over.won, p.generation);
      const strategy = generateStrategy(nextEcho, p.generation + 1);
      const res: RoundResult = {
        generation: p.generation,
        won: over.won,
        duration: over.duration,
        playerHp: 0,
        echoHp: 0,
        sample: over.sample,
        playerDna,
        nextEchoDna: nextEcho,
        strategy,
      };
      const next: Profile = {
        generation: p.generation + 1,
        wins: p.wins + (over.won ? 1 : 0),
        losses: p.losses + (over.won ? 0 : 1),
        echoDna: nextEcho,
        lastPlayerDna: playerDna,
        strategy,
        history: [...p.history, { gen: p.generation, won: over.won, threat: threatOf(nextEcho) }].slice(-12),
      };
      setResult(res);
      setProfile(next);
      saveProfile(next);
      setAnalysisStep(0);
      setPhase("analysis");
    },
    [],
  );

  // run the arena
  useEffect(() => {
    if (phase !== "fight" || !canvasRef.current || !profile) return;
    endedRef.current = false;
    const snapshot = profile;
    const g = new Game(canvasRef.current, snapshot.echoDna, (s) => {
      setFrame(s);
      if (s.over && !endedRef.current) {
        endedRef.current = true;
        window.setTimeout(() => finishRound(s.over!, snapshot), 900);
      }
    });
    gameRef.current = g;
    g.start();
    return () => {
      g.destroy();
      gameRef.current = null;
    };
  }, [phase, profile, finishRound]);

  // analysis reveal sequence
  useEffect(() => {
    if (phase !== "analysis") return;
    const t = window.setInterval(() => {
      setAnalysisStep((s) => {
        if (s >= ANALYSIS_LINES.length) {
          window.clearInterval(t);
          setPhase("debrief");
          return s;
        }
        return s + 1;
      });
    }, 420);
    return () => window.clearInterval(t);
  }, [phase]);

  if (!profile) return <BootSplash />;

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ backgroundImage: "var(--gradient-void)" }}>
      <div className="pointer-events-none absolute inset-0 scanlines opacity-40" />
      <TopBar profile={profile} />

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-4">
        {phase === "boot" && <Title profile={profile} onStart={() => setPhase("briefing")} />}
        {phase === "briefing" && <Briefing profile={profile} onDeploy={() => setPhase("fight")} />}
        {(phase === "fight" || phase === "analysis") && (
          <Arena canvasRef={canvasRef} frame={frame} profile={profile} analysing={phase === "analysis"} step={analysisStep} />
        )}
        {phase === "debrief" && result && (
          <Debrief
            result={result}
            profile={profile}
            onNext={() => {
              setFrame(null);
              setPhase("briefing");
            }}
          />
        )}
      </div>
    </main>
  );
}

const ANALYSIS_LINES = [
  "CAPTURING INPUT TRACE…",
  "SEGMENTING MOVEMENT VECTORS…",
  "SCORING ENGAGEMENT RANGE…",
  "SYNTHESIZING BEHAVIORAL DNA…",
  "REWRITING ECHO STRATEGY…",
];

function BootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="label-xs animate-flicker">INITIALIZING ECHO//LOOP…</span>
    </div>
  );
}

function TopBar({ profile }: { profile: Profile }) {
  return (
    <header className="relative z-10 flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-bold tracking-[0.3em] text-signal">ECHO//LOOP</span>
        <span className="label-xs hidden sm:inline">THE GAME REMEMBERS HOW YOU PLAY</span>
      </div>
      <div className="flex items-center gap-5">
        <Stat label="GEN" value={String(profile.generation).padStart(2, "0")} />
        <Stat label="W / L" value={`${profile.wins}/${profile.losses}`} />
        <Stat label="THREAT" value={`${threatOf(profile.echoDna)}`} tone="echo" />
        <button
          className="label-xs border border-border px-2 py-1 transition-colors hover:border-destructive hover:text-destructive"
          onClick={() => {
            resetProfile();
            saveProfile(newProfile());
            window.location.reload();
          }}
        >
          WIPE MEMORY
        </button>
      </div>
    </header>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "echo" }) {
  return (
    <div className="text-right">
      <div className="label-xs">{label}</div>
      <div className={`font-mono text-sm ${tone === "echo" ? "text-echo" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Title({ profile, onStart }: { profile: Profile; onStart: () => void }) {
  const fresh = profile.generation === 1;
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center py-20 text-center">
      <h1 className="text-6xl font-bold leading-none tracking-tight sm:text-8xl">
        <span className="text-signal">ECHO</span>
        <span className="text-muted-foreground">//</span>
        <span className="text-echo animate-flicker">LOOP</span>
      </h1>
      <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Enter the arena. Every step, dash, shot and hesitation is recorded. Between rounds your behavior is
        compressed into a DNA fingerprint and rebuilt as an <span className="text-echo">Echo</span> — an opponent
        that plays the way you do, then learns to beat it.
      </p>
      <button
        onClick={onStart}
        className="mt-10 border border-signal px-10 py-4 text-sm font-bold tracking-[0.3em] text-signal transition-all hover:bg-signal hover:text-primary-foreground"
        style={{ boxShadow: "var(--glow-signal)" }}
      >
        {fresh ? "ENTER THE ARENA" : `RESUME — GENERATION ${profile.generation}`}
      </button>
      <div className="mt-14 grid w-full grid-cols-1 gap-px bg-border sm:grid-cols-3">
        {[
          ["01 / RECORD", "Movement, range, accuracy and tempo are sampled every frame."],
          ["02 / ANALYZE", "Six behavioral traits are extracted into your DNA fingerprint."],
          ["03 / EVOLVE", "The Echo inherits your DNA, then counter-tunes against you."],
        ].map(([t, d]) => (
          <div key={t} className="panel p-5 text-left">
            <div className="label-xs text-signal">{t}</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Briefing({ profile, onDeploy }: { profile: Profile; onDeploy: () => void }) {
  const s = profile.strategy ?? generateStrategy(profile.echoDna, profile.generation);
  return (
    <section className="grid gap-4 py-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="panel p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="label-xs">OPPONENT DOSSIER · GEN {profile.generation}</div>
            <h2 className="mt-1 text-3xl font-bold tracking-wide text-echo">{s.codename}</h2>
            <div className="label-xs mt-1 text-foreground/70">{s.archetype}</div>
          </div>
          <div className="text-right">
            <div className="label-xs">THREAT INDEX</div>
            <div className="font-mono text-4xl text-echo">{s.threat}</div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <div className="label-xs">STRATEGY DIRECTIVES</div>
          {s.directives.map((d, i) => (
            <div key={d} className="flex gap-3 border-l-2 border-echo/60 py-1 pl-3 text-xs text-foreground/85">
              <span className="font-mono text-echo/80">{String(i + 1).padStart(2, "0")}</span>
              <span>{d}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <TraitBars dna={profile.echoDna} delta={profile.lastPlayerDna} />
          <div className="flex items-center justify-center">
            <DnaRadar echo={profile.echoDna} player={profile.lastPlayerDna} size={210} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="panel p-6">
          <div className="label-xs">CONTROLS</div>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li><Key>W A S D</Key> move</li>
            <li><Key>MOUSE</Key> aim · <Key>HOLD CLICK</Key> fire</li>
            <li><Key>SHIFT</Key> or <Key>SPACE</Key> dash</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Round lasts {ROUND_TIME}s. Highest hull integrity wins if the timer runs out.
          </p>
        </div>

        {profile.history.length > 0 && (
          <div className="panel p-6">
            <div className="label-xs">LOOP HISTORY</div>
            <div className="mt-3 flex items-end gap-1.5">
              {profile.history.map((h) => (
                <div key={h.gen} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full"
                    style={{
                      height: `${8 + h.threat * 0.6}px`,
                      background: h.won ? "var(--signal)" : "var(--echo)",
                      opacity: 0.85,
                    }}
                  />
                  <span className="font-mono text-[9px] text-muted-foreground">{h.gen}</span>
                </div>
              ))}
            </div>
            <div className="label-xs mt-3">CYAN = YOU WON · MAGENTA = ECHO WON · BAR HEIGHT = THREAT</div>
          </div>
        )}

        <button
          onClick={onDeploy}
          className="panel border-signal py-5 text-sm font-bold tracking-[0.3em] text-signal transition-all hover:bg-signal hover:text-primary-foreground"
          style={{ boxShadow: "var(--glow-signal)" }}
        >
          DEPLOY INTO ARENA
        </button>
      </div>
    </section>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-1 border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </span>
  );
}

function Arena({
  canvasRef,
  frame,
  profile,
  analysing,
  step,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  frame: FrameState | null;
  profile: Profile;
  analysing: boolean;
  step: number;
}) {
  const hp = frame?.playerHp ?? MAX_HP;
  const ehp = frame?.echoHp ?? MAX_HP;
  const dashReady = (frame?.dashCd ?? 0) <= 0;

  return (
    <section className="py-4">
      <div className="mb-3 flex items-center gap-4">
        <Bar label="YOU" value={hp} tone="signal" align="left" />
        <div className="shrink-0 text-center">
          <div className="label-xs">TIME</div>
          <div className="font-mono text-2xl text-warn">
            {String(Math.ceil(frame?.timeLeft ?? ROUND_TIME)).padStart(2, "0")}
          </div>
        </div>
        <Bar label={profile.strategy?.codename ?? "ECHO"} value={ehp} tone="echo" align="right" />
      </div>

      <div className="relative mx-auto" style={{ maxWidth: ARENA_W }}>
        <canvas
          ref={canvasRef}
          width={ARENA_W}
          height={ARENA_H}
          className="w-full border border-border"
          style={{ aspectRatio: `${ARENA_W}/${ARENA_H}`, boxShadow: "0 0 60px rgba(0,0,0,0.6)" }}
        />
        <div className="pointer-events-none absolute inset-0 scanlines opacity-25" />

        {analysing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm">
            <div className="label-xs text-echo">BEHAVIORAL ANALYSIS</div>
            <div className="mt-4 w-72 space-y-1.5">
              {ANALYSIS_LINES.slice(0, step).map((l) => (
                <div key={l} className="flex items-center justify-between font-mono text-[11px] text-foreground/80">
                  <span>{l}</span>
                  <span className="text-signal">OK</span>
                </div>
              ))}
            </div>
            <div className="mt-6 h-1 w-72 bg-secondary">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${(step / ANALYSIS_LINES.length) * 100}%`, background: "var(--echo)" }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between">
        <span className="label-xs">
          ACCURACY <span className="text-foreground">{Math.round((frame?.accuracy ?? 0) * 100)}%</span>
        </span>
        <span className={`label-xs ${dashReady ? "text-signal" : "text-muted-foreground"}`}>
          DASH {dashReady ? "READY" : "CHARGING"}
        </span>
        <span className="label-xs">RECORDING BEHAVIOR ●</span>
      </div>
    </section>
  );
}

function Bar({
  label,
  value,
  tone,
  align,
}: {
  label: string;
  value: number;
  tone: "signal" | "echo";
  align: "left" | "right";
}) {
  return (
    <div className="flex-1">
      <div className={`label-xs ${align === "right" ? "text-right" : ""}`}>{label}</div>
      <div className="mt-1 h-3 w-full bg-secondary">
        <div
          className="h-full transition-[width] duration-200"
          style={{
            width: `${(value / MAX_HP) * 100}%`,
            marginLeft: align === "right" ? `${100 - (value / MAX_HP) * 100}%` : 0,
            background: tone === "signal" ? "var(--signal)" : "var(--echo)",
            boxShadow: tone === "signal" ? "var(--glow-signal)" : "var(--glow-echo)",
          }}
        />
      </div>
    </div>
  );
}

function Debrief({ result, profile, onNext }: { result: RoundResult; profile: Profile; onNext: () => void }) {
  const s = result.sample;
  const stats = useMemo(
    () => [
      ["SURVIVED", `${result.duration.toFixed(1)}s`],
      ["SHOTS", `${s.shotsFired}`],
      ["ACCURACY", `${Math.round((s.shotsFired ? s.shotsHit / s.shotsFired : 0) * 100)}%`],
      ["DASHES", `${s.dashes}`],
      ["AVG RANGE", `${Math.round(s.avgRange)}px`],
      ["DMG DEALT", `${s.damageDealt}`],
    ],
    [result, s],
  );

  return (
    <section className="grid gap-4 py-8 lg:grid-cols-[1fr_1.05fr]">
      <div className="panel p-6">
        <div className="label-xs">GENERATION {result.generation} · RESULT</div>
        <h2 className={`mt-1 text-5xl font-bold tracking-tight ${result.won ? "text-signal" : "text-echo"}`}>
          {result.won ? "ECHO TERMINATED" : "YOU WERE OVERWRITTEN"}
        </h2>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {result.won
            ? "You out-played your own pattern. The Echo absorbs the loss and rewrites itself around it."
            : "Your pattern beat you. The Echo keeps what worked and pushes it further."}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-px bg-border">
          {stats.map(([k, v]) => (
            <div key={k} className="bg-card p-3">
              <div className="label-xs">{k}</div>
              <div className="font-mono text-lg text-foreground">{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="label-xs mb-3">YOUR BEHAVIORAL DNA · THIS ROUND</div>
          <TraitBars dna={result.playerDna} tone="signal" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="panel p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="label-xs">NEXT ECHO · GEN {profile.generation}</div>
              <h3 className="mt-1 text-2xl font-bold text-echo">{result.strategy.codename}</h3>
              <div className="label-xs text-foreground/70">{result.strategy.archetype}</div>
            </div>
            <div className="animate-pulse-ring rounded-full border border-echo px-3 py-2 text-center">
              <div className="font-mono text-2xl text-echo">{result.strategy.threat}</div>
              <div className="label-xs">THREAT</div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-center">
            <DnaRadar echo={result.nextEchoDna} player={result.playerDna} size={230} />
          </div>
          <div className="label-xs mt-2 text-center">
            <span className="text-signal">─── YOU</span> · <span className="text-echo">- - - ECHO</span>
          </div>
        </div>

        <div className="panel p-6">
          <div className="label-xs">MUTATIONS APPLIED</div>
          <div className="mt-3">
            <TraitBars dna={result.nextEchoDna} delta={profile.echoDna === result.nextEchoDna ? null : result.playerDna} />
          </div>
        </div>

        <button
          onClick={onNext}
          className="panel border-echo py-5 text-sm font-bold tracking-[0.3em] text-echo transition-all hover:bg-echo hover:text-accent-foreground"
          style={{ boxShadow: "var(--glow-echo)" }}
        >
          FACE GENERATION {profile.generation}
        </button>
      </div>
    </section>
  );
}

export type { Dna };
