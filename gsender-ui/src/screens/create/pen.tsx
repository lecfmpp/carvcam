import { curvePolyline } from "@gsender-next/cam-engine";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { CurveNode } from "./elements";

/** Conversão entre mm da peça e pixels do quadro. */
export interface Geom {
  /** mm da peça → px dentro do quadro. */
  toPx(x: number, y: number): { x: number; y: number };
  /** Evento de ponteiro → mm da peça. */
  toMm(e: { clientX: number; clientY: number }): { x: number; y: number };
  /** Quantos mm vale um pixel da tela agora (o quadro pode estar com zoom). */
  mmPerPx(): number;
}

const pathD = (geom: Geom, pts: { x: number; y: number }[], close: boolean) =>
  pts.length ? pts.map((p, i) => `${i ? "L" : "M"}${geom.toPx(p.x, p.y).x.toFixed(1)} ${geom.toPx(p.x, p.y).y.toFixed(1)}`).join(" ") + (close ? " Z" : "") : "";

/**
 * Caneta: clique cria um nó de canto; clique e arraste cria um nó suave (alças simétricas).
 * Clicar no primeiro nó fecha a forma; Enter ou duplo clique termina uma linha aberta;
 * Backspace desfaz o último nó.
 */
export function PenLayer({ geom, onCommit }: { geom: Geom; onCommit(nodes: CurveNode[], closed: boolean): void }) {
  const [nodes, setNodes] = useState<CurveNode[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<number | null>(null);
  const latest = useRef(nodes);
  latest.current = nodes;

  const finish = (closed: boolean) => {
    const n = latest.current;
    if (n.length >= (closed ? 3 : 2)) onCommit(n, closed);
    setNodes([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Backspace" && latest.current.length) {
        e.preventDefault();
        e.stopPropagation();
        setNodes((n) => n.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = geom.toMm(e);
    const near = 10 * geom.mmPerPx();
    if (nodes.length >= 3 && Math.hypot(p.x - nodes[0].x, p.y - nodes[0].y) <= near) return finish(true);
    // Segundo clique do duplo clique cai em cima do último nó: não duplica.
    const last = nodes[nodes.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) <= near * 0.5) return;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético */
    }
    drag.current = nodes.length;
    setNodes([...nodes, { x: p.x, y: p.y }]);
  };
  const move = (e: RPointerEvent) => {
    const p = geom.toMm(e);
    setHover(p);
    const i = drag.current;
    if (i === null) return;
    setNodes((ns) => {
      const n = ns[i];
      if (!n) return ns;
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      if (Math.hypot(dx, dy) < 0.8) return ns;
      const copy = [...ns];
      copy[i] = { ...n, ox: dx, oy: dy, ix: -dx, iy: -dy };
      return copy;
    });
  };
  const up = () => {
    drag.current = null;
  };

  const line = nodes.length ? curvePolyline(0, 0, nodes, false) : [];
  const lastN = nodes[nodes.length - 1];
  const closing = hover && nodes.length >= 3 && Math.hypot(hover.x - nodes[0].x, hover.y - nodes[0].y) <= 10 * geom.mmPerPx();

  return (
    <svg className="create-pen" onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={() => finish(false)}>
      <path d={pathD(geom, line, false)} className="create-pen__path" />
      {lastN && hover && drag.current === null ? <path d={pathD(geom, [lastN, closing ? nodes[0] : hover], false)} className="create-pen__rubber" /> : null}
      {nodes.map((n, i) => {
        const c = geom.toPx(n.x, n.y);
        const h = n.ox || n.oy ? [geom.toPx(n.x + (n.ox ?? 0), n.y + (n.oy ?? 0)), geom.toPx(n.x + (n.ix ?? 0), n.y + (n.iy ?? 0))] : null;
        return (
          <g key={i}>
            {h && i === nodes.length - 1 ? (
              <>
                <line x1={h[1].x} y1={h[1].y} x2={h[0].x} y2={h[0].y} className="create-pen__handle" />
                <circle cx={h[0].x} cy={h[0].y} r={3} className="create-pen__hdot" />
                <circle cx={h[1].x} cy={h[1].y} r={3} className="create-pen__hdot" />
              </>
            ) : null}
            <rect x={c.x - 4} y={c.y - 4} width={8} height={8} className={`create-pen__node ${i === 0 && closing ? "is-close" : ""}`} />
          </g>
        );
      })}
    </svg>
  );
}

type Grab = { i: number; part: "node" | "in" | "out"; x0: number; y0: number; orig: CurveNode[] };

/**
 * Edição dos nós de uma curva selecionada: arrastar um nó move o nó (as alças vão junto);
 * arrastar uma alça curva o trecho (a alça oposta acompanha, Alt solta); duplo clique num nó
 * alterna entre canto e suave.
 */
export function CurveEditor({ geom, ox, oy, nodes, closed, onChange }: { geom: Geom; ox: number; oy: number; nodes: CurveNode[]; closed: boolean; onChange(n: CurveNode[]): void }) {
  const [live, setLive] = useState<CurveNode[] | null>(null);
  const grab = useRef<Grab | null>(null);
  const ns = live ?? nodes;

  const start = (i: number, part: Grab["part"]) => (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético */
    }
    const p = geom.toMm(e);
    grab.current = { i, part, x0: p.x, y0: p.y, orig: nodes };
  };
  const move = (e: RPointerEvent) => {
    const g = grab.current;
    if (!g) return;
    const p = geom.toMm(e);
    const dx = p.x - g.x0;
    const dy = p.y - g.y0;
    const copy = g.orig.map((n) => ({ ...n }));
    const n = copy[g.i];
    if (g.part === "node") {
      n.x = g.orig[g.i].x + dx;
      n.y = g.orig[g.i].y + dy;
    } else {
      const k = g.part === "out" ? "o" : "i";
      const other = g.part === "out" ? "i" : "o";
      const hx = (g.orig[g.i][`${k}x`] ?? 0) + dx;
      const hy = (g.orig[g.i][`${k}y`] ?? 0) + dy;
      n[`${k}x`] = hx;
      n[`${k}y`] = hy;
      if (!e.altKey) {
        // Mantém o nó suave: alça oposta na mesma direção, com o próprio comprimento.
        const len = Math.hypot(g.orig[g.i][`${other}x`] ?? 0, g.orig[g.i][`${other}y`] ?? 0) || Math.hypot(hx, hy);
        const l = Math.hypot(hx, hy) || 1;
        n[`${other}x`] = (-hx / l) * len;
        n[`${other}y`] = (-hy / l) * len;
      }
    }
    setLive(copy);
  };
  const end = () => {
    if (grab.current && live) onChange(live.map(round));
    grab.current = null;
    setLive(null);
  };
  const toggle = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const copy = nodes.map((n) => ({ ...n }));
    const n = copy[i];
    if (n.ox || n.oy || n.ix || n.iy) {
      delete n.ox;
      delete n.oy;
      delete n.ix;
      delete n.iy;
    } else {
      const len = copy.length;
      const prev = copy[(i - 1 + len) % len];
      const next = copy[(i + 1) % len];
      const tx = ((next?.x ?? n.x) - (prev?.x ?? n.x)) / 4;
      const ty = ((next?.y ?? n.y) - (prev?.y ?? n.y)) / 4;
      Object.assign(n, { ox: tx, oy: ty, ix: -tx, iy: -ty });
    }
    onChange(copy.map(round));
  };

  const abs = ns.map((n) => ({ ...n, x: n.x + ox, y: n.y + oy }));
  return (
    <svg className="create-nodes" onPointerMove={move} onPointerUp={end}>
      {live ? <path d={pathD(geom, curvePolyline(ox, oy, ns, closed), closed)} className="create-pen__path" /> : null}
      {abs.map((n, i) => {
        const c = geom.toPx(n.x, n.y);
        const hs = (["out", "in"] as const).filter((part) => (part === "out" ? n.ox || n.oy : n.ix || n.iy));
        return (
          <g key={i}>
            {hs.map((part) => {
              const h = geom.toPx(n.x + ((part === "out" ? n.ox : n.ix) ?? 0), n.y + ((part === "out" ? n.oy : n.iy) ?? 0));
              return (
                <g key={part}>
                  <line x1={c.x} y1={c.y} x2={h.x} y2={h.y} className="create-pen__handle" />
                  <circle cx={h.x} cy={h.y} r={5} className="create-pen__hdot is-grab" onPointerDown={start(i, part)} />
                </g>
              );
            })}
            <rect x={c.x - 5} y={c.y - 5} width={10} height={10} className="create-pen__node is-grab" onPointerDown={start(i, "node")} onDoubleClick={toggle(i)}>
              <title>Drag to move · double-click for a sharp or smooth point</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

const round = (n: CurveNode): CurveNode => {
  const r = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100) / 100);
  const o: CurveNode = { x: r(n.x)!, y: r(n.y)! };
  if (n.ix || n.iy) Object.assign(o, { ix: r(n.ix), iy: r(n.iy) });
  if (n.ox || n.oy) Object.assign(o, { ox: r(n.ox), oy: r(n.oy) });
  return o;
};
