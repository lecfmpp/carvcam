import { ELEMENTS, type ElementCategory, type DesignElement, type PlateSpecInput } from "@gsender-next/cam-engine";
import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Seg } from "../../components/ui";
import { toast } from "../../state/ui";
import { addSvg, type ElementId } from "./elements";

const CATS: [ElementCategory | "all", string][] = [
  ["all", "All"],
  ["icons", "Icons"],
  ["nature", "Nature"],
  ["frames", "Frames"],
  ["dividers", "Dividers"],
];

// Na miniatura, o branco (que recorta) fica da cor do fundo do cartão.
const thumb = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/fill="#fff"/g, 'fill="#F5F3EF"'))}`;

/** Acrescenta um elemento da biblioteca no centro da peça, num tamanho que cabe nela. */
export function addLibraryElement(spec: PlateSpecInput, el: DesignElement): [PlateSpecInput, ElementId] | null {
  if (el.generate) {
    // Moldura: desenhada no tamanho da peça (8 mm para dentro), sem afinar os traços.
    const w = Math.max(30, spec.width - 16);
    const h = Math.max(30, spec.height - 16);
    const out = addSvg(spec, el.generate(w, h), el.name, spec.width / 2, spec.height / 2);
    if ("error" in out) {
      toast(out.error);
      return null;
    }
    out[0].svgs![out[0].svgs!.length - 1].width = w;
    return [out[0], out[1]];
  }
  const out = addSvg(spec, el.svg, el.name, spec.width / 2, spec.height / 2);
  if ("error" in out) {
    toast(out.error);
    return null;
  }
  const [next, id] = out;
  const v = next.svgs![next.svgs!.length - 1];
  // Tamanho sugerido do elemento, limitado a 85% da peça (molduras ocupam quase tudo).
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(el.svg);
  const aspect = vb ? Number(vb[2]) / Number(vb[1]) : 1;
  const fit = Math.min(spec.width * 0.85, (spec.height * 0.85) / aspect);
  v.width = Math.round(Math.min(el.width, fit) * 10) / 10;
  return [next, id];
}

export function LibraryDialog({ onPick, onClose }: { onPick(el: DesignElement): void; onClose(): void }) {
  const [cat, setCat] = useState<ElementCategory | "all">("all");
  const list = ELEMENTS.filter((e) => cat === "all" || e.category === cat);
  return createPortal(
    <div className="create-modal" role="dialog" aria-modal="true" aria-label="Design elements" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="create-modal__card">
        <div className="create-modal__head">
          <h3>Design elements</h3>
          <button className="create-modal__close" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="create-lib">
          <Seg<ElementCategory | "all"> label="Category" value={cat} onChange={setCat} options={CATS} />
          <div className="create-lib__grid">
            {list.map((e) => (
              <button
                key={e.id}
                className="create-lib__item"
                onClick={() => {
                  onPick(e);
                  onClose();
                }}
              >
                <span className="create-lib__thumb">
                  <img src={thumb(e.svg)} alt="" />
                </span>
                <span className="create-lib__name">{e.name}</span>
              </button>
            ))}
          </div>
          <div className="tiny muted">Every element is sized to carve cleanly with a 1/8″ bit. Once added, change its size, style and depth like any other drawing.</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
