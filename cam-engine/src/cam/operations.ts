import { area, intersection, offset, pathArea, perimeter, pointInRegion, segmentInside, simplify, type Pt, type Region } from "../geometry/clip.js";
import { depthLevels, dist, PathBuilder, rotateToNearest } from "./builder.js";

export type Direcao = "convencional" | "concordante";

export interface PocketOpts {
  raio: number;
  sobreposicao: number;
  profundidade: number;
  passada: number;
  direcao: Direcao;
}

/**
 * Pocket por anéis concêntricos (offset). Usina cada componente por completo antes de ir
 * para o próximo; em cada nível começa pelo anel mais interno e vai abrindo para fora,
 * assim só o primeiro anel corta com a fresa inteira engajada.
 * Retorna false se a fresa não cabe em nenhum ponto da região.
 */
export function pocket(b: PathBuilder, region: Region, o: PocketOpts): boolean {
  const t0 = offset(region, -o.raio);
  if (area(t0) <= 0) return false;

  for (const comp of components(t0)) {
    // Cada anel sai direto da região original (erosão por r + k·passo). Encadear offsets
    // sobre o anel anterior multiplica os vértices dos arcos e deixa o cálculo lentíssimo.
    const source = intersection(region, offset(comp, o.raio + 0.01));
    const rings: { k: number; path: Pt[] }[] = [];
    for (let k = 0; k < 5000; k++) {
      const cur = k === 0 ? comp : simplify(intersection(offset(source, -(o.raio + k * o.sobreposicao)), comp));
      if (area(cur) <= 0) break;
      for (const p of simplify(cur)) rings.push({ k, path: orient(p, o.direcao, "pocket") });
    }
    rings.sort((a, c) => c.k - a.k);

    for (const z of depthLevels(o.profundidade, o.passada)) {
      const pending = [...rings];
      let first = true;
      while (pending.length) {
        // Entre os anéis do nível mais interno ainda pendente, pega o mais próximo.
        const kMax = pending[0].k;
        let bi = 0;
        let bd = Infinity;
        pending.forEach((r, i) => {
          if (r.k !== kMax) return;
          const d = Math.min(...r.path.map((p) => dist(p, b)));
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        const ring = pending.splice(bi, 1)[0];
        const path = rotateToNearest(ring.path, b);
        const start = path[0];
        const atLevel = !first && Math.abs(b.z - z) < 1e-6;
        if (atLevel && dist(b, start) <= o.sobreposicao * 1.6 && segmentInside(comp, b, start)) {
          b.feed(start, z);
        } else {
          b.travel(start);
          b.plunge(z);
        }
        first = false;
        for (let i = 1; i < path.length; i++) b.feed(path[i], z);
        b.feed(start, z);
      }
      b.retract();
    }
  }
  return true;
}

export interface ProfileOpts {
  raio: number;
  profundidade: number;
  passada: number;
  direcao: Direcao;
  /** Lado da fresa em relação à região: por fora (peça fica) ou por dentro (região sai). */
  lado: "fora" | "dentro";
  abas?: { quantidade: number; largura: number; altura: number; espessura: number };
}

export interface ProfileResult {
  contornosSemAba: number;
}

/**
 * Contorno em passadas. Por fora: primeiro os miolos (furos da peça), depois o contorno
 * externo com abas de fixação nas passadas finais, para a peça não se soltar.
 */
export function profile(b: PathBuilder, region: Region, o: ProfileOpts): ProfileResult {
  const paths = simplify(offset(region, o.lado === "fora" ? o.raio : -o.raio));
  let contornosSemAba = 0;
  const levels = depthLevels(o.profundidade, o.passada);

  const ordered = nearestOrder(paths, b, (p) => (pathArea(p) < 0 ? 0 : 1));
  for (const raw of ordered) {
    const isOuter = pathArea(raw) > 0;
    const path = rotateToNearest(orient(raw, o.direcao, o.lado === "fora" ? "perfil" : "pocket"), b);
    const wantTabs = o.lado === "fora" && isOuter && o.abas && o.abas.quantidade > 0;
    const tabs = wantTabs ? tabWindows(path, o.abas!.quantidade, o.abas!.largura + 2 * o.raio) : [];
    if (wantTabs && tabs.length === 0) contornosSemAba++;
    const tabTop = o.abas ? -(o.abas.espessura - o.abas.altura) : 0;

    b.travel(path[0]);
    for (const z of levels) {
      b.plunge(z);
      if (tabs.length && z < tabTop) followWithTabs(b, path, z, tabTop, tabs);
      else {
        for (let i = 1; i < path.length; i++) b.feed(path[i], z);
        b.feed(path[0], z);
      }
    }
    b.retract();
  }
  return { contornosSemAba };
}

/** Furo do tamanho exato da fresa: descidas em bicadas, subindo para limpar o cavaco. */
export function peck(b: PathBuilder, center: Pt, depth: number, passada: number) {
  b.travel(center);
  for (const z of depthLevels(depth, passada)) {
    b.plunge(z);
    b.retract();
  }
}

/** Gravação com fresa em V seguindo o contorno, numa única profundidade. */
export function trace(b: PathBuilder, region: Region, depth: number, direcao: Direcao) {
  for (const raw of nearestOrder(simplify(region), b, () => 0)) {
    const path = rotateToNearest(orient(raw, direcao, "pocket"), b);
    b.travel(path[0]);
    b.plunge(-depth);
    for (let i = 1; i < path.length; i++) b.feed(path[i], -depth);
    b.feed(path[0], -depth);
    b.retract();
  }
}

export interface VCarveOpts {
  /** Metade do ângulo da ponta, em radianos. */
  meioAngulo: number;
  /** Profundidade máxima (limite do usuário, da fresa e do material). */
  profundidadeMax: number;
  passada: number;
  direcao: Direcao;
  /** Distância entre anéis, em mm. */
  passo?: number;
}

export interface VCarveResult {
  /** Área (mm²) que ficou com fundo plano por causa do limite de profundidade. */
  areaPlana: number;
}

/**
 * V-carve de verdade: a profundidade acompanha a largura do traço. Anéis de offset para dentro
 * a uma distância d da borda são cortados na profundidade d / tan(meio ângulo); assim o cone da
 * fresa encosta exatamente na borda e o fundo sobe até o eixo central de cada traço, como numa
 * gravação feita à mão. Onde a profundidade passaria do limite, o fundo fica plano e é limpo com
 * a própria fresa em V, em passes próximos.
 */
export function vcarve(b: PathBuilder, region: Region, o: VCarveOpts): VCarveResult {
  const tan = Math.tan(o.meioAngulo);
  const passo = o.passo ?? 0.2;
  const dCap = o.profundidadeMax * tan;
  // No fundo plano, passes próximos o bastante para a crista entre eles ficar com ~0,08 mm.
  const passoPlano = Math.max(0.1, 2 * 0.08 * tan);
  let areaPlana = 0;

  type Ring = { d: number; z: number; path: Pt[] };
  for (const comp of components(simplify(region))) {
    const rings: Ring[] = [];
    let d = passo / 2;
    for (let k = 0; k < 20000; k++) {
      const cur = simplify(offset(comp, -d));
      if (area(cur) <= 0) break;
      const z = -Math.min(d / tan, o.profundidadeMax);
      for (const p of cur) rings.push({ d, z, path: orient(p, o.direcao, "pocket") });
      d += d < dCap ? passo : passoPlano;
    }
    areaPlana += Math.max(0, area(offset(comp, -dCap)));
    if (!rings.length) continue;

    // Por nível de profundidade: cada anel desce no máximo até o nível atual, e só entra nos
    // níveis em que ainda tem material a tirar.
    const levels = depthLevels(o.profundidadeMax, o.passada);
    let prev = 0;
    for (const level of levels) {
      const todo = rings.filter((r) => r.z < prev - 1e-6);
      for (const r of nearestRings(todo, b)) {
        const z = Math.max(r.z, level);
        const path = rotateToNearest(r.path, b);
        b.travel(path[0]);
        b.plunge(z);
        for (let i = 1; i < path.length; i++) b.feed(path[i], z);
        b.feed(path[0], z);
      }
      b.retract();
      prev = level;
    }
  }
  return { areaPlana };
}

function nearestRings<R extends { path: Pt[] }>(rings: R[], from: Pt): R[] {
  const pending = [...rings];
  const out: R[] = [];
  let cur = { x: from.x, y: from.y };
  while (pending.length) {
    let bi = 0;
    let bd = Infinity;
    pending.forEach((r, i) => {
      for (const q of r.path) {
        const dd = (q.x - cur.x) ** 2 + (q.y - cur.y) ** 2;
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      }
    });
    const next = pending.splice(bi, 1)[0];
    out.push(next);
    cur = rotateToNearest(next.path, cur)[0];
  }
  return out;
}

export interface HatchOpts {
  /** Raio efetivo da fresa na profundidade (0 para a ponta de uma fresa em V). */
  raio: number;
  profundidade: number;
  passada: number;
  espacamento: number;
  /** Ângulo das linhas, em graus. */
  angulo: number;
  direcao: Direcao;
}

/**
 * Gravação com hachura: contorno do elemento mais linhas paralelas dentro dele, em vez de
 * esvaziar a área toda. Fica com cara de textura e corta muito mais rápido.
 */
export function hatch(b: PathBuilder, region: Region, o: HatchOpts): boolean {
  const inner = o.raio > 0 ? simplify(offset(region, -o.raio)) : simplify(region);
  if (area(inner) <= 0) return false;
  const a = (o.angulo * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Gira a região para as linhas ficarem horizontais, corta e desgira.
  const rot = inner.map((p) => p.map((q) => ({ x: q.x * c + q.y * s, y: -q.x * s + q.y * c })));
  const unrot = (q: Pt): Pt => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c });
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of rot) for (const q of p) {
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  const segs: [Pt, Pt][] = [];
  let flip = false;
  for (let y = y0 + o.espacamento / 2; y < y1; y += o.espacamento) {
    const xs: number[] = [];
    for (const p of rot) {
      for (let i = 0; i < p.length; i++) {
        const P = p[i];
        const Q = p[(i + 1) % p.length];
        if (P.y > y !== Q.y > y) xs.push(P.x + ((y - P.y) * (Q.x - P.x)) / (Q.y - P.y));
      }
    }
    xs.sort((m, n) => m - n);
    const row: [Pt, Pt][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < 0.05) continue;
      row.push([unrot({ x: xs[i], y }), unrot({ x: xs[i + 1], y })]);
    }
    if (flip) row.reverse().forEach((sg) => sg.reverse());
    segs.push(...row);
    flip = !flip;
  }
  for (const z of depthLevels(o.profundidade, o.passada)) {
    for (const raw of nearestOrder(inner, b, () => 0)) {
      const path = rotateToNearest(orient(raw, o.direcao, "pocket"), b);
      b.travel(path[0]);
      b.plunge(z);
      for (let i = 1; i < path.length; i++) b.feed(path[i], z);
      b.feed(path[0], z);
    }
    for (const [p, q] of segs) {
      // Segmento seguinte começando perto do fim do anterior, dentro da região: segue sem subir.
      if (Math.abs(b.z - z) < 1e-6 && dist(b, p) <= o.espacamento * 1.6 && segmentInside(inner, b, p)) b.feed(p, z);
      else {
        b.travel(p);
        b.plunge(z);
      }
      b.feed(q, z);
    }
    b.retract();
  }
  return true;
}

// ---------------------------------------------------------------------------

/**
 * Orientação natural do Clipper: externos anti-horários, furos horários.
 * Com o spindle girando no sentido horário, essa orientação dá corte convencional
 * num pocket e corte concordante num perfil por fora.
 */
function orient(p: Pt[], direcao: Direcao, uso: "pocket" | "perfil"): Pt[] {
  const naturalIsConventional = uso === "pocket";
  const keep = (direcao === "convencional") === naturalIsConventional;
  return keep ? p : [...p].reverse();
}

/** Separa uma região em componentes conexos (cada externo com seus furos). */
function components(r: Region): Region[] {
  const outers = r.filter((p) => pathArea(p) > 0);
  const holes = r.filter((p) => pathArea(p) < 0);
  const comps: Region[] = outers.map((o) => [o]);
  for (const h of holes) {
    // Um furo pertence ao menor externo que o contém.
    let best = -1;
    let bestArea = Infinity;
    outers.forEach((o, i) => {
      if (pointInRegion([o], h[0]) && pathArea(o) < bestArea) {
        best = i;
        bestArea = pathArea(o);
      }
    });
    if (best >= 0) comps[best].push(h);
  }
  return comps;
}

function nearestOrder(paths: Pt[][], from: Pt, group: (p: Pt[]) => number): Pt[][] {
  const pending = [...paths];
  const out: Pt[][] = [];
  let cur = { x: from.x, y: from.y };
  while (pending.length) {
    const g = Math.min(...pending.map(group));
    let bi = -1;
    let bd = Infinity;
    pending.forEach((p, i) => {
      if (group(p) !== g) return;
      const d = Math.min(...p.map((q) => dist(q, cur)));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const next = pending.splice(bi, 1)[0];
    out.push(next);
    cur = rotateToNearest(next, cur)[0];
  }
  return out;
}

type Window = [number, number];

/** Janelas (em comprimento de arco) onde a fresa sobe para deixar as abas. */
function tabWindows(path: Pt[], n: number, len: number): Window[] {
  const per = perimeter(path);
  const count = Math.min(n, Math.floor(per / (len * 2.5)));
  if (count < 1) return [];
  return Array.from({ length: count }, (_, i) => {
    const c = ((i + 0.5) * per) / count;
    return [c - len / 2, c + len / 2] as Window;
  });
}

function followWithTabs(b: PathBuilder, path: Pt[], z: number, tabTop: number, tabs: Window[]) {
  const closed = [...path, path[0]];
  let s = 0;
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1];
    const c = closed[i];
    const seg = dist(a, c);
    // Pontos de corte do segmento nas bordas das janelas.
    const cuts = [0, seg];
    for (const [w0, w1] of tabs) {
      for (const w of [w0, w1]) if (w > s && w < s + seg) cuts.push(w - s);
    }
    cuts.sort((p, q) => p - q);
    for (let k = 1; k < cuts.length; k++) {
      const t0 = cuts[k - 1];
      const t1 = cuts[k];
      if (t1 - t0 < 1e-9) continue;
      const mid = s + (t0 + t1) / 2;
      const inTab = tabs.some(([w0, w1]) => mid > w0 && mid < w1);
      const targetZ = inTab ? tabTop : z;
      if (Math.abs(b.z - targetZ) > 1e-9) b.feedZ(targetZ);
      const t = t1 / seg;
      b.feed({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t }, targetZ);
    }
    s += seg;
  }
  if (Math.abs(b.z - z) > 1e-9) b.feedZ(z);
}
