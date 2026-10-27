import { BitSilhouette } from "../../components/BitSilhouette";
import { compat, type Bit, type HeadId } from "../../lib/catalog";

/** Makita speed dial (settings 1–6). `on` highlights the requested setting. */
export function Dial({ size = 96, on, labelSize = 12 }: { size?: number; on?: number; labelSize?: number }) {
  const c = size / 2;
  const r = size * 0.35;
  return (
    <div className="dial" style={{ width: size, height: size }} aria-hidden="true">
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const a = ((-210 + n * 40) * Math.PI) / 180;
        return (
          <span key={n} className={`dial__tick ${on === n ? "is-on" : ""}`} style={{ left: c + Math.cos(a) * r - 8, top: c + Math.sin(a) * r - 8, fontSize: labelSize, color: on === n ? undefined : "#D6D3CD" }}>
            {n}
          </span>
        );
      })}
      {on ? null : <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--text)" }} />}
    </div>
  );
}

export function compatBadge(bit: Bit, head: HeadId) {
  const c = compat(bit, head);
  const label = c.level === "fits" ? `${c.label} ✓` : c.level === "accessory" ? `${c.label} · see in store` : c.label;
  return (
    <span className={`ws-compat ws-compat--${c.level}`} title={c.accessory?.name}>
      {label}
    </span>
  );
}

export function bitSpecs(b: Bit) {
  const inch = b.inch.endsWith("mm") ? "" : ` · ${b.inch}`;
  return `Ø ${+b.d.toFixed(2)} mm${inch} · shank ${b.shank}″ · cut ${+b.cut.toFixed(1)} mm`;
}

/** Bit card with silhouette, specs and compatibility badge. */
export function BitCardBody({ bit, head, corner }: { bit: Bit; head: HeadId; corner?: React.ReactNode }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <BitSilhouette profile={bit.profile} d={bit.d} size={76} />
        {corner}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
        <span className="ws-bit-name">{bit.name}</span>
        <span className="ws-bit-specs">{bitSpecs(bit)}</span>
        <span className="ws-bit-use">{bit.use}</span>
      </div>
      {compatBadge(bit, head)}
    </>
  );
}

export const cm = ([w, h]: [number, number]) => `${Math.round(w / 10)} × ${Math.round(h / 10)} cm work area`;
