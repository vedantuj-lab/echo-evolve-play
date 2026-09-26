export type TraitKey =
  | "aggression"
  | "mobility"
  | "precision"
  | "evasion"
  | "patience"
  | "territorial";

export type Dna = Record<TraitKey, number>;

export interface BehaviorSample {
  /** seconds survived / played */
  duration: number;
  distanceTravelled: number;
  timeApproaching: number;
  timeRetreating: number;
  timeIdle: number;
  timeStrafing: number;
  shotsFired: number;
  shotsHit: number;
  dashes: number;
  avgRange: number;
  nearWallTime: number;
  damageTaken: number;
  damageDealt: number;
}

export interface RoundResult {
  generation: number;
  won: boolean;
  duration: number;
  playerHp: number;
  echoHp: number;
  sample: BehaviorSample;
  playerDna: Dna;
  nextEchoDna: Dna;
  strategy: EchoStrategy;
}

export interface EchoStrategy {
  codename: string;
  archetype: string;
  directives: string[];
  threat: number;
}

export interface Profile {
  generation: number;
  wins: number;
  losses: number;
  echoDna: Dna;
  lastPlayerDna: Dna | null;
  strategy: EchoStrategy | null;
  history: { gen: number; won: boolean; threat: number }[];
}

export const TRAIT_LABELS: Record<TraitKey, string> = {
  aggression: "Aggression",
  mobility: "Mobility",
  precision: "Precision",
  evasion: "Evasion",
  patience: "Patience",
  territorial: "Territorial",
};

export const TRAIT_ORDER: TraitKey[] = [
  "aggression",
  "mobility",
  "precision",
  "evasion",
  "patience",
  "territorial",
];
