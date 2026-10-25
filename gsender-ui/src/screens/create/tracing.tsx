import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { create } from "zustand";
import { useDesign, type TracingImage } from "../../state/design";

const MAX_SIDE = 1400; // px: reduz a imagem para caber no armazenamento local

/** Modo "mover a imagem no quadro" (liga e desliga pelo painel). */
export const useTracingUi = create<{ moving: boolean; setMoving(v: boolean): void }>((set) => ({
  moving: false,
  setMoving: (moving) => set({ moving }),
}));

export const isImageFile = (f: File) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);

/** Carrega a imagem do arquivo já reduzida (fundo branco onde era transparente). */
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

/** Nova imagem de decalque, cabendo na peça e centrada. */
export async function tracingFromFile(file: File, plate: { largura: number; altura: number }): Promise<TracingImage> {
  const { src, w, h } = await loadImageFile(file);
  const aspect = h / w;
  const width = Math.round(Math.min(plate.largura, plate.altura / aspect) * 10) / 10;
  return { src, name: file.name, x: plate.largura / 2, y: plate.altura / 2, width, aspect, opacity: 0.5, visible: true };
}

/** Pixels (rgba) da imagem de decalque, reduzida a `maxSide`, para a vetorização. */
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
 * A imagem de decalque no quadro, sob o desenho. No modo mover, recebe o ponteiro e pode ser
 * arrastada; fora dele, é só uma referência visual.
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
      /* ponteiro sintético */
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
