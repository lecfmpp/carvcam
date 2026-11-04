import type { PlateSpecInput } from "@carvcam/cam-engine";
import { isPdfFile, pdfFileToSvg } from "../../lib/pdfToSvg";
import { toast } from "../../state/ui";
import { addSvg, type ElementId } from "./elements";

const MAX_BYTES = 3_000_000;
/** PDFs and .ai files carry fonts and previews, so they may be bigger than the drawing they hold. */
const MAX_PDF_BYTES = 30_000_000;

/** Opens the system file picker and returns the chosen drawing (or null). */
export function pickSvgFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,.dxf,.pdf,.ai,image/svg+xml,image/vnd.dxf,application/dxf,application/pdf,application/postscript";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const isSvgFile = (f: File) => f.type === "image/svg+xml" || f.type === "application/pdf" || /\.(svg|dxf|pdf|ai)$/i.test(f.name);

/**
 * Reads the file (SVG, DXF, PDF or Illustrator .ai) and adds the drawing at the center of the part. Shows a notice and
 * returns null if the file can't be used.
 */
export async function importSvgFile(file: File, spec: PlateSpecInput): Promise<[PlateSpecInput, ElementId] | null> {
  if (!isSvgFile(file)) {
    toast("Import SVG, DXF, PDF or Illustrator (.ai) files. Export your drawing in one of these formats first.");
    return null;
  }
  const pdf = await isPdfFile(file);
  if (file.size > (pdf ? MAX_PDF_BYTES : MAX_BYTES)) {
    toast(pdf ? "This PDF is too large (over 30 MB). Save just the artwork as a new PDF or SVG." : "This file is too large (over 3 MB). Simplify it before importing.");
    return null;
  }
  let content: string;
  const notes: string[] = [];
  if (pdf) {
    try {
      const r = await pdfFileToSvg(file);
      content = r.svg;
      if (r.texts) notes.push("Text in this file was left out: convert it to outlines first (Illustrator: Type › Create Outlines).");
      if (r.images) notes.push("Pictures in this file were left out. To use one, trace it with Upload design › Trace a picture.");
    } catch (e) {
      toast(e instanceof Error && /PDF Compatible/.test(e.message) ? e.message : "This PDF or Illustrator file could not be read. Export the artwork as SVG and try again.", 7000);
      return null;
    }
  } else content = await file.text();
  const out = addSvg(spec, content, file.name, spec.width / 2, spec.height / 2);
  if ("error" in out) {
    toast(out.error, 7000);
    return null;
  }
  if (out[2] > 0) notes.push(`${out[2]} open line${out[2] > 1 ? "s" : ""} in this DXF will be carved as 1 mm grooves.`);
  for (const n of out[3]) if (!notes.some((x) => x.slice(0, 12) === n.slice(0, 12))) notes.push(n);
  if (notes.length) toast(notes.join(" "), 8000);
  return [out[0], out[1]];
}
