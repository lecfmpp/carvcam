import type { PlateSpecInput } from "@gsender-next/cam-engine";
import { toast } from "../../state/ui";
import { addSvg, type ElementId } from "./elements";

const MAX_BYTES = 3_000_000;

/** Abre o seletor de arquivos do sistema e devolve o desenho escolhido (ou null). */
export function pickSvgFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,.dxf,image/svg+xml,image/vnd.dxf,application/dxf";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const isSvgFile = (f: File) => f.type === "image/svg+xml" || /\.(svg|dxf)$/i.test(f.name);

/**
 * Lê o arquivo (SVG ou DXF) e acrescenta o desenho no centro da peça. Mostra um aviso e
 * devolve null se o arquivo não servir.
 */
export async function importSvgFile(file: File, spec: PlateSpecInput): Promise<[PlateSpecInput, ElementId] | null> {
  if (!isSvgFile(file)) {
    toast("Only SVG and DXF files can be imported. Export your drawing in one of these formats first.");
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast("This file is too large (over 3 MB). Simplify it before importing.");
    return null;
  }
  const out = addSvg(spec, await file.text(), file.name, spec.width / 2, spec.height / 2);
  if ("error" in out) {
    toast(out.error);
    return null;
  }
  if (out[2] > 0) toast(`${out[2]} open line${out[2] > 1 ? "s" : ""} in this DXF will be carved as 1 mm grooves.`);
  return [out[0], out[1]];
}
