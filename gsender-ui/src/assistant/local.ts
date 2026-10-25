import type { PlateSpecInput } from "@gsender-next/cam-engine";
import type { AssistantContext, AssistantProvider, AssistantReply } from "./types";

type Icon = NonNullable<PlateSpecInput["icones"]>[number]["id"];

const ICON_WORDS: [RegExp, Icon, string][] = [
  [/\bheart\b/, "coracao", "heart"],
  [/\bstar\b/, "estrela", "star"],
  [/\b(house|home)\b/, "casa", "house"],
  [/\bleaf\b/, "folha", "leaf"],
];

/**
 * Assistente offline: entende pedidos comuns em inglês e devolve a especificação alterada.
 * Não precisa de rede nem de chave; é o padrão até a pessoa conectar o Claude.
 */
export const localAssistant: AssistantProvider = {
  name: "Built-in",
  async send(message, ctx) {
    return interpret(message, ctx);
  },
};

export function interpret(message: string, ctx: AssistantContext): AssistantReply {
  const low = message.toLowerCase();
  const spec = structuredClone(ctx.spec);
  const texts = spec.texto ?? (spec.texto = []);
  const first = texts[0];
  const icon = ICON_WORDS.find(([re]) => re.test(low));

  if (/\b(lion|dog|cat|horse|box|3d|bowl|statue|gear|bracket|portrait|photo)\b/.test(low) && !icon)
    return { text: "This version makes flat signs and lettering, so 3D carvings aren't possible yet. I can engrave a simple shape on the sign instead, like a heart, star, house or leaf." };

  // Texto entre aspas: "change the text to …", "says …"
  const quoted = /["“”'‘’]([^"“”'‘’]{1,60})["“”'‘’]/.exec(message)?.[1] ?? /\b(?:says|text to|reads?|write)\s+(.{1,60})$/i.exec(message)?.[1];
  if (quoted && /\b(text|say|says|read|write|name|change)\b/.test(low)) {
    const value = quoted.trim();
    if (first) first.conteudo = value;
    else texts.push({ conteudo: value, tamanho: Math.round(spec.altura / 5), modo: spec.tipo === "letreiro" ? "recorte" : "relevo", profundidade: 3 });
    return { text: `The text now says "${value}".`, spec };
  }

  if (/cut.?out|lettering/.test(low) && spec.tipo !== "letreiro") {
    spec.tipo = "letreiro";
    spec.texto = texts.map((t) => ({ ...t, fonte: "pacifico", modo: "recorte", x: undefined, y: undefined }));
    spec.icones = [];
    spec.furos = [];
    spec.rasgos = [];
    return { text: `Switched to cut-out lettering in Pacifico. The letters join, so "${first?.conteudo ?? "the text"}" comes out as one piece.`, spec };
  }
  if (/\bsign\b/.test(low) && spec.tipo === "letreiro") {
    spec.tipo = "placa";
    spec.texto = texts.map((t) => ({ ...t, fonte: "archivo-black", modo: "relevo", profundidade: 3 }));
    return { text: `Back to a ${spec.largura} × ${spec.altura} mm sign with raised letters.`, spec };
  }

  if (icon) {
    const [, id, name] = icon;
    spec.icones = [...(spec.icones ?? []), { id, x: spec.largura - 22, y: 22, tamanho: 18, modo: "gravado", profundidade: 2 }];
    return { text: `Added a ${name} in the lower-right corner, engraved 2 mm deep.`, spec };
  }

  const size = /(\d+(?:[.,]\d+)?)\s*(cm|mm)\b\s*(wide|long|tall|high)?/.exec(low);
  if (size && /\b(wide|long|tall|high|width|height|make it|size)\b/.test(low)) {
    const mm = parseFloat(size[1].replace(",", ".")) * (size[2] === "cm" ? 10 : 1);
    const vertical = size[3] === "tall" || size[3] === "high" || /\bheight\b/.test(low);
    if (vertical) spec.altura = Math.round(mm);
    else spec.largura = Math.round(mm);
    return { text: `The ${spec.tipo === "letreiro" ? "board" : "sign"} is now ${spec.largura} × ${spec.altura} mm.`, spec };
  }

  if (/\b(bigger|larger|taller)\b/.test(low) && texts.length) {
    spec.texto = texts.map((t) => ({ ...t, tamanho: Math.round(t.tamanho * 1.2) }));
    return { text: `Made the letters bigger (${spec.texto[0].tamanho} mm).`, spec };
  }
  if (/\b(smaller|shorter|tiny)\b/.test(low) && texts.length) {
    spec.texto = texts.map((t) => ({ ...t, tamanho: Math.max(6, Math.round(t.tamanho / 1.2)) }));
    return { text: `Made the letters smaller (${spec.texto[0].tamanho} mm).`, spec };
  }

  if (/\b(script|cursive|handwrit)/.test(low)) {
    spec.texto = texts.map((t) => ({ ...t, fonte: "pacifico" }));
    return { text: "Switched to Pacifico, a script where the letters join.", spec };
  }
  if (/\b(condensed|narrow|tall letters)\b/.test(low)) {
    spec.texto = texts.map((t) => ({ ...t, fonte: "bebas-neue" }));
    return { text: "Switched to Bebas Neue. It's condensed, so the strokes are thinner; check the warnings.", spec };
  }
  if (/\b(thick|thicker|bold|bolder|heavier)\b/.test(low)) {
    spec.texto = texts.map((t) => ({ ...t, fonte: "archivo-black" }));
    return { text: "Switched to Archivo Black, the boldest font. It is also the easiest to cut.", spec };
  }

  if (/engrav/.test(low)) {
    spec.texto = texts.map((t) => ({ ...t, modo: "gravado", profundidade: Math.min(t.profundidade ?? 3, 3) }));
    return { text: "The letters are now engraved into the face.", spec };
  }
  if (/\braise/.test(low)) {
    spec.texto = texts.map((t) => ({ ...t, modo: "relevo" }));
    return { text: `The letters are now raised; the background is lowered ${first?.profundidade ?? 3} mm.`, spec };
  }
  if (/cut (all the way )?through|stencil/.test(low)) {
    spec.texto = texts.map((t) => ({ ...t, modo: "recorte" }));
    return { text: "The letters now cut all the way through, like a stencil.", spec };
  }

  if (/\b(hole|holes|screw|mount)/.test(low)) {
    const d = 5;
    spec.rasgos = [];
    spec.furos = [
      { x: 14, y: spec.altura - 14, diametro: d },
      { x: spec.largura - 14, y: spec.altura - 14, diametro: d },
    ];
    return { text: `Added two ${d} mm mounting holes near the top corners.`, spec };
  }
  if (/\b(hang|slot|keyhole)/.test(low)) {
    spec.furos = [];
    spec.rasgos = [{ x: spec.largura / 2, y: spec.altura - 14, comprimento: 14, largura: 6, angulo: 0 }];
    return { text: "Added a hanging slot at the top centre.", spec };
  }

  if (/chamfer/.test(low)) {
    spec.borda = { tipo: "chanfrada", raio: spec.borda?.raio || 8 };
    return { text: "The edge is now chamfered.", spec };
  }
  if (/round/.test(low)) {
    spec.borda = { tipo: "arredondada", raio: spec.borda?.raio || 10 };
    return { text: "The edge is now rounded.", spec };
  }
  if (/\b(straight|square)\b/.test(low)) {
    spec.borda = { tipo: "reta", raio: 0 };
    return { text: "The edge is now straight.", spec };
  }
  if (/\bframe\b/.test(low)) {
    const off = /\b(no|remove|without)\b/.test(low);
    spec.moldura = off ? 0 : 6;
    return { text: off ? "Removed the raised frame." : "Added a 6 mm raised frame around the edge.", spec };
  }

  return { text: 'I can change the text, font, letter size, edge, icon, holes or the sign size. Try "make the edge chamfered" or "add a star".' };
}
