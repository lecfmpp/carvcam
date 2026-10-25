import type { Aviso, GenerateResult, PlateSpecInput } from "@gsender-next/cam-engine";
import { BITS, type Bit } from "../../lib/catalog";
import { applyCorrection, elementName, idOf, type ElementId } from "./elements";

/** Ação de um cartão: muda a especificação, troca a fresa ou abre a loja. */
export type IssueAction =
  | { label: string; kind: "spec"; spec: PlateSpecInput }
  | { label: string; kind: "bit"; bit: string }
  | { label: string; kind: "store"; url: string };

export interface UiIssue {
  key: string;
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
  suggestion?: string;
  apply?: IssueAction;
  alts: IssueAction[];
  target: ElementId | null;
  pct?: number;
}

interface Ctx {
  spec: PlateSpecInput;
  bit: Bit | undefined;
  ownedBits: string[];
  machineName: string;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** Fresa mais fina que a pessoa tem, para "Use 1/16″ bit". */
function finerOwned(ctx: Ctx): Bit | undefined {
  const d = ctx.bit?.d ?? 3.175;
  return BITS.filter((b) => ctx.ownedBits.includes(b.id) && b.profile === "flat" && !b.notForSigns && b.d < d - 0.1).sort((a, b) => b.d - a.d)[0];
}
const finerInStore = (ctx: Ctx) => BITS.find((b) => b.profile === "flat" && b.d < (ctx.bit?.d ?? 3.175) - 0.1 && b.flute === "downcut");

/** Converte os avisos do motor (pt-BR, com código estável) nos cartões em inglês da tela Create. */
export function buildIssues(result: GenerateResult | null, ctx: Ctx): UiIssue[] {
  if (!result) return [];
  const out = result.avisos.map((a, k) => toIssue(a, k, ctx));
  for (const p of result.verificacao?.problemas ?? []) {
    if (p.severidade !== "erro") continue;
    out.push({ key: `v${p.linha}`, level: "error", title: "The carving program failed a safety check", detail: p.mensagem, alts: [], target: null });
  }
  return out.sort((a, b) => rank(a.level) - rank(b.level));
}
const rank = (l: UiIssue["level"]) => (l === "error" ? 0 : l === "warning" ? 1 : 2);

function toIssue(a: Aviso, k: number, ctx: Ctx): UiIssue {
  const { spec } = ctx;
  const target = idOf(a.elemento);
  const name = elementName(spec, target);
  const q = `"${name}"`;
  const bitName = ctx.bit?.name ?? "bit";
  const level: UiIssue["level"] = a.severidade === "erro" ? "error" : a.codigo === "PROFUNDIDADES_DIFERENTES" || a.codigo === "COMPRESSAO_PASSADA" ? "info" : "warning";
  const base: UiIssue = { key: `${a.codigo}-${k}`, level, title: a.mensagem, detail: a.sugestao ?? "", alts: [], target };
  const fix = a.correcao && a.elemento ? applyCorrection(spec, a.correcao.elemento, a.correcao.campo, a.correcao.valor) : null;

  switch (a.codigo) {
    case "TEXTO_NAO_CABE": {
      const v = a.correcao?.valor ?? Number(a.dados?.tamanhoSugerido ?? 0);
      const t = target?.startsWith("t:") ? spec.texto?.[Number(target.slice(2))] : undefined;
      const ratio = t && v ? t.tamanho / v : 1.2;
      const wider = Math.ceil((spec.largura * ratio) / 5) * 5;
      return {
        ...base,
        title: target ? `${q} doesn't fit on the ${spec.tipo === "letreiro" ? "board" : "sign"}` : "The lettering doesn't fit on the board",
        detail: `It runs past the margins of the ${spec.largura} × ${spec.altura} mm ${spec.tipo === "letreiro" ? "board" : "sign"}.`,
        suggestion: target?.startsWith("s:") ? (v ? `Make the drawing ${v} mm wide` : "Make the drawing smaller") : v ? `Reduce the letters to ${v} mm` : "Make the letters smaller",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [{ label: `Widen ${spec.tipo === "letreiro" ? "board" : "sign"} to ${wider} mm`, kind: "spec", spec: { ...spec, largura: wider } }],
      };
    }
    case "ELEMENTO_NAO_USINAVEL": {
      const finer = finerOwned(ctx);
      const t = target?.startsWith("t:") ? spec.texto?.[Number(target.slice(2))] : undefined;
      const bigger = t ? Math.ceil(t.tamanho * 1.6) : 0;
      const grow = t && target ? { ...spec, texto: spec.texto!.map((x, i) => (i === Number(target.slice(2)) ? { ...x, tamanho: bigger } : x)) } : null;
      const alts: IssueAction[] = [];
      if (finer) alts.push({ label: `Use ${finer.inch} bit`, kind: "bit", bit: finer.id });
      else {
        const s = finerInStore(ctx);
        if (s) alts.push({ label: `See ${s.inch} bit in store`, kind: "store", url: s.storeUrl });
      }
      return {
        ...base,
        title: `The strokes in ${q} are thinner than the ${bitName}`,
        detail: `The bit is ${fmt(ctx.bit?.d ?? 3.17)} mm wide, so those parts would disappear.`,
        suggestion: grow ? `Increase to ${bigger} mm` : "Make it bigger or use a finer bit",
        apply: grow ? { label: "Apply suggestion", kind: "spec", spec: grow } : undefined,
        alts,
      };
    }
    case "DETALHE_MENOR_QUE_FRESA": {
      const pct = Number(a.dados?.percentual ?? 0);
      const finer = finerOwned(ctx);
      const store = finer ? undefined : finerInStore(ctx);
      return {
        ...base,
        pct,
        title: target ? `Some of ${q} is narrower than the bit` : "Some gaps are narrower than the bit",
        detail: `About ${fmt(pct)}% of that area stays uncut, usually inside corners and tight gaps. A quick sanding fixes it.`,
        alts: finer ? [{ label: `Use ${finer.inch} bit`, kind: "bit", bit: finer.id }] : store ? [{ label: "See in store", kind: "store", url: store.storeUrl }] : [],
      };
    }
    case "PROFUNDIDADE_EXCEDE":
      return {
        ...base,
        title: `${q} would cut all the way through`,
        detail: `It is deeper than the ${spec.espessura} mm board.`,
        suggestion: a.correcao ? `Use ${a.correcao.valor} mm deep` : "Make it shallower",
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [],
      };
    case "FERRAMENTA_CURTA":
      return { ...base, title: `The ${bitName} is too short for this`, detail: `It cuts ${fmt(ctx.bit?.cut ?? 0)} mm deep at most. Use a thinner board or a longer bit.`, alts: [] };
    case "FURO_MENOR_QUE_FRESA":
    case "RASGO_MENOR_QUE_FRESA":
      return {
        ...base,
        title: a.codigo === "FURO_MENOR_QUE_FRESA" ? "The holes are smaller than the bit" : "The hanging slot is narrower than the bit",
        detail: `The ${bitName} is ${fmt(ctx.bit?.d ?? 3.17)} mm wide.`,
        suggestion: a.correcao ? `Make it ${a.correcao.valor} mm` : undefined,
        apply: fix ? { label: "Apply suggestion", kind: "spec", spec: fix } : undefined,
        alts: [],
      };
    case "FORA_DA_PECA":
      return { ...base, title: `${q} goes past the edge of the sign`, detail: "Move it inside, or make the sign bigger.", alts: [] };
    case "ILHAS_SOLTAS":
      return { ...base, title: `The middles of letters in ${q} will fall out`, detail: "Letters like O and A have centres that come loose when cut through. Raise or engrave them instead, or keep the loose pieces.", alts: [] };
    case "PECA_MAIOR_QUE_MAQUINA":
      return { ...base, title: `The board is bigger than your ${ctx.machineName}`, detail: "Make the sign smaller or switch to a bigger machine.", alts: [] };
    case "PROFUNDIDADES_DIFERENTES":
      return { ...base, title: "Raised elements share one background depth", detail: "The deepest raised depth is used for the whole background.", alts: [] };
    case "PECA_PEQUENA_SEM_ABA":
      return { ...base, title: "Some pieces are too small for holding tabs", detail: "They will come loose at the end. Hold them with double-sided tape.", alts: [] };
    case "VBIT_SO_GRAVA":
      return { ...base, title: "A V-bit can only engrave", detail: `${q} is raised or cut through. Use a flat bit, or switch it to engraved.`, alts: [] };
    case "FRESA_PRECISA_ACESSORIO":
      return {
        ...base,
        level: "warning",
        title: `The ${bitName} needs the 1/8″ collet`,
        detail: "Your router holds 1/4″ shanks out of the box.",
        alts: typeof a.dados?.url === "string" ? [{ label: "See in store", kind: "store", url: a.dados.url as string }] : [],
      };
    case "FRESA_NAO_SUPORTADA":
    case "FRESA_INCOMPATIVEL":
      return { ...base, title: `The ${bitName} can't be used for this`, detail: "Pick another bit in the Bit menu above.", alts: [] };
    case "COMPRESSAO_PASSADA":
      return { ...base, title: "Deeper first pass for the compression bit", detail: "The first pass goes past the up-cut part of the bit so both faces stay clean.", alts: [] };
    case "SEM_TABELA_SIENCI":
      return { ...base, level: "info", title: "No official speeds for this combination", detail: "We use conservative calculated values instead.", alts: [] };
    case "NADA_A_CORTAR":
      return { ...base, title: "Nothing to carve yet", detail: "Add text, a shape, an icon or an SVG file.", alts: [] };
    case "SVG_INVALIDO":
      return { ...base, title: `${q} can't be read`, detail: "Export it again as a plain SVG with text converted to outlines, or delete it.", alts: [] };
    default:
      return base;
  }
}
