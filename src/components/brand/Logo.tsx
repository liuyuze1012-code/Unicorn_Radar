export function Logo({ size = 28, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      {[30, 20, 10].map((r) => (
        <circle key={r} cx={32} cy={32} r={r} fill="none" className="stroke-foreground" strokeWidth={2} strokeOpacity={r === 30 ? 1 : 0.55} />
      ))}
      <g className={animated ? "radar-sweep" : undefined}>
        <line x1={32} y1={32} x2={53.2} y2={10.8} className="stroke-foreground" strokeWidth={2.5} strokeLinecap="round" />
      </g>
      <circle cx={32} cy={32} r={2.5} className="fill-foreground" />
      <circle cx={53.2} cy={53.2} r={5} className="fill-gold" />
    </svg>
  );
}
