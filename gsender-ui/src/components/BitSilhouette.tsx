import type { BitProfile } from "../lib/catalog";

/** Silhueta desenhada da fresa (reta, V, bola, compressão, aplainar), como nos cards do design. */
export function BitSilhouette({ profile, d, size = 72 }: { profile: BitProfile; d: number; size?: number }) {
  // Largura do corte em pixels, proporcional ao diâmetro (limitada para caber no card).
  const w = Math.max(6, Math.min(40, d * 2.6));
  const cx = 30;
  const shank = 12;
  const hatch = (
    <pattern id={`flute-${profile}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
      <rect width="5" height="5" fill="#E4E1DB" />
      <rect width="2" height="5" fill="#8C8A85" />
    </pattern>
  );
  return (
    <svg width={size * 0.6} height={size} viewBox="0 0 60 100" aria-hidden="true">
      <defs>{hatch}</defs>
      <rect x={cx - shank / 2} y={0} width={shank} height={48} rx={2} fill="#6E6C68" />
      {profile === "v" ? (
        <path d={`M${cx - 14} 48 L${cx + 14} 48 L${cx} 96 Z`} fill="#E4E1DB" />
      ) : profile === "surfacing" ? (
        <rect x={cx - 26} y={66} width={52} height={14} rx={2} fill="#E4E1DB" />
      ) : profile === "ball" ? (
        <path d={`M${cx - w / 2} 48 h${w} v${48 - w / 2} a${w / 2} ${w / 2} 0 0 1 ${-w} 0 Z`} fill={`url(#flute-${profile})`} />
      ) : (
        <>
          <rect x={cx - w / 2} y={48} width={w} height={48} fill={`url(#flute-${profile})`} />
          {profile === "compression" ? <rect x={cx - w / 2} y={82} width={w} height={14} fill="#B9B6B0" /> : null}
        </>
      )}
    </svg>
  );
}
