import { ArrowUpRight, Check, Plus, X } from "lucide-react";
import { useState } from "react";
import type { BitFeeds, BitProfile } from "../lib/catalog";
import { sienciLink, type Placement } from "../lib/referral";
import { BitSilhouette } from "./BitSilhouette";
import "./machine-card.css";
import "./bit-card.css";

export interface BitCardData {
  id: string;
  name: string;
  /** Type on one line ("Flat · upcut", "V-bit · 60°"). */
  kind: string;
  profile: BitProfile;
  d: number;
  shank: "1/8" | "1/4" | "3/8";
  cut?: number;
  flutes: number;
  use: string;
  url: string;
  image?: string;
}

/**
 * White bit card: photo (WebP) or silhouette, type, name, what it's for, labeled spec sheet,
 * the Sienci sets it comes in, the feeds badge (official vs estimated) for the machine and head,
 * compatibility with the head and the store link (with UTM and affiliate code).
 */
export function BitCard(props: {
  bit: BitCardData;
  placement: Placement;
  compat?: { level: "fits" | "accessory" | "no"; label: string };
  /** Sienci sets the bit comes in. */
  kits?: { name: string; url: string }[];
  /** Feeds and speeds on the active machine and head. */
  feeds?: BitFeeds;
  owned?: boolean;
  /** Just removed from My bits: the card stays in place, dimmed, with "Add back". */
  removed?: boolean;
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
    <article className={`mcard bcard ${props.owned ? "is-owned" : ""} ${props.removed ? "is-removed" : ""}`}>
      <div className="bcard__photo">
        <BitPhoto bit={bit} />
        {props.owned ? (
          <span className="bcard__owned">
            <Check size={13} strokeWidth={2.5} /> In my bits
          </span>
        ) : props.removed ? (
          <span className="bcard__owned bcard__owned--off">Removed from my bits</span>
        ) : null}
      </div>
      <div className="mcard__body bcard__body">
        <span className="mcard__label">{bit.kind}</span>
        <h3 className="bcard__title">{bit.name}</h3>
        <p className="mcard__tagline">{bit.use}</p>
        {props.kits?.length ? (
          <p className="bcard__kits">
            <span>In</span>{" "}
            {props.kits.map((k, i) => (
              <span key={k.url}>
                {i ? ", " : ""}
                <a href={sienciLink(k.url, props.placement, `kit-${bit.id}`)} target="_blank" rel="noreferrer">
                  {k.name}
                </a>
              </span>
            ))}
          </p>
        ) : null}
        <dl className="bcard__specs">
          {specs.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {props.feeds ? <FeedsLine f={props.feeds} /> : null}
        {props.compat ? <span className={`bcard__compat bcard__compat--${props.compat.level}`}>{props.compat.label}</span> : null}
      </div>
      <div className="mcard__foot bcard__foot">
        {props.onToggle ? (
          // The state shows on the photo ("In my bits"); the button only says what it does.
          <button className={`bcard__toggle ${props.owned ? "is-on" : "is-add"}`} aria-pressed={!!props.owned} onClick={props.onToggle} title={props.owned ? "Remove from my bits" : "Add to my bits"}>
            {props.owned ? (
              <>
                <X size={14} strokeWidth={2.25} /> Remove
              </>
            ) : (
              <>
                <Plus size={14} strokeWidth={2.5} /> {props.removed ? "Add back" : "I have this bit"}
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

/** "Official Sienci feeds" / "Estimated" badge and the main numbers (feed, RPM with the Makita dial, depth per pass). */
function FeedsLine({ f }: { f: BitFeeds }) {
  const x = f.feeds;
  return (
    <div className="bcard__feeds" title={f.detail}>
      <span className={`bcard__feedsbadge bcard__feedsbadge--${f.badge}`}>{f.label}</span>
      {x ? (
        <span className="bcard__feedsnums">
          {x.feed.toLocaleString("en-US")} mm/min · {x.rpm.toLocaleString("en-US")} RPM{x.dial ? ` (dial ${x.dial})` : ""} · {x.slotStepdown ?? x.pocketStepdown} mm/pass
        </span>
      ) : null}
      <span className="bcard__feedswhy">{f.detail}</span>
    </div>
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
