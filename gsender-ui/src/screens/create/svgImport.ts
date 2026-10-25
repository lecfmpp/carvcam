import type { PlateSpecInput } from "@gsender-next/cam-engine";
import { toast } from "../../state/ui";
import { addSvg, type ElementId } from "./elements";

const MAX_BYTES = 3_000_000;

/** Abre o seletor de arquivos do sistema e devolve o SVG escolhido (ou null). */
export function pickSvgFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const isSvgFile = (f: File) => f.type === "image/svg+xml" || /\.svg$/i.test(f.name);

/**
 * Lê o arquivo e acrescenta o desenho no centro da peça. Mostra um aviso e devolve null se o
 * arquivo não servir.
 */
export async function importSvgFile(file: File, spec: PlateSpecInput): Promise<[PlateSpecInput, ElementId] | null> {
  if (!isSvgFile(file)) {
    toast("Only SVG files can be imported. Export your drawing as SVG first.");
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast("This SVG is too large (over 3 MB). Simplify it before importing.");
    return null;
  }
  const out = addSvg(spec, await file.text(), file.name, spec.largura / 2, spec.altura / 2);
  if ("error" in out) {
    toast(out.error);
    return null;
  }
  return out;
}
