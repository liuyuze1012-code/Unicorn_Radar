import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { scaleLinear, scaleLog, scaleSymlog, type ScaleContinuousNumeric } from "d3-scale";
import type { HistoricalCompany } from "@/lib/comparables";
import { formatValue, outcomeOf, PRESETS, type Axis, type Outcome, type Plottable } from "@/lib/mapModel";

export interface CanvasHandle {
  reset(): void;
  zoomTo(id: number): void;
}

export interface FocusPoint extends Plottable {
  name: string;
}

interface Props {
  companies: HistoricalCompany[];
  preset: number;
  visible: boolean[];
  focus: FocusPoint | null;
  neighborIds: Set<number>;
  showLines: boolean;
  highlightId: number | null;
  selectedId: number | null;
  onHover: (id: number | null, x: number, y: number) => void;
  onSelect: (id: number | null) => void;
}

const M = { l: 84, r: 20, t: 20, b: 60 };
const STRIP = 14; // unknown strip thickness
const ANIM_MS = 600;

type Scale = ScaleContinuousNumeric<number, number>;

function makeScale(axis: Axis, values: (number | null)[], extra: number | null): Scale {
  const vs = values.filter((v): v is number => v !== null);
  if (extra !== null) vs.push(extra);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (axis.scale === "log") {
    const pad = Math.pow(hi / lo, 0.03);
    return scaleLog().domain([lo / pad, hi * pad]);
  }
  const pad = (hi - lo) * 0.03 || 1;
  if (axis.scale === "symlog") return scaleSymlog().constant(1e5).domain([0, hi * 1.1]);
  lo = axis.format === "pct" ? Math.max(0, lo - pad) : lo - pad;
  return scaleLinear().domain([lo, hi + pad]);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const ComparablesCanvas = forwardRef<CanvasHandle, Props>(function ComparablesCanvas(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const st = useRef({
    w: 0,
    h: 0,
    t: zoomIdentity as ZoomTransform,
    fromPreset: props.preset,
    toPreset: props.preset,
    animStart: 0,
    px: new Float32Array(0),
    py: new Float32Array(0),
    fx: 0,
    fy: 0,
    raf: 0,
    dirty: true,
    zoom: null as ZoomBehavior<HTMLCanvasElement, unknown> | null,
    colors: {} as Record<string, string>,
  });

  // Raw values and scales per preset (computed once per focus change).
  const dataRef = useRef<{ xs: (number | null)[][]; ys: (number | null)[][]; sx: Scale[]; sy: Scale[]; fxv: (number | null)[]; fyv: (number | null)[] } | null>(null);
  const lastKey = useRef<unknown>(null);
  if (lastKey.current !== props.focus || !dataRef.current) {
    lastKey.current = props.focus;
    const xs: (number | null)[][] = [], ys: (number | null)[][] = [], sx: Scale[] = [], sy: Scale[] = [];
    const fxv: (number | null)[] = [], fyv: (number | null)[] = [];
    for (const p of PRESETS) {
      const x = props.companies.map((c) => p.x.value(c));
      const y = props.companies.map((c) => p.y.value(c));
      const fx = props.focus ? p.x.value(props.focus) : null;
      const fy = props.focus ? p.y.value(props.focus) : null;
      xs.push(x); ys.push(y); fxv.push(fx); fyv.push(fy);
      sx.push(makeScale(p.x, x, fx));
      sy.push(makeScale(p.y, y, fy));
    }
    dataRef.current = { xs, ys, sx, sy, fxv, fyv };
  }

  // Preset change -> animate.
  useEffect(() => {
    const s = st.current;
    if (s.toPreset === props.preset) return;
    s.fromPreset = s.toPreset;
    s.toPreset = props.preset;
    s.animStart = performance.now();
    s.dirty = true;
  }, [props.preset]);

  useEffect(() => {
    st.current.dirty = true;
  });

  useImperativeHandle(ref, () => ({
    reset() {
      const s = st.current;
      if (s.zoom && canvasRef.current) animateTo(zoomIdentity);
    },
    zoomTo(id: number) {
      const s = st.current;
      const d = dataRef.current!;
      const p = s.toPreset;
      const xv = d.xs[p]![id], yv = d.ys[p]![id];
      const { x0, x1, y0, y1 } = plotBox();
      const bx = xv === null ? x0 - STRIP / 2 : d.sx[p]!.copy().range([x0, x1])(xv);
      const by = yv === null ? y1 + STRIP / 2 : d.sy[p]!.copy().range([y1, y0])(yv);
      const k = 6;
      animateTo(zoomIdentity.translate((x0 + x1) / 2 - k * bx, (y0 + y1) / 2 - k * by).scale(k));
    },
  }));

  function plotBox() {
    const s = st.current;
    return { x0: M.l, x1: s.w - M.r, y0: M.t, y1: s.h - M.b };
  }

  function animateTo(target: ZoomTransform) {
    const s = st.current;
    const c = canvasRef.current;
    if (!c || !s.zoom) return;
    const from = s.t;
    const start = performance.now();
    const step = () => {
      const u = ease(Math.min(1, (performance.now() - start) / 500));
      const t = zoomIdentity
        .translate(from.x + (target.x - from.x) * u, from.y + (target.y - from.y) * u)
        .scale(from.k + (target.k - from.k) * u);
      select(c).call(s.zoom!.transform, t);
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  useEffect(() => {
    const c = canvasRef.current!;
    const wrap = wrapRef.current!;
    const s = st.current;
    const css = getComputedStyle(document.documentElement);
    for (const k of ["foreground", "muted-foreground", "border", "background", "muted", "outcome-a", "outcome-b", "outcome-c", "outcome-unicorn", "outcome-unobserved"])
      s.colors[k] = css.getPropertyValue(`--${k}`).trim() || "#888";

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      s.w = r.width;
      s.h = r.height;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      s.dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const z = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 60])
      .on("zoom", (e) => {
        s.t = e.transform;
        s.dirty = true;
      });
    s.zoom = z;
    select(c).call(z).on("dblclick.zoom", null);

    const loop = () => {
      s.raf = requestAnimationFrame(loop);
      const anim = performance.now() - s.animStart < ANIM_MS + 20;
      if (!s.dirty && !anim && !propsRef.current.focus) return;
      s.dirty = false;
      draw();
    };
    s.raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      select(c).on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const s = st.current;
    const P = propsRef.current;
    const d = dataRef.current!;
    const col = s.colors;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    const { x0, x1, y0, y1 } = plotBox();
    if (x1 <= x0 || y1 <= y0) return;

    const u = ease(Math.min(1, (performance.now() - s.animStart) / ANIM_MS));
    const a = s.fromPreset, b = s.toPreset;
    const sxA = s.t.rescaleX(d.sx[a]!.copy().range([x0, x1]));
    const sxB = s.t.rescaleX(d.sx[b]!.copy().range([x0, x1]));
    const syA = s.t.rescaleY(d.sy[a]!.copy().range([y1, y0]));
    const syB = s.t.rescaleY(d.sy[b]!.copy().range([y1, y0]));
    const stripX = x0 - STRIP / 2 - 2;
    const stripY = y1 + STRIP / 2 + 2;
    const pos = (xa: number | null, xb: number | null, ya: number | null, yb: number | null): [number, number] => {
      const pa = xa === null ? stripX : sxA(xa);
      const pb = xb === null ? stripX : sxB(xb);
      const qa = ya === null ? stripY : syA(ya);
      const qb = yb === null ? stripY : syB(yb);
      return [pa + (pb - pa) * u, qa + (qb - qa) * u];
    };

    // Axes, grid, unknown strips
    const px = d.xs[b]!, py = d.ys[b]!;
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = col.muted!;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x0 - STRIP - 4, y0, STRIP, y1 - y0 + STRIP + 4);
    ctx.fillRect(x0 - STRIP - 4, y1 + 4, x1 - x0 + STRIP + 4, STRIP);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col.border!;
    ctx.lineWidth = 1;
    ctx.fillStyle = col["muted-foreground"]!;
    const preset = PRESETS[b]!;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tv of sxB.ticks(6)) {
      const x = sxB(tv);
      if (x < x0 || x > x1) continue;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.fillText(formatValue(tv, preset.x.format), x, y1 + STRIP + 10);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yt = preset.y.scale === "log" ? syB.ticks(5).filter((_, i, arr) => arr.length < 12 || i % 3 === 0) : syB.ticks(6);
    for (const tv of yt) {
      const y = syB(tv);
      if (y < y0 || y > y1) continue;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillText(formatValue(tv, preset.y.format), x0 - STRIP - 10, y);
    }
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("unknown", x0 - STRIP - 4, y1 + STRIP + 26);
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = col.foreground!;
    ctx.textAlign = "center";
    ctx.fillText(preset.x.label, (x0 + x1) / 2, s.h - 14);
    ctx.save();
    ctx.translate(16, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(preset.y.label + (preset.y.scale === "log" ? " (log)" : ""), 0, 0);
    ctx.restore();

    // Dot positions
    const n = P.companies.length;
    if (s.px.length !== n) { s.px = new Float32Array(n); s.py = new Float32Array(n); }
    for (let i = 0; i < n; i++) {
      const [x, y] = pos(d.xs[a]![i]!, px[i]!, d.ys[a]![i]!, py[i]!);
      s.px[i] = x; s.py[i] = y;
    }
    if (P.focus) {
      const [fx, fy] = pos(d.fxv[a]!, d.fxv[b]!, d.fyv[a]!, d.fyv[b]!);
      s.fx = fx; s.fy = fy;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - STRIP - 4, y0, x1 - x0 + STRIP + 4, y1 - y0 + STRIP + 8);
    ctx.clip();

    const k = s.t.k;
    const rBase = 2.2 * (1 + 0.18 * Math.log2(k));
    const colorOf: Record<Outcome, string> = {
      stayA: col["outcome-a"]!, reachB: col["outcome-b"]!, reachC: col["outcome-c"]!,
      unicorn: col["outcome-unicorn"]!, unobserved: col["outcome-unobserved"]!,
    };
    const hasFocus = P.neighborIds.size > 0 || !!P.focus;
    const dot = (i: number, alpha: number) => {
      const cc = P.companies[i]!;
      const o = outcomeOf(cc);
      const r = o === "unicorn" ? rBase * 1.9 : rBase;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colorOf[o];
      ctx.beginPath();
      ctx.arc(s.px[i]!, s.py[i]!, r, 0, Math.PI * 2);
      ctx.fill();
      if (cc.unicorn === "later") {
        ctx.strokeStyle = colorOf.unicorn;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.px[i]!, s.py[i]!, r + 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    // background layer
    for (let i = 0; i < n; i++) {
      if (!P.visible[i] || P.neighborIds.has(i) || P.companies[i]!.unicorn === "within_5y") continue;
      dot(i, hasFocus ? 0.25 : 0.85);
    }
    for (let i = 0; i < n; i++) {
      if (!P.visible[i] || P.neighborIds.has(i) || P.companies[i]!.unicorn !== "within_5y") continue;
      dot(i, hasFocus ? 0.3 : 1);
    }
    // neighbour lines + dots
    if (P.focus && P.showLines) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = col.foreground!;
      ctx.lineWidth = 0.7;
      for (const i of P.neighborIds) {
        ctx.beginPath(); ctx.moveTo(s.fx, s.fy); ctx.lineTo(s.px[i]!, s.py[i]!); ctx.stroke();
      }
    }
    for (const i of P.neighborIds) {
      dot(i, 1);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.foreground!;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(s.px[i]!, s.py[i]!, rBase + 1.2, 0, Math.PI * 2); ctx.stroke();
    }
    // labels
    ctx.globalAlpha = 1;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = (text: string, x: number, y: number, bold = false) => {
      ctx.font = `${bold ? "600 12px" : "11px"} Inter, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = col.background!;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = col.foreground!;
      ctx.fillText(text, x, y);
    };
    if (k >= 2.5) {
      for (let i = 0; i < n; i++) {
        const cc = P.companies[i]!;
        if (P.visible[i] && cc.unicorn === "within_5y") label(cc.name, s.px[i]! + rBase * 2 + 3, s.py[i]!);
      }
    }
    for (const id of [P.highlightId, P.selectedId]) {
      if (id === null) continue;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.foreground!;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.px[id]!, s.py[id]!, rBase + 5, 0, Math.PI * 2); ctx.stroke();
      label(P.companies[id]!.name, s.px[id]! + rBase + 9, s.py[id]!);
    }
    // focus
    if (P.focus) {
      const phase = (performance.now() % 1800) / 1800;
      ctx.globalAlpha = 0.35 * (1 - phase);
      ctx.fillStyle = col.foreground!;
      ctx.beginPath(); ctx.arc(s.fx, s.fy, 9 + 16 * phase, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col.background!;
      ctx.beginPath(); ctx.arc(s.fx, s.fy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col.foreground!;
      ctx.lineWidth = 3;
      ctx.stroke();
      label(P.focus.name, s.fx + 14, s.fy, true);
    }
    ctx.restore();
  }

  function hit(e: { clientX: number; clientY: number }): number | null {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const s = st.current;
    const P = propsRef.current;
    let best: number | null = null;
    let bd = 64;
    for (let i = 0; i < s.px.length; i++) {
      if (!P.visible[i] && !P.neighborIds.has(i)) continue;
      const dd = (s.px[i]! - mx) ** 2 + (s.py[i]! - my) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair touch-none"
        aria-label="Map of historical Series A companies"
        onMouseMove={(e) => {
          const id = hit(e);
          const r = canvasRef.current!.getBoundingClientRect();
          propsRef.current.onHover(id, e.clientX - r.left, e.clientY - r.top);
        }}
        onMouseLeave={() => propsRef.current.onHover(null, 0, 0)}
        onClick={(e) => propsRef.current.onSelect(hit(e))}
      />
    </div>
  );
});
