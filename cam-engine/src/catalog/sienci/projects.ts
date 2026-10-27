import type { PlateSpecInput } from "../../schema.js";
import type { HeadId } from "./heads.js";
import { compatibility, BIT_BY_ID } from "./bits.js";
import { MACHINES, type MachineId } from "./machines.js";
import type { Speed } from "./table.js";

/**
 * Projetos prontos para testar a máquina e fazer os primeiros cortes. A ordem é a sugerida
 * para quem acabou de montar a máquina (depois de aplainar a mesa com o Surfacing do gSender).
 */
export interface StarterProject {
  id: string;
  title: string;
  description: string;
  level: "first-cut" | "easy" | "intermediate";
  /** O que a pessoa aprende fazendo. */
  learn: string[];
  bit: string;
  cutoutBit?: string;
  speed?: Speed;
  plate: PlateSpecInput;
}

export const PROJECTS: StarterProject[] = [
  {
    id: "depth-test",
    title: "Teste de profundidade",
    description: "Grava 1, 2 e 3 em profundidades de 1, 2 e 3 mm numa sobra de MDF. Sem recorte: nada se solta.",
    level: "first-cut",
    learn: ["Prender o material", "Zerar X, Y e Z", "Conferir a profundidade com um paquímetro"],
    bit: "flat-1-8-upcut",
    speed: "reduced",
    plate: {
      width: 120, height: 40, thickness: 12, material: "mdf", outerCutout: false,
      texts: [
        { content: "1", size: 22, mode: "engrave", depth: 1, x: 20, y: 20 },
        { content: "2", size: 22, mode: "engrave", depth: 2, x: 60, y: 20 },
        { content: "3", size: 22, mode: "engrave", depth: 3, x: 100, y: 20 },
      ],
    },
  },
  {
    id: "coaster",
    title: "Porta-copos com inicial",
    description: "Disco de 10 cm com uma letra gravada, recortado com abas. Lembra o porta-copos dos primeiros projetos da Sienci.",
    level: "first-cut",
    learn: ["Recorte com abas", "Soltar a peça e lixar as abas"],
    bit: "flat-1-8-upcut",
    plate: {
      width: 100, height: 100, thickness: 6, material: "mdf",
      edge: { type: "rounded", radius: 50 },
      texts: [{ content: "A", size: 45, mode: "engrave", depth: 2 }],
    },
  },
  {
    id: "door-sign",
    title: "Placa de porta em relevo",
    description: "\"Casa da Ana\" em relevo de 3 mm, com moldura, cantos arredondados e dois furos para parafusar.",
    level: "easy",
    learn: ["Relevo (rebaixar o fundo)", "Furos de fixação", "Peça mais longa (~20 min)"],
    bit: "flat-1-8-upcut",
    plate: {
      width: 200, height: 100, thickness: 15, material: "mdf",
      edge: { type: "rounded", radius: 10 },
      texts: [{ content: "Casa da Ana", size: 16, mode: "relief", depth: 3 }],
      holes: [{ x: 15, y: 85, diameter: 5 }, { x: 185, y: 85, diameter: 5 }],
    },
  },
  {
    id: "pet-plaque",
    title: "Plaquinha de pet",
    description: "Nome gravado com coração e folha, rasgo para pendurar. Usa duas fresas: 1/16″ para os detalhes e 1/8″ para o recorte.",
    level: "intermediate",
    learn: ["Troca de fresa no meio do trabalho", "Rezerar o Z depois da troca"],
    bit: "flat-1-16-downcut",
    cutoutBit: "flat-1-8-upcut",
    plate: {
      width: 150, height: 90, thickness: 12, material: "softwood",
      edge: { type: "chamfered", radius: 8 },
      texts: [
        { content: "LUNA", font: "bebas-neue", size: 30, mode: "engrave", depth: 2 },
        { content: "desde 2024", font: "archivo-black", size: 9, mode: "engrave", depth: 1.5 },
      ],
      icons: [
        { id: "heart", x: 22, y: 70, size: 16, mode: "engrave", depth: 2 },
        { id: "leaf", x: 128, y: 70, size: 16, mode: "engrave", depth: 2 },
      ],
      slots: [{ x: 75, y: 80, length: 14, width: 6 }],
    },
  },
  {
    id: "welcome-sign",
    title: "Letreiro \"Bem-vindos\"",
    description: "Letras cursivas ligadas, recortadas de compensado com fresa de compressão (as duas faces ficam limpas).",
    level: "intermediate",
    learn: ["Letreiro recortado", "Fresa de compressão em compensado"],
    bit: "flat-1-8-compression",
    speed: "regular",
    plate: {
      type: "lettering", width: 260, height: 110, thickness: 6, material: "plywood",
      texts: [{ content: "Bem-vindos", font: "pacifico", size: 40 }],
    },
  },
  {
    id: "acrylic-keychain",
    title: "Chaveiro de acrílico",
    description: "Tag de acrílico com nome gravado em V e furo para a argola. Fresa de 1 canal para o acrílico não derreter.",
    level: "intermediate",
    learn: ["Cortar plástico", "Gravação com fresa em V"],
    bit: "vbit-30-1-8",
    cutoutBit: "flat-1-8-1flute",
    plate: {
      width: 70, height: 30, thickness: 3, material: "acrylic",
      edge: { type: "rounded", radius: 8 },
      texts: [{ content: "LEO", font: "bebas-neue", size: 14, mode: "engrave", depth: 0.6, x: 42, y: 15 }],
      holes: [{ x: 10, y: 15, diameter: 5 }],
    },
  },
  {
    id: "address-sign",
    title: "Placa de endereço grande",
    description: "Número em relevo numa placa de 90 × 30 cm, com fresa de 1/4″. Só cabe nas máquinas maiores.",
    level: "intermediate",
    learn: ["Peças grandes", "Fresa de 1/4″ para rebaixos rápidos"],
    bit: "flat-1-4-upcut",
    plate: {
      width: 900, height: 300, thickness: 19, material: "mdf",
      edge: { type: "rounded", radius: 20 },
      frame: 15,
      texts: [{ content: "1234", font: "archivo-black", size: 160, mode: "relief", depth: 4 }],
      holes: [{ x: 30, y: 270, diameter: 8 }, { x: 870, y: 270, diameter: 8 }],
    },
  },
];

export interface ProjectOnMachine {
  project: StarterProject;
  fits: boolean;
  /** Acessórios necessários (ex.: pinça 1/8″ no Makita). */
  accessories: string[];
  /** Motivo para não dar (bloco maior que a máquina, fresa que não prende…). */
  blockers: string[];
}

/** Lista os projetos com o que cada um precisa nesta máquina e cabeçote. */
export function projectsForMachine(machine: MachineId, headId?: HeadId): ProjectOnMachine[] {
  const m = MACHINES[machine];
  const head = headId ?? m.defaultHead;
  return PROJECTS.map((project) => {
    const p = project.plate;
    const margin = (p.outerCutout ?? true) ? 2 * (p.margin ?? 10) : 0;
    const blockers: string[] = [];
    const accessories: string[] = [];
    if (p.width + margin > m.travel.x || p.height + margin > m.travel.y) {
      blockers.push(`O bloco (${p.width + margin} × ${p.height + margin} mm) não cabe na ${m.name}.`);
    }
    for (const id of [project.bit, project.cutoutBit].filter(Boolean) as string[]) {
      const c = compatibility(BIT_BY_ID.get(id)!, head);
      if (c.status === "incompatible") blockers.push(c.reason);
      if (c.status === "with-accessory" && !accessories.includes(c.accessory.name)) accessories.push(c.accessory.name);
    }
    return { project, fits: blockers.length === 0, accessories, blockers };
  });
}

