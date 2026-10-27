import { maskFromRgba, regionToSvg, traceMask } from "@gsender-next/cam-engine";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Seg } from "../../components/ui";
import { useDesign, type TracingImage } from "../../state/design";
import { toast } from "../../state/ui";
import { addSvg, type ElementId } from "./elements";
import { tracingPixels } from "./tracing";

type Region = { x: number; y: number }[][];

function regionBounds(r: Region) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of r)
    for (const q of p) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  return { minX, minY, maxX, maxY };
}

/**
 * Converte a imagem de decalque em vetor: limiar, inverter, suavizar e ignorar manchas, com
 * prévia ao vivo. O resultado entra como um desenho comum, exatamente em cima da imagem.
 */
export function TraceDialog({ tracing, onClose, onAdded }: { tracing: TracingImage; onClose(): void; onAdded(id: ElementId): void }) {
  const patchSpec = useDesign((s) => s.patchSpec);
  const [px, setPx] = useState<ImageData | null>(null);
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [smooth, setSmooth] = useState(2);
  const [blobs, setBlobs] = useState(2); // mm²
  const [region, setRegion] = useState<Region | null>(null);

  useEffect(() => {
    tracingPixels(tracing).then(setPx, () => toast("The tracing image could not be read."));
  }, [tracing]);

  const k = px ? tracing.width / px.width : 1; // mm por pixel
  useEffect(() => {
    if (!px) return;
    const t = setTimeout(() => {
      const mask = maskFromRgba(px.data, px.width, px.height, threshold, invert);
      setRegion(traceMask(mask, px.width, px.height, { smooth, minBlob: blobs / (k * k), detail: 0.6 }) as Region);
    }, 90);
    return () => clearTimeout(t);
  }, [px, threshold, invert, smooth, blobs, k]);

  const d = useMemo(() => (region ? region.map((p) => "M" + p.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("L") + "Z").join("") : ""), [region]);
  const empty = region !== null && region.length === 0;

  const add = () => {
    if (!px || !region || !region.length) return;
    const b = regionBounds(region);
    const svg = regionToSvg(region, px.width, px.height);
    const cx = tracing.x + ((b.minX + b.maxX) / 2 - px.width / 2) * k;
    const cy = tracing.y - ((b.minY + b.maxY) / 2 - px.height / 2) * k;
    const width = Math.round((b.maxX - b.minX) * k * 10) / 10;
    const spec = useDesign.getState().design.spec;
    const out = addSvg(spec, svg, tracing.name.replace(/\.[a-z0-9]+$/i, "") + " (traced)", cx, cy);
    if ("error" in out) return toast(out.error);
    const [next, id] = out;
    next.svgs![next.svgs!.length - 1].width = width;
    patchSpec(() => next);
    onAdded(id);
    onClose();
  };

  // Portal: o painel lateral tem backdrop-filter, que prenderia o position: fixed dentro dele.
  return createPortal(
    <div className="create-modal" role="dialog" aria-modal="true" aria-label="Convert image to vector" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="create-modal__card">
        <div className="create-modal__head">
          <h3>Convert image to vector</h3>
          <button className="create-modal__close" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="create-modal__body">
          <div className="create-trace__preview">
            {px ? (
              <svg viewBox={`0 0 ${px.width} ${px.height}`}>
                <image href={tracing.src} width={px.width} height={px.height} opacity={0.35} />
                <path d={d} fillRule="evenodd" fill="#FF5B1F" fillOpacity={0.85} stroke="#111214" strokeWidth={Math.max(0.6, px.width / 500)} />
              </svg>
            ) : (
              <div className="muted">Reading the image…</div>
            )}
          </div>
          <div className="create-trace__controls">
            <label className="create-trace__row">
              <span>
                Threshold <span className="mono tiny muted">{threshold}</span>
              </span>
              <input className="create-range" type="range" min={10} max={245} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </label>
            <div className="create-trace__row">
              <span>Carve the</span>
              <Seg<"dark" | "light">
                label="Carve the"
                value={invert ? "light" : "dark"}
                onChange={(v) => setInvert(v === "light")}
                options={[
                  ["dark", "Dark parts"],
                  ["light", "Light parts"],
                ]}
              />
            </div>
            <label className="create-trace__row">
              <span>
                Smoothing <span className="mono tiny muted">{smooth}</span>
              </span>
              <input className="create-range" type="range" min={0} max={4} value={smooth} onChange={(e) => setSmooth(Number(e.target.value))} />
            </label>
            <label className="create-trace__row">
              <span>
                Ignore specks under <span className="mono tiny muted">{blobs} mm²</span>
              </span>
              <input className="create-range" type="range" min={0} max={40} step={0.5} value={blobs} onChange={(e) => setBlobs(Number(e.target.value))} />
            </label>
            <div className="tiny muted">
              {empty ? "Nothing is dark enough at this threshold. Move the slider or switch to light parts." : region ? `${region.length} outline${region.length === 1 ? "" : "s"} · lands exactly over the image on the board` : "Tracing…"}
            </div>
            <div className="create-modal__actions">
              <button className="btn btn--outline" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn--primary" disabled={!region || empty} onClick={add}>
                Add to sign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
