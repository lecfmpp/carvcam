import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { create } from "zustand";
import { useDesign, type TracingImage } from "../../state/design";

const MAX_SIDE = 1400; // px: downscale the image so it fits in local storage

/** "Move the image on the board" mode (toggled from the panel). */
export const useTracingUi = create<{ moving: boolean; setMoving(v: boolean): void }>((set) => ({
  moving: false,
  setMoving: (moving) => set({ moving }),
}));

export const isImageFile = (f: File) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);

/** Loads the image from the file, already downscaled (white background where it was transparent). */
export async function loadImageFile(file: File): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("This image could not be opened."));
      i.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { src: c.toDataURL("image/jpeg", 0.85), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** New tracing image, fitted to the part and centered. */
export async function tracingFromFile(file: File, plate: { width: number; height: number }): Promise<TracingImage> {
  const { src, w, h } = await loadImageFile(file);
  const aspect = h / w;
  const width = Math.round(Math.min(plate.width, plate.height / aspect) * 10) / 10;
  return { src, name: file.name, x: plate.width / 2, y: plate.height / 2, width, aspect, opacity: 0.5, visible: true };
}

/** Pixels (rgba) of the tracing image, downscaled to `maxSide`, for vectorizing. */
export async function tracingPixels(t: TracingImage, maxSide = 700): Promise<ImageData> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image unavailable"));
    i.src = t.src;
  });
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * The tracing image on the board, under the design. In move mode it takes the pointer and can be
 * dragged; otherwise it's just a visual reference.
 */
export function TracingLayer({ margin: m, scale: s, boardH }: { margin: number; scale: number; boardH: number }) {
  const t = useDesign((st) => st.design.tracing);
  const patch = useDesign((st) => st.patch);
  const moving = useTracingUi((st) => st.moving);
  const [drag, setDrag] = useState<{ x0: number; y0: number; dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!t || !t.visible) return null;
  const h = t.width * t.aspect;
  const cx = t.x + (drag?.dx ?? 0);
  const cy = t.y + (drag?.dy ?? 0);
  const style: React.CSSProperties = {
    left: (cx - t.width / 2 + m) * s,
    top: (boardH - (cy + h / 2 + m)) * s,
    width: t.width * s,
    height: h * s,
  };
  const mmPerPx = () => {
    const r = ref.current!.getBoundingClientRect();
    return t.width / r.width;
  };
  const down = (e: RPointerEvent) => {
    if (!moving || e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    setDrag({ x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e: RPointerEvent) => {
    if (!drag) return;
    const k = mmPerPx();
    setDrag({ ...drag, dx: (e.clientX - drag.x0) * k, dy: -(e.clientY - drag.y0) * k });
  };
  const up = () => {
    if (!drag) return;
    const r = (v: number) => Math.round(v * 10) / 10;
    patch({ tracing: { ...t, x: r(t.x + drag.dx), y: r(t.y + drag.dy) } });
    setDrag(null);
  };
  return (
    <div ref={ref} className={`create-tracing ${moving ? "is-moving" : ""}`} style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <img src={t.src} alt="" draggable={false} style={{ opacity: t.opacity }} />
    </div>
  );
}
