import type { BehaviorSample, Dna, EchoStrategy, Profile, TraitKey } from "./types";
import { TRAIT_ORDER } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const BASE_DNA: Dna = {
  aggression: 0.45,
  mobility: 0.45,
  precision: 0.35,
  evasion: 0.35,
  patience: 0.5,
  territorial: 0.4,
};

export function emptySample(): BehaviorSample {
  return {
    duration: 0,
    distanceTravelled: 0,
    timeApproaching: 0,
    timeRetreating: 0,
    timeIdle: 0,
    timeStrafing: 0,
    shotsFired: 0,
    shotsHit: 0,
    dashes: 0,
    avgRange: 300,
    nearWallTime: 0,
    damageTaken: 0,
    damageDealt: 0,
  };
}

/** Turn raw recorded behavior into a normalized behavioral DNA fingerprint. */
export function analyze(s: BehaviorSample): Dna {
  const t = Math.max(s.duration, 1);
  const moveRatio = clamp01(s.distanceTravelled / (t * 260));
  const approachRatio = clamp01(s.timeApproaching / t);
  const retreatRatio = clamp01(s.timeRetreating / t);
  const idleRatio = clamp01(s.timeIdle / t);
  const strafeRatio = clamp01(s.timeStrafing / t);
  const accuracy = s.shotsFired > 0 ? clamp01(s.shotsHit / s.shotsFired) : 0.2;
  const fireRate = clamp01(s.shotsFired / (t * 3));
  const dashRate = clamp01(s.dashes / (t * 0.5));
  const rangeScore = clamp01(1 - s.avgRange / 520);

  return {
    aggression: clamp01(approachRatio * 0.45 + fireRate * 0.3 + rangeScore * 0.25),
    mobility: clamp01(moveRatio * 0.6 + dashRate * 0.25 + strafeRatio * 0.15),
    precision: clamp01(accuracy * 0.75 + (1 - fireRate) * 0.25),
    evasion: clamp01(dashRate * 0.4 + retreatRatio * 0.3 + strafeRatio * 0.3),
    patience: clamp01(idleRatio * 0.4 + (1 - fireRate) * 0.3 + (1 - approachRatio) * 0.3),
    territorial: clamp01(s.nearWallTime / t),
  };
}

/**
 * Evolve the echo: it inherits the player's fingerprint, keeps memory of the
 * previous generation, and counter-tunes the traits that beat the player.
 */
export function evolve(prevEcho: Dna, player: Dna, playerWon: boolean, generation: number): Dna {
  const memory = 0.45;
  const pressure = playerWon ? 0.16 : 0.05;
  const maturity = Math.min(0.2, generation * 0.015);
  const next = {} as Dna;

  for (const key of TRAIT_ORDER) {
    const inherited = player[key] * (1 - memory) + prevEcho[key] * memory;
    let counter = 0;
    // counter-play: mirror then exploit the player's weak side
    if (key === "aggression") counter = (1 - player.patience) * 0.25 + player.aggression * 0.1;
    if (key === "evasion") counter = player.precision * 0.3;
    if (key === "precision") counter = (1 - player.mobility) * 0.28;
    if (key === "mobility") counter = player.aggression * 0.22;
    if (key === "patience") counter = player.aggression * 0.18;
    if (key === "territorial") counter = player.territorial * 0.15;
    next[key] = clamp01(inherited + counter * pressure * 4 * 0.25 + maturity);
  }
  return next;
}

export function threatOf(dna: Dna): number {
  const raw =
    dna.aggression * 0.22 +
    dna.mobility * 0.18 +
    dna.precision * 0.26 +
    dna.evasion * 0.18 +
    dna.patience * 0.08 +
    dna.territorial * 0.08;
  return Math.round(clamp01(raw) * 100);
}

const PREFIX = ["NULL", "VEX", "ORB", "HALT", "KAIR", "SEV", "TYR", "MIRA", "DROSS", "AXIOM"];
const SUFFIX = ["-07", "-13", "-21", "-34", "-55", "-89", "-KX", "-VR", "-ZN", "-QT"];

function dominant(dna: Dna): TraitKey {
  return TRAIT_ORDER.reduce((a, b) => (dna[b] > dna[a] ? b : a));
}

const ARCHETYPES: Record<TraitKey, string> = {
  aggression: "RUSHDOWN CONSTRUCT",
  mobility: "PHASE RUNNER",
  precision: "MARKSMAN GHOST",
  evasion: "SLIPSTREAM WRAITH",
  patience: "SIEGE MIND",
  territorial: "WALL SENTINEL",
};

/** Generate a readable strategy briefing from the echo's DNA. */
export function generateStrategy(dna: Dna, generation: number): EchoStrategy {
  const dom = dominant(dna);
  const directives: string[] = [];

  directives.push(
    dna.aggression > 0.6
      ? "Close range relentlessly. Deny breathing room."
      : dna.aggression < 0.33
        ? "Hold the outer ring. Punish overextension."
        : "Trade at mid range. Rotate on pressure.",
  );
  directives.push(
    dna.precision > 0.55
      ? "Lead the target. Fire only on solved angles."
      : "Saturate the lane. Volume over accuracy.",
  );
  directives.push(
    dna.evasion > 0.5
      ? "Burn dash charges on incoming fire."
      : "Absorb chip damage, keep firing solution locked.",
  );
  if (dna.territorial > 0.5) directives.push("Anchor to the arena edge. Force corner trades.");
  if (dna.patience > 0.62) directives.push("Bait the first move. Counter on recovery frames.");
  if (dna.mobility > 0.65) directives.push("Never hold a line. Constant lateral drift.");

  const codename = `${PREFIX[generation % PREFIX.length]}${SUFFIX[(generation * 3) % SUFFIX.length]}`;

  return {
    codename,
    archetype: ARCHETYPES[dom],
    directives,
    threat: threatOf(dna),
  };
}

export function newProfile(): Profile {
  return {
    generation: 1,
    wins: 0,
    losses: 0,
    echoDna: { ...BASE_DNA },
    lastPlayerDna: null,
    strategy: generateStrategy(BASE_DNA, 1),
    history: [],
  };
}

const KEY = "echoloop.profile.v1";

export function loadProfile(): Profile {
  if (typeof window === "undefined") return newProfile();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return newProfile();
    const parsed = JSON.parse(raw) as Profile;
    if (!parsed?.echoDna) return newProfile();
    return parsed;
  } catch {
    return newProfile();
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function resetProfile() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
