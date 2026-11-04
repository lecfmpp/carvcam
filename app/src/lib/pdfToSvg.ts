/**
 * PDF and Adobe Illustrator (.ai, saved with "Create PDF Compatible File", the default) import:
 * pdf.js reads the vector drawing of the first page and this file rebuilds it as SVG (paths with
 * their transforms, fills, strokes, white fills and clipping paths), which the engine's SVG importer
 * then turns into a cuttable region. Text that isn't outlined and embedded pictures are counted so
 * the import can say they were left out.
 */

type Ops = Record<string, number>;
type M = [number, number, number, number, number, number];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const f = (n: number) => (Math.abs(n) < 1e-9 ? "0" : String(Math.round(n * 1000) / 1000));
const mat = (m: M) => `matrix(${m.map(f).join(" ")})`;

/** Hex color from pdf.js color arguments (a "#rrggbb" string, or 0–255 numbers). */
function color(args: unknown[]): string {
  if (typeof args[0] === "string") return args[0].toLowerCase();
  const [r, g, b] = (args as number[]).map((v) => Math.max(0, Math.min(255, Math.round(v ?? 0))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
const grayColor = (g: number) => {
  const v = Math.round(Math.max(0, Math.min(1, g)) * 255).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
};
const cmykColor = (a: number[]) => {
  const [c, m, y, k] = a.map((v) => (v > 1 ? v / 100 : v));
  const ch = (x: number) => Math.round(255 * (1 - x) * (1 - k));
  return color([ch(c), ch(m), ch(y)]);
};

/** pdf.js constructPath (v4): op codes plus a flat list of coordinates → SVG path data. */
function pathData(OPS: Ops, ops: number[], args: number[]): string {
  let d = "";
  let j = 0;
  let x = 0,
    y = 0;
  for (const op of ops) {
    if (op === OPS.moveTo) {
      x = args[j++];
      y = args[j++];
      d += `M${f(x)} ${f(y)}`;
    } else if (op === OPS.lineTo) {
      x = args[j++];
      y = args[j++];
      d += `L${f(x)} ${f(y)}`;
    } else if (op === OPS.curveTo) {
      d += `C${f(args[j])} ${f(args[j + 1])} ${f(args[j + 2])} ${f(args[j + 3])} ${f(args[j + 4])} ${f(args[j + 5])}`;
      x = args[j + 4];
      y = args[j + 5];
      j += 6;
    } else if (op === OPS.curveTo2) {
      d += `C${f(x)} ${f(y)} ${f(args[j])} ${f(args[j + 1])} ${f(args[j + 2])} ${f(args[j + 3])}`;
      x = args[j + 2];
      y = args[j + 3];
      j += 4;
    } else if (op === OPS.curveTo3) {
      d += `C${f(args[j])} ${f(args[j + 1])} ${f(args[j + 2])} ${f(args[j + 3])} ${f(args[j + 2])} ${f(args[j + 3])}`;
      x = args[j + 2];
      y = args[j + 3];
      j += 4;
    } else if (op === OPS.closePath) d += "Z";
    else if (op === OPS.rectangle) {
      const [rx, ry, w, h] = [args[j], args[j + 1], args[j + 2], args[j + 3]];
      j += 4;
      d += `M${f(rx)} ${f(ry)}h${f(w)}v${f(h)}h${f(-w)}Z`;
      x = rx;
      y = ry;
    }
  }
  return d;
}

export interface PdfSvg {
  svg: string;
  texts: number;
  images: number;
}

/**
 * Rebuilds a page's operator list as SVG. `view` is the page box [x0, y0, x1, y1] in points; the
 * SVG keeps PDF units (1 pt = 1/72 in) and flips Y so the drawing reads the right way up.
 */
export function operatorListToSvg(OPS: Ops, fnArray: number[], argsArray: unknown[][], view: number[]): PdfSvg {
  const [x0, y0, x1, y1] = view;
  const W = x1 - x0,
    H = y1 - y0;
  type State = { m: M; fill: string; stroke: string; lw: number; groups: number };
  let st: State = { m: [1, 0, 0, -1, -x0, y1], fill: "#000000", stroke: "#000000", lw: 1, groups: 0 };
  const stack: State[] = [];
  const out: string[] = [];
  const defs: string[] = [];
  let pending: string | null = null; // path built, waiting for paint / clip
  let pendingClip: "nonzero" | "evenodd" | null = null;
  let clipN = 0;
  let texts = 0,
    images = 0;

  const paint = (fill: boolean, stroke: boolean, evenodd = false, close = false) => {
    if (pending) {
      const d = close ? `${pending}Z` : pending;
      const fl = fill ? st.fill : "none";
      const sk = stroke ? `stroke="${st.stroke}" stroke-width="${f(Math.max(st.lw, 0.01))}"` : `stroke="none"`;
      out.push(`<path transform="${mat(st.m)}" d="${d}" fill="${fl}"${evenodd && fill ? ` fill-rule="evenodd"` : ""} ${sk}/>`);
    }
    endPath();
  };
  const endPath = () => {
    if (pending && pendingClip) {
      const id = `pdfclip${clipN++}`;
      defs.push(`<clipPath id="${id}"><path transform="${mat(st.m)}" d="${pending}"${pendingClip === "evenodd" ? ` clip-rule="evenodd"` : ""}/></clipPath>`);
      out.push(`<g clip-path="url(#${id})">`);
      st.groups++;
    }
    pending = null;
    pendingClip = null;
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] ?? [];
    switch (fn) {
      case OPS.save:
        stack.push(st);
        st = { ...st, groups: 0 };
        break;
      case OPS.restore: {
        for (let k = 0; k < st.groups; k++) out.push("</g>");
        st = stack.pop() ?? st;
        break;
      }
      case OPS.transform:
        st.m = mul(st.m, a as M);
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push(st);
        st = { ...st, groups: 0 };
        const m = a[0] as M | null;
        if (m && m.length === 6) st.m = mul(st.m, Array.from(m) as M);
        break;
      }
      case OPS.paintFormXObjectEnd:
        for (let k = 0; k < st.groups; k++) out.push("</g>");
        st = stack.pop() ?? st;
        break;
      case OPS.setLineWidth:
        st.lw = Number(a[0]) || 0;
        break;
      case OPS.setGState:
        // Graphics state dictionary (gs): line width can be set here too.
        for (const [k, v] of (a[0] as [string, unknown][]) ?? []) if (k === "LW") st.lw = Number(v) || 0;
        break;
      case OPS.setFillRGBColor:
        st.fill = color(a);
        break;
      case OPS.setStrokeRGBColor:
        st.stroke = color(a);
        break;
      case OPS.setFillGray:
        st.fill = grayColor(Number(a[0]));
        break;
      case OPS.setStrokeGray:
        st.stroke = grayColor(Number(a[0]));
        break;
      case OPS.setFillCMYKColor:
        st.fill = cmykColor(a as number[]);
        break;
      case OPS.setStrokeCMYKColor:
        st.stroke = cmykColor(a as number[]);
        break;
      case OPS.constructPath: {
        const d = pathData(OPS, (a[0] as number[]) ?? [], Array.from((a[1] as ArrayLike<number>) ?? []));
        pending = (pending ?? "") + d;
        break;
      }
      case OPS.clip:
        pendingClip = "nonzero";
        break;
      case OPS.eoClip:
        pendingClip = "evenodd";
        break;
      case OPS.fill:
        paint(true, false);
        break;
      case OPS.eoFill:
        paint(true, false, true);
        break;
      case OPS.stroke:
        paint(false, true);
        break;
      case OPS.closeStroke:
        paint(false, true, false, true);
        break;
      case OPS.fillStroke:
        paint(true, true);
        break;
      case OPS.eoFillStroke:
        paint(true, true, true);
        break;
      case OPS.closeFillStroke:
        paint(true, true, false, true);
        break;
      case OPS.closeEOFillStroke:
        paint(true, true, true, true);
        break;
      case OPS.endPath:
        endPath();
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        texts++;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
        images++;
        break;
    }
  }
  while (stack.length) {
    for (let k = 0; k < st.groups; k++) out.push("</g>");
    st = stack.pop()!;
  }
  for (let k = 0; k < st.groups; k++) out.push("</g>");
  const wPt = f(W),
    hPt = f(H);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wPt}pt" height="${hPt}pt" viewBox="0 0 ${wPt} ${hPt}"><defs>${defs.join("")}</defs>${out.join("")}</svg>`;
  return { svg, texts, images };
}

/** True for PDF and Illustrator files (by name or by the %PDF header). */
export async function isPdfFile(file: File): Promise<boolean> {
  if (/\.(pdf|ai)$/i.test(file.name) || file.type === "application/pdf") return true;
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  return head === "%PDF-";
}

/** Reads the first page of a PDF or .ai file and returns it as SVG (throws a user-facing Error). */
export async function pdfFileToSvg(file: File): Promise<PdfSvg> {
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (head !== "%PDF-")
    throw new Error("This Illustrator file has no PDF data. In Illustrator, save it again with “Create PDF Compatible File” ticked, or export it as SVG.");
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    return operatorListToSvg(pdfjs.OPS as unknown as Ops, ops.fnArray, ops.argsArray as unknown[][], page.view);
  } finally {
    void doc.destroy();
  }
}
