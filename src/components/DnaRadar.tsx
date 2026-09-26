import type { Dna } from "@/game/types";
import { TRAIT_LABELS, TRAIT_ORDER } from "@/game/types";

interface Props {
  player?: Dna | null;
  echo: Dna;
  size?: number;
}

export function DnaRadar({ player, echo, size = 240 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 30;
  const n = TRAIT_ORDER.length;

  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v] as const;
  };
  const path = (d: Dna) =>
    TRAIT_ORDER.map((k, i) => {
      const [x, y] = pt(i, Math.max(0.06, d[k]));
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={TRAIT_ORDER.map((_, i) => pt(i, ring).join(",")).join(" ")}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />
      ))}
      {TRAIT_ORDER.map((k, i) => {
        const [x, y] = pt(i, 1.28);
        return (
          <text
            key={k}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 9, letterSpacing: "0.12em", fontFamily: "var(--font-mono)" }}
          >
            {TRAIT_LABELS[k].toUpperCase()}
          </text>
        );
      })}
      {player && (
        <path
          d={path(player)}
          fill="color-mix(in oklab, var(--signal) 18%, transparent)"
          stroke="var(--signal)"
          strokeWidth={1.5}
        />
      )}
      <path
        d={path(echo)}
        fill="color-mix(in oklab, var(--echo) 16%, transparent)"
        stroke="var(--echo)"
        strokeWidth={1.8}
        strokeDasharray="4 3"
      />
    </svg>
  );
}
