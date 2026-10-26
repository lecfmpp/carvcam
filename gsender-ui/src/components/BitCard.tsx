import { ArrowUpRight, Check, Plus } from "lucide-react";
import { useState } from "react";
import type { BitProfile } from "../lib/catalog";
import { sienciLink, type Placement } from "../lib/referral";
import { BitSilhouette } from "./BitSilhouette";
import "./machine-card.css";

export interface BitCardData {
  id: string;
  name: string;
  /** Tipo em uma linha ("Flat · upcut", "V-bit · 60°"). */
  kind: string;
  profile: BitProfile;
  d: number;
  shank: "1/8" | "1/4";
  cut?: number;
  flutes: number;
  use: string;
  url: string;
  image?: string;
}

/**
 * Card branco de fresa: foto (WebP) ou silhueta, tipo, nome, para que serve, ficha com rótulos,
 * compatibilidade com o cabeçote e o link da loja (com UTM e código de afiliado).
 */
export function BitCard(props: {
  bit: BitCardData;
  placement: Placement;
  compat?: { level: "fits" | "accessory" | "no"; label: string };
  owned?: boolean;
  onToggle?(): void;
}) {
  const { bit } = props;
  const specs: [string, string][] = [
    ["Cutting Ø", `${+bit.d.toFixed(2)} mm`],
    ["Shank", `${bit.shank}″`],
    ...(bit.cut ? ([["Cut length", `${+bit.cut.toFixed(1)} mm`]] as [string, string][]) : []),
    ...(bit.flutes ? ([["Flutes", String(bit.flutes)]] as [string, string][]) : []),
  ];
  return (
    <article className={`mcard bcard ${props.owned ? "is-owned" : ""}`}>
      <div className="bcard__photo">
        <BitPhoto bit={bit} />
        {props.owned ? (
          <span className="bcard__owned">
            <Check size={13} strokeWidth={2.5} /> In my bits
          </span>
        ) : null}
      </div>
      <div className="mcard__body bcard__body">
        <span className="mcard__label">{bit.kind}</span>
        <h3 className="bcard__title">{bit.name}</h3>
        <p className="mcard__tagline">{bit.use}</p>
        <dl className="bcard__specs">
          {specs.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {props.compat ? <span className={`bcard__compat bcard__compat--${props.compat.level}`}>{props.compat.label}</span> : null}
      </div>
      <div className="mcard__foot bcard__foot">
        {props.onToggle ? (
          <button className={`bcard__toggle ${props.owned ? "is-on" : ""}`} aria-pressed={!!props.owned} onClick={props.onToggle}>
            {props.owned ? (
              <>
                <Check size={14} strokeWidth={2.5} /> I have it
              </>
            ) : (
              <>
                <Plus size={14} strokeWidth={2.5} /> I have it
              </>
            )}
          </button>
        ) : (
          <span />
        )}
        <a className="bcard__buy" href={sienciLink(bit.url, props.placement, bit.id)} target="_blank" rel="noreferrer">
          Buy at Sienci <ArrowUpRight size={14} strokeWidth={2} />
        </a>
      </div>
    </article>
  );
}

function BitPhoto({ bit }: { bit: BitCardData }) {
  const [failed, setFailed] = useState(!bit.image);
  if (failed)
    return (
      <span className="bcard__sil">
        <BitSilhouette profile={bit.profile} d={bit.d} size={96} />
      </span>
    );
  return <img src={bit.image} alt={bit.name} loading="lazy" decoding="async" width={600} height={450} onError={() => setFailed(true)} />;
}
