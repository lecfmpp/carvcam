import { ArrowUpRight, Check, Info } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { HEADS, type HeadId } from "../lib/catalog";
import { headInfo, type HeadInfo } from "../lib/headInfo";
import { sienciLink, type Placement } from "../lib/referral";
import "./machine-card.css";

/**
 * White router/spindle card, in the same design as the machine card: photo (WebP), name,
 * short tagline, RPM and control highlighted, and the labeled spec sheet.
 */
export function HeadCard(props: { id: HeadId; selected?: boolean; onSelect?(): void; badge?: string; placement?: Placement }) {
  const h = headInfo(props.id);
  const rpm = HEADS[props.id].rpm;
  const selectable = !!props.onSelect;
  const key = (e: KeyboardEvent) => {
    if (selectable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      props.onSelect!();
    }
  };
  const specs: [string, string][] = [
    ["Power", h.power],
    ["Speed control", h.speedControl],
    ["Collets", h.collets],
    ["Mount", h.mount],
    ["Plugs into", h.voltage],
    ["In the box", h.inBox],
  ];
  return (
    <div
      className={`mcard hcard ${props.selected ? "is-selected" : ""} ${selectable ? "is-selectable" : ""}`}
      role={selectable ? "radio" : undefined}
      aria-checked={selectable ? !!props.selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={props.onSelect}
      onKeyDown={key}
    >
      <div className="mcard__photo hcard__photo">
        <HeadPhoto info={h} />
        {props.selected ? (
          <span className="mcard__check" aria-hidden>
            <Check size={16} strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      <div className="mcard__body">
        <div className="mcard__eyebrow">
          <span>{h.kind}</span>
          {props.badge ? <span className="mcard__status mcard__status--current">{props.badge}</span> : null}
        </div>
        <h3 className="mcard__title">{h.name}</h3>
        <p className="mcard__tagline">{h.tagline}</p>
        <div className="mcard__hero">
          <div>
            <span className="mcard__label">Speed range</span>
            <span className="mcard__big">
              {(rpm[0] / 1000).toLocaleString("en-US")}–{(rpm[1] / 1000).toLocaleString("en-US")}k <small>RPM</small>
            </span>
            <span className="mcard__sub">
              {rpm[0].toLocaleString("en-US")} to {rpm[1].toLocaleString("en-US")}
            </span>
          </div>
          <div>
            <span className="mcard__label">Speed set</span>
            <span className={`hcard__mode ${h.speedShort === "Automatic" ? "is-auto" : ""}`}>{h.speedShort}</span>
            <span className="mcard__sub">{h.speedShort === "Automatic" ? "by the program" : "by you"}</span>
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
        {h.note ? (
          <p className="hcard__note">
            <Info size={14} strokeWidth={2} aria-hidden /> {h.note}
          </p>
        ) : null}
      </div>
      <div className="mcard__foot">
        {selectable ? <span className="mcard__pick">{props.selected ? "This is mine" : "Select"}</span> : <span />}
        <a
          className="mcard__link"
          href={sienciLink(h.url, props.placement ?? "head_card", h.id)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          View on sienci.com <ArrowUpRight size={14} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}

/** WebP photo; until it exists, a drawing of the router or spindle. */
function HeadPhoto({ info }: { info: HeadInfo }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <HeadDrawing spindle={info.kind === "Spindle kit"} />;
  return <img src={info.image} alt={info.name} loading="lazy" decoding="async" width={800} height={600} onError={() => setFailed(true)} />;
}

function HeadDrawing({ spindle }: { spindle: boolean }) {
  // Upright cylindrical body, collet nut and the bit. The spindle is wider, with fins.
  const w = spindle ? 92 : 70;
  const x = 200 - w / 2;
  return (
    <svg viewBox="0 0 400 300" className="mcard__drawing" role="img" aria-label={spindle ? "Spindle drawing" : "Router drawing"}>
      <ellipse cx="200" cy="268" rx="90" ry="10" fill="#e4e2dd" />
      <rect x={x} y="40" width={w} height="160" rx={spindle ? 10 : 22} className="d-head" />
      {spindle
        ? [0, 1, 2, 3, 4, 5, 6].map((i) => <line key={i} x1={x + 10} x2={x + w - 10} y1={62 + i * 18} y2={62 + i * 18} stroke="#45464b" strokeWidth="3" />)
        : <rect x={x + 14} y="64" width={w - 28} height="34" rx="6" fill="#45464b" />}
      {!spindle ? <circle cx="200" cy="81" r="9" fill="#ff5b1f" /> : null}
      <rect x="183" y="200" width="34" height="22" rx="4" fill="#9a9993" />
      <line x1="200" y1="222" x2="200" y2="258" className="d-bit" />
    </svg>
  );
}
