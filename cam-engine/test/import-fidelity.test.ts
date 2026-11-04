// Import fidelity: what real files from Illustrator, Inkscape, Figma, Fusion, LightBurn and AutoCAD
// contain, and the area and size CarvCAM must get from them. A drawing that comes in with the wrong
// area or size would carve something other than what the person sent.
import { describe, expect, it } from "vitest";
import { area } from "../src/geometry/clip.js";
import { parseDxf } from "../src/dxf.js";
import { parseSvg } from "../src/svg.js";
import type { Region } from "../src/geometry/clip.js";

const total = (r: Region) => Math.abs(r.reduce((s, p) => s + area([p]), 0));
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="100mm" viewBox="0 0 100 100">${body}</svg>`;

describe("SVG import fidelity", () => {
  const cases: [string, string, number, [number, number]][] = [
    ["<use> of a shape in <defs> (Figma, icon sets)", `<defs><rect id="r" width="40" height="40"/></defs><use href="#r" x="10" y="10"/>`, 1600, [40, 40]],
    ["xlink:href clones (Inkscape)", `<defs><path id="p" d="M0 0h40v40h-40z"/></defs><use xlink:href="#p"/><use xlink:href="#p" x="50"/>`, 3200, [90, 40]],
    ["<use> of a <symbol> with a viewBox (Illustrator symbols)", `<defs><symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></defs><use href="#s" x="0" y="0" width="40" height="40"/>`, 1600, [40, 40]],
    ["<use> of a group, transformed", `<defs><g id="g"><rect width="10" height="10"/><rect x="20" width="10" height="10"/></g></defs><use href="#g" transform="scale(2)"/>`, 800, [60, 20]],
    ["clip-path on a shape (Illustrator clipping masks)", `<defs><clipPath id="c"><rect width="30" height="100"/></clipPath></defs><rect x="10" y="10" width="40" height="40" clip-path="url(#c)"/>`, 800, [20, 40]],
    ["clip-path on a group (Figma frames)", `<defs><clipPath id="c"><rect width="50" height="50"/></clipPath></defs><g clip-path="url(#c)"><rect x="40" y="0" width="40" height="40"/><rect x="0" y="40" width="20" height="20"/></g>`, 600, [50, 50]], // 10×40 + 20×10 kept
    ["clip-path in a style attribute", `<defs><clipPath id="c"><circle cx="50" cy="50" r="10"/></clipPath></defs><rect width="100" height="100" style="clip-path:url(#c)"/>`, 314, [20, 20]],
    ["nested <svg> viewport", `<svg x="10" y="10" width="40" height="40" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>`, 1600, [40, 40]],
    ["white shape knocks out (Illustrator)", `<rect x="10" y="10" width="40" height="40"/><rect x="20" y="20" width="20" height="20" fill="#fff"/>`, 1200, [40, 40]],
    ["stroke-only outline", `<rect x="10" y="10" width="40" height="40" fill="none" stroke="#000" stroke-width="2"/>`, 320, [42, 42]],
  ];
  for (const [name, body, a, [w, h]] of cases)
    it(name, () => {
      const d = parseSvg(svg(body));
      expect(total(d.region)).toBeGreaterThan(a * 0.98);
      expect(total(d.region)).toBeLessThan(a * 1.02);
      expect(d.width).toBeCloseTo(w, 0);
      expect(d.height).toBeCloseTo(h, 0);
    });

  it("live text is left out with a clear note; text-only files explain how to fix them", () => {
    const d = parseSvg(svg(`<rect width="10" height="10"/><text x="20" y="20">Hi</text>`));
    expect(d.notes?.[0]).toMatch(/Create Outlines/);
    expect(() => parseSvg(svg(`<text x="20" y="20">Hi</text>`))).toThrow(/Create Outlines/);
  });

  it("<use> loops don't hang", () => {
    expect(() => parseSvg(svg(`<g id="a"><use href="#a"/></g><rect width="10" height="10"/>`))).not.toThrow();
  });
});

const dxf = (ents: string, blocks = "") =>
  `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n${blocks ? `0\nSECTION\n2\nBLOCKS\n${blocks}0\nENDSEC\n` : ""}0\nSECTION\n2\nENTITIES\n${ents}0\nENDSEC\n0\nEOF\n`;
const sq = (x: number, y: number, s = 40) =>
  `0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1\n10\n${x}\n20\n${y}\n10\n${x + s}\n20\n${y}\n10\n${x + s}\n20\n${y + s}\n10\n${x}\n20\n${y + s}\n`;
const block = (name: string, body: string, bx = 0, by = 0) => `0\nBLOCK\n8\n0\n2\n${name}\n70\n0\n10\n${bx}\n20\n${by}\n${body}0\nENDBLK\n`;
const insert = (name: string, x: number, y: number, extra = "") => `0\nINSERT\n8\n0\n2\n${name}\n10\n${x}\n20\n${y}\n${extra}`;

describe("DXF import fidelity", () => {
  it("blocks placed twice (Fusion, LightBurn, AutoCAD)", () => {
    const d = parseDxf(dxf(insert("SQ", 0, 0) + insert("SQ", 60, 0), block("SQ", sq(0, 0))));
    expect(total(d.region)).toBeCloseTo(3200, -1);
    expect(d.width).toBeCloseTo(100, 0);
  });
  it("block scale, rotation and base point", () => {
    // 10 mm square, base at its center, scaled ×2 and turned 45°: a 20 mm square standing on a corner.
    const d = parseDxf(dxf(insert("S", 50, 50, "41\n2\n42\n2\n50\n45\n"), block("S", sq(-5, -5, 10), 0, 0)));
    expect(total(d.region)).toBeCloseTo(400, -1);
    expect(d.width).toBeCloseTo(20 * Math.SQRT2, 0);
  });
  it("block arrays (rows × columns)", () => {
    const d = parseDxf(dxf(insert("S", 0, 0, "70\n3\n71\n2\n44\n20\n45\n20\n"), block("S", sq(0, 0, 10))));
    expect(total(d.region)).toBeCloseTo(600, -1);
    expect(d.width).toBeCloseTo(50, 0);
    expect(d.height).toBeCloseTo(30, 0);
  });
  it("nested blocks", () => {
    const d = parseDxf(dxf(insert("OUTER", 0, 0), block("INNER", sq(0, 0, 10)) + block("OUTER", insert("INNER", 0, 0) + insert("INNER", 20, 0))));
    expect(total(d.region)).toBeCloseTo(200, -1);
  });
  it("solid HATCH with a polyline boundary", () => {
    const h = `0\nHATCH\n8\n0\n2\nSOLID\n70\n1\n91\n1\n92\n2\n72\n0\n73\n1\n93\n4\n10\n0\n20\n0\n10\n40\n20\n0\n10\n40\n20\n40\n10\n0\n20\n40\n97\n0\n`;
    expect(total(parseDxf(dxf(h)).region)).toBeCloseTo(1600, -1);
  });
  it("HATCH with line and arc edges (a rounded end)", () => {
    // 40 × 20 rectangle with a half circle of radius 10 on the right: 800 + 157.
    const h = `0\nHATCH\n8\n0\n2\nSOLID\n70\n1\n91\n1\n92\n1\n93\n4\n72\n1\n10\n0\n20\n0\n11\n40\n21\n0\n72\n2\n10\n40\n20\n10\n40\n10\n50\n-90\n51\n90\n73\n1\n72\n1\n10\n40\n20\n20\n11\n0\n21\n20\n72\n1\n10\n0\n20\n20\n11\n0\n21\n0\n97\n0\n`;
    const a = total(parseDxf(dxf(h)).region);
    expect(a).toBeGreaterThan(940);
    expect(a).toBeLessThan(975);
  });
  it("text is left out with a note", () => {
    const d = parseDxf(dxf(sq(0, 0) + `0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n5\n1\nHi\n`));
    expect(d.notes?.join(" ")).toMatch(/Text in the DXF was left out/);
  });
});
