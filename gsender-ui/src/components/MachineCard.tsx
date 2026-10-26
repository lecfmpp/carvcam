import { ArrowUpRight, Check } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { MachineId } from "../lib/catalog";
import { fmtIn, inToMm, machineInfo, type MachineInfo } from "../lib/machineInfo";
import { sienciLink, type Placement } from "../lib/referral";
import "./machine-card.css";

/**
 * Card branco de uma máquina Sienci: foto (WebP), nome, frase curta, área de trabalho em
 * destaque e a ficha com rótulos. Clicar seleciona; o link abre a página do produto.
 */
export function MachineCard(props: {
  id: MachineId;
  selected?: boolean;
  onSelect?(): void;
  placement?: Placement;
  /** Horizontal, para Settings › My machine. */
  wide?: boolean;
}) {
  const m = machineInfo(props.id);
  const selectable = !!props.onSelect;
  const key = (e: KeyboardEvent) => {
    if (selectable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      props.onSelect!();
    }
  };
  const specs: [string, string][] = [
    ["Max speed", m.speed],
    ["Drive", m.drive],
    ["Motors", m.motors],
    ["Spins with", m.mount],
    ["Controller", m.controller],
    ...(m.footprint ? ([["Footprint", m.footprint]] as [string, string][]) : []),
    ...(m.extra ? [m.extra] : []),
  ];
  return (
    <div
      className={`mcard ${props.wide ? "mcard--wide" : ""} ${props.selected ? "is-selected" : ""} ${selectable ? "is-selectable" : ""}`}
      role={selectable ? "radio" : undefined}
      aria-checked={selectable ? !!props.selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={props.onSelect}
      onKeyDown={key}
    >
      <div className="mcard__photo">
        <MachinePhoto info={m} />
        {props.selected ? (
          <span className="mcard__check" aria-hidden>
            <Check size={16} strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      <div className="mcard__body">
        <div className="mcard__eyebrow">
          <span>{m.model.startsWith("AltMill") ? "Floor-standing" : "Benchtop"}</span>
          <span className={`mcard__status mcard__status--${m.status}`}>{m.status === "current" ? "Current model" : "No longer sold"}</span>
        </div>
        <h3 className="mcard__title">
          {m.model} <span className="mcard__size">{m.size}</span>
        </h3>
        <p className="mcard__tagline">{m.tagline}</p>
        <div className="mcard__hero">
          <div>
            <span className="mcard__label">Work area</span>
            <span className="mcard__big">
              {fmtIn(m.workIn[0])} × {fmtIn(m.workIn[1])} <small>in</small>
            </span>
            <span className="mcard__sub">
              {inToMm(m.workIn[0])} × {inToMm(m.workIn[1])} mm
            </span>
          </div>
          <div>
            <span className="mcard__label">{m.zLabel}</span>
            <span className="mcard__big">
              {fmtIn(m.zIn)} <small>in</small>
            </span>
            <span className="mcard__sub">{inToMm(m.zIn)} mm</span>
          </div>
        </div>
        <dl className="mcard__specs">
          {specs.map(([k, v]) => (
            <div key={k} className="mcard__spec">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mcard__foot">
        {selectable ? <span className="mcard__pick">{props.selected ? "This is my machine" : "Select"}</span> : <span />}
        <a
          className="mcard__link"
          href={sienciLink(m.url, props.placement ?? "machine_card", m.id)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {m.status === "current" ? "View on sienci.com" : "Resources"} <ArrowUpRight size={14} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}

/** Foto WebP da máquina; enquanto ela não existe, um desenho da máquina nas proporções reais. */
export function MachinePhoto({ info }: { info: MachineInfo }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MachineDrawing info={info} />;
  return <img src={info.image} alt={`${info.model} ${info.size}`} loading="lazy" decoding="async" width={800} height={600} onError={() => setFailed(true)} />;
}

/**
 * Desenho em perspectiva oblíqua: mesa na proporção da área de trabalho, pórtico e cabeçote.
 * AltMill em pé (com pernas); LongMill de bancada.
 */
function MachineDrawing({ info }: { info: MachineInfo }) {
  const alt = info.model.startsWith("AltMill");
  const [wx, wy] = info.workIn;
  const k = 230 / Math.max(wx + wy * 0.5, 1);
  const W = wx * k;
  const D = wy * k;
  const ox = 200 - (W + D * 0.5) / 2;
  const oy = alt ? 190 : 215;
  // (u, v) na mesa, h para cima → tela.
  const p = (u: number, v: number, h = 0) => ({ x: ox + u + v * 0.5, y: oy - v * 0.42 - h });
  const poly = (...q: { x: number; y: number }[]) => q.map((a) => `${a.x.toFixed(1)},${a.y.toFixed(1)}`).join(" ");
  const H = alt ? 52 : 44;
  const g = D * 0.42; // posição do pórtico ao longo de Y
  const corners: [number, number][] = [
    [0, 0],
    [W, 0],
    [0, D],
    [W, D],
  ];
  const tip = p(W * 0.5, g - 2, H - 22);
  const end = p(W * 0.5, g - 2, H - 34);
  return (
    <svg viewBox="0 0 400 300" className="mcard__drawing" role="img" aria-label={`${info.model} ${info.size} drawing`}>
      {alt
        ? corners.map(([u, v], i) => {
            const a = p(u, v);
            return <line key={i} x1={a.x} y1={a.y} x2={a.x} y2={a.y + 70} className="d-leg" />;
          })
        : null}
      <polygon points={poly(p(0, 0, -8), p(W, 0, -8), p(W, 0), p(0, 0))} className="d-side" />
      <polygon points={poly(p(0, 0), p(W, 0), p(W, D), p(0, D))} className="d-bed" />
      {[1, 2, 3, 4, 5].map((i) => {
        const a = p(0, (D * i) / 6);
        const b = p(W, (D * i) / 6);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="d-slot" />;
      })}
      <polygon points={poly(p(-4, g - 6), p(-4, g + 6), p(-4, g + 6, H), p(-4, g - 6, H))} className="d-plate" />
      <polygon points={poly(p(W + 4, g - 6), p(W + 4, g + 6), p(W + 4, g + 6, H), p(W + 4, g - 6, H))} className="d-plate" />
      <polygon points={poly(p(-4, g, H), p(W + 4, g, H), p(W + 4, g, H + 12), p(-4, g, H + 12))} className="d-beam" />
      <polygon points={poly(p(W * 0.5 - 8, g - 2, H + 18), p(W * 0.5 + 8, g - 2, H + 18), p(W * 0.5 + 8, g - 2, H - 22), p(W * 0.5 - 8, g - 2, H - 22))} className="d-head" />
      <line x1={tip.x} y1={tip.y} x2={end.x} y2={end.y} className="d-bit" />
    </svg>
  );
}
