import type { Dna } from "@/game/types";
import { TRAIT_LABELS, TRAIT_ORDER } from "@/game/types";

export function TraitBars({ dna, delta, tone = "echo" }: { dna: Dna; delta?: Dna | null; tone?: "echo" | "signal" }) {
  return (
    <div className="space-y-2.5">
      {TRAIT_ORDER.map((k) => {
        const v = dna[k];
        const d = delta ? v - delta[k] : 0;
        return (
          <div key={k}>
            <div className="flex items-baseline justify-between">
              <span className="label-xs">{TRAIT_LABELS[k]}</span>
              <span className="font-mono text-[10px] text-foreground/80">
                {Math.round(v * 100)}
                {delta && Math.abs(d) > 0.01 && (
                  <span className={d > 0 ? "ml-1 text-warn" : "ml-1 text-muted-foreground"}>
                    {d > 0 ? "▲" : "▼"}
                    {Math.abs(Math.round(d * 100))}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-secondary">
              <div
                className="h-full transition-[width] duration-700"
                style={{
                  width: `${Math.max(3, v * 100)}%`,
                  background: tone === "echo" ? "var(--echo)" : "var(--signal)",
                  boxShadow: tone === "echo" ? "var(--glow-echo)" : "var(--glow-signal)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
