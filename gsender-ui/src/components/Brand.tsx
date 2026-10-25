/**
 * Marca CarvCAM: ícone (fresa mergulhada na tábua, abrindo um canal, com dois cavacos) e a
 * palavra "Carv" (Geist 600) + "CAM" (Geist Mono 500). Cores: laranja #FF5B1F e grafite #111214.
 */
export function CarvIcon({ size = 28, bg = "#FF5B1F", ink = "#111214" }: { size?: number; bg?: string; ink?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ display: "block", flex: "none" }}>
      <rect width="100" height="100" rx="22.5" fill={bg} />
      <rect x="16" y="60" width="68" height="22" rx="4" fill={ink} />
      <path d="M12 59 H57 V64 A5 5 0 0 1 52 69 H12 Z" fill={bg} />
      <g stroke={bg} strokeWidth="2.5">
        <rect x="46.5" y="16" width="9" height="26" rx="1.5" fill={ink} />
        <path d="M45 42 H57 V65 L51 69.5 L45 65 Z" fill={ink} strokeLinejoin="round" />
      </g>
      <g stroke={bg} strokeWidth="2" strokeLinecap="round">
        <path d="M46 51 L56 46.5" />
        <path d="M46 58.5 L56 54" />
      </g>
      <rect x="33" y="50" width="4.5" height="4.5" rx="1" fill={ink} transform="rotate(20 35 52)" />
      <rect x="25" y="44" width="3.5" height="3.5" rx="1" fill={ink} transform="rotate(-15 27 46)" />
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      Carv<span className="wordmark__cam">CAM</span>
    </span>
  );
}

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <span className="brand" aria-label="CarvCAM">
      <CarvIcon size={size} />
      <Wordmark size={Math.round(size * 0.62)} />
    </span>
  );
}
