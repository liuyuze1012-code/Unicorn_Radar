import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import type { UnicornMatch } from "@/lib/comparables";
import type { Category } from "@/lib/scoring";
import { LAND_NAME, pinRadius, RINGS, yearOf } from "@/lib/atlas";
import { cn } from "@/lib/utils";

export interface AtlasMapHandle { zoomIn(): void; zoomOut(): void; recenter(): void }

const W = 1200, H = 800, YX = 420, YY = 420;
const SAME_ANGLES = [-90, 180, 135, -135, 90, -160, 160, -112, 112].map((d) => (d * Math.PI) / 180);
const OTHER_ANGLES = [-0.05, 0.22, -0.3, 0.42, -0.5, 0.1, 0.32, -0.18, 0.52];

export interface PlacedPin { match: UnicornMatch; x: number; y: number; same: boolean }

export function placePins(same: UnicornMatch[], other: UnicornMatch[]): PlacedPin[] {
  const a = same.map((m, i) => {
    const r = pinRadius(m.rank, m.poolSize);
    const t = SAME_ANGLES[i % SAME_ANGLES.length]!;
    return { match: m, x: YX + r * Math.cos(t), y: YY + r * Math.sin(t), same: true };
  });
  const b = other.map((m, i) => {
    const d = 400 + pinRadius(m.rank, m.poolSize) * 0.7;
    const t = OTHER_ANGLES[i % OTHER_ANGLES.length]!;
    return { match: m, x: YX + d * Math.cos(t), y: YY + d * Math.sin(t), same: false };
  });
  return [...a, ...b];
}

const PIN = "M0,0 C-6,-10 -11,-16 -11,-23 A11,11 0 1 1 11,-23 C11,-16 6,-10 0,0Z";

interface Props {
  category: Category;
  pins: PlacedPin[];
  highlightId: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}

export const AtlasMap = forwardRef<AtlasMapHandle, Props>(function AtlasMap({ category, pins, highlightId, selectedId, onSelect, onHover }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    const svg = svgRef.current!;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.7, 5])
      .on("zoom", (e) => gRef.current?.setAttribute("transform", e.transform.toString()));
    zRef.current = z;
    select(svg).call(z).on("dblclick.zoom", null);
    return () => { select(svg).on(".zoom", null); };
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zRef.current && select(svgRef.current!).call(zRef.current.scaleBy, 1.4),
    zoomOut: () => zRef.current && select(svgRef.current!).call(zRef.current.scaleBy, 1 / 1.4),
    recenter: () => zRef.current && select(svgRef.current!).call(zRef.current.transform, zoomIdentity),
  }));

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-full w-full touch-none select-none bg-atlas-paper" role="img" aria-label="Map of the unicorns your company looked like">
      <defs>
        <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <g ref={gRef}>
        {/* water */}
        <path d="M640,-20 C700,120 610,260 690,400 C760,520 650,650 720,820 L860,820 C800,660 900,520 830,400 C770,280 860,140 800,-20Z" className="fill-atlas-water" />
        {/* home land */}
        <path d="M30,60 C180,10 420,30 560,50 C650,70 660,200 640,300 C625,400 700,480 660,580 C620,690 520,770 360,770 C210,775 70,740 40,620 C10,500 60,420 30,320 C10,220 -10,110 30,60Z" className="fill-atlas-land stroke-atlas-land-edge" strokeWidth={2} />
        {/* far shore */}
        <path d="M870,40 C960,20 1100,40 1180,70 L1190,760 C1100,790 960,770 900,740 C860,640 930,520 880,420 C840,320 910,220 870,40Z" className="fill-atlas-land stroke-atlas-land-edge" strokeWidth={2} />
        {/* decorative contours */}
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${980 + i * 30},${180 + i * 20} C${1060 + i * 10},${150 + i * 25} ${1120 - i * 10},${260 + i * 10} ${1050 - i * 5},${320 + i * 15} C${990 + i * 10},${360} ${950 + i * 15},${260 + i * 10} ${980 + i * 30},${180 + i * 20}Z`}
            fill="none" className="stroke-atlas-land-edge" strokeDasharray="4 6" />
        ))}
        {[0, 1].map((i) => (
          <path key={`h${i}`} d={`M${120 + i * 25},${620 - i * 10} C${180},${560 - i * 20} ${280},${600} ${250 - i * 10},${680 - i * 10} C${200},${720} ${130},${700} ${120 + i * 25},${620 - i * 10}Z`}
            fill="none" className="stroke-atlas-land-edge" strokeDasharray="4 6" />
        ))}
        <text x={300} y={110} textAnchor="middle" className="fill-muted-foreground font-serif italic" fontSize={26}>{LAND_NAME[category]}</text>
        <text x={1030} y={110} textAnchor="middle" className="fill-muted-foreground font-serif italic" fontSize={20}>Other industries</text>
        <text x={745} y={760} textAnchor="middle" className="fill-muted-foreground font-serif italic" fontSize={16}>The Strait</text>

        {/* rings */}
        {RINGS.map((r, i) => (
          <g key={r.label} className="atlas-ring" style={{ animationDelay: `${450 + i * 150}ms` }}>
            <circle cx={YX} cy={YY} r={r.r} fill="none" className="stroke-atlas-you" strokeOpacity={0.35} strokeDasharray="6 7" strokeWidth={1.5} />
            <text x={YX} y={YY - r.r - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={13}>{r.label}</text>
          </g>
        ))}

        {/* unicorn pins */}
        {pins.map((p, i) => {
          const id = p.match.company.id;
          const on = id === highlightId || id === selectedId;
          const left = p.x < YX;
          const year = yearOf(p.match.company.firstBillionDate);
          return (
            <g key={id} transform={`translate(${p.x},${p.y})`}>
              <g
                className="atlas-pop cursor-pointer"
                style={{ animationDelay: `${1000 + i * 120}ms` }}
                onClick={() => onSelect(id)}
                onMouseEnter={() => onHover(id)}
                onMouseLeave={() => onHover(null)}
                role="button"
                aria-label={`${p.match.company.name}, details`}
              >
                <ellipse cx={0} cy={1} rx={9} ry={3} className="fill-atlas-you" opacity={0.25} filter="url(#pin-shadow)" />
                <circle cx={0} cy={-22} r={26} fill="transparent" />
                <path d={PIN} transform={on ? "scale(1.3)" : undefined} className={cn("fill-atlas-gold stroke-card", on && "stroke-atlas-you")} strokeWidth={on ? 2 : 1.5} />
                <circle cx={0} cy={on ? -30 : -23} r={4} className="fill-card" />
                <text x={left ? -16 : 16} y={-26} textAnchor={left ? "end" : "start"} fontSize={16} fontWeight={600} className="fill-foreground" paintOrder="stroke" stroke="var(--atlas-paper)" strokeWidth={4}>{p.match.company.name}</text>
                {year && <text x={left ? -16 : 16} y={-9} textAnchor={left ? "end" : "start"} fontSize={12} className="fill-muted-foreground" paintOrder="stroke" stroke="var(--atlas-paper)" strokeWidth={4}>Became a unicorn in {year}</text>}
              </g>
            </g>
          );
        })}

        {/* you */}
        <g transform={`translate(${YX},${YY})`}>
          <g className="atlas-drop">
            <ellipse cx={0} cy={2} rx={14} ry={4} className="fill-atlas-you" opacity={0.3} filter="url(#pin-shadow)" />
            <path d={PIN} transform="scale(1.7)" className="fill-atlas-you stroke-card" strokeWidth={1.2} />
            <text x={0} y={-35} textAnchor="middle" fontSize={15} fontWeight={600} className="fill-card">You</text>
          </g>
        </g>
      </g>
    </svg>
  );
});
