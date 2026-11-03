import { ELEMENTS, HoleSchema, IconSchema, PlateSpecSchema, ShapeSchema, SlotSchema, SvgSchema, TextSchema } from "@carvcam/cam-engine";
import { MATERIALS } from "../lib/catalog";

/**
 * Tool input schemas generated from the engine's zod schemas (the source of truth), so the
 * assistant can never fall behind the engine again. `schema.test.ts` fails when the engine gains a
 * field that no tool exposes (or that has no description here).
 *
 * The Messages API accepts a subset of JSON Schema for tools: no numeric/string/array-size
 * constraints, `additionalProperties: false` on objects, `anyOf` instead of `oneOf`. `toApiSchema`
 * rewrites the engine's schema into that subset and moves the dropped constraints into the field
 * description, so the model still sees them; the app validates every input with zod anyway.
 */

export type JsonSchema = { [k: string]: unknown };

const engineJson = (s: { toJSONSchema(p?: object): unknown }) => s.toJSONSchema({ io: "input", unrepresentable: "any" }) as JsonSchema;

const BIG = 1e12;
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** Rewrites a JSON Schema into the subset the API accepts for tool inputs (see the file comment). */
export function toApiSchema(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  const notes: string[] = [];
  for (const [k, v] of Object.entries(node)) {
    switch (k) {
      case "$schema":
        break;
      case "minimum":
        if (Math.abs(v as number) < BIG) notes.push(`min ${fmt(v as number)}`);
        break;
      case "exclusiveMinimum":
        notes.push(`more than ${fmt(v as number)}`);
        break;
      case "maximum":
        if (Math.abs(v as number) < BIG) notes.push(`max ${fmt(v as number)}`);
        break;
      case "exclusiveMaximum":
        notes.push(`less than ${fmt(v as number)}`);
        break;
      case "multipleOf":
        notes.push(`multiple of ${v}`);
        break;
      case "minLength":
        if ((v as number) > 0) notes.push(`at least ${v} characters`);
        break;
      case "maxLength":
        notes.push(`at most ${v} characters`);
        break;
      case "maxItems":
        notes.push(`at most ${v} items`);
        break;
      case "minItems":
        if ((v as number) <= 1) out.minItems = v;
        else notes.push(`at least ${v} items`);
        break;
      case "oneOf":
      case "anyOf":
        out.anyOf = (v as JsonSchema[]).map(toApiSchema);
        break;
      case "allOf":
        out.allOf = (v as JsonSchema[]).map(toApiSchema);
        break;
      case "properties":
        out.properties = Object.fromEntries(Object.entries(v as Record<string, JsonSchema>).map(([p, s]) => [p, toApiSchema(s)]));
        break;
      case "items":
        out.items = toApiSchema(v as JsonSchema);
        break;
      default:
        out[k] = v;
    }
  }
  if (out.type === "object" || out.properties) out.additionalProperties = false;
  if (notes.length) out.description = [out.description, `(${notes.join(", ")})`].filter(Boolean).join(" ");
  return out;
}

// ------------------------------------------------------------------ field descriptions

/**
 * What each engine field means, in the model's terms. Keys are paths without the element kind
 * ("size", "copies.rows", "board.width"). A test fails when the engine has a field without an entry.
 */
export const FIELD_DOCS: Record<string, string> = {
  // Board (sign or lettering blank)
  "board.type": "plate = a sign with a background; lettering = the letters themselves are cut out as one piece",
  "board.width": "Width of the sign in mm (without the margin around it)",
  "board.height": "Height of the sign in mm",
  "board.thickness": "Board thickness in mm",
  "board.material": "Board material",
  "board.edge": "Outer edge of the sign",
  "board.edge.type": "straight, rounded (corners rounded with radius) or chamfered (corners cut at 45° by radius)",
  "board.edge.radius": "Corner radius or chamfer size in mm",
  "board.frame": "Width in mm of the raised frame left around the sign's edge when there are raised elements (0 = no frame)",
  "board.outerCutout": "Cut the sign out of a bigger board along its outline, with holding tabs (false = the board is already the final size)",
  "board.margin": "Extra board around the sign when it is cut out, mm",
  // Shared element fields
  content: "The text, up to 60 characters",
  font: "Font id (see list_fonts)",
  size: "Text: cap height of the letters in mm. Icon: size in mm",
  mode: "Style: relief = raised (the background around it is lowered), engrave = carved into the face, cutout = cut all the way through (stencil, inside of the outline), part = cut out along the outside with holding tabs as a loose piece",
  depth: "How deep it is carved, mm (relief: how far the background is lowered)",
  x: "Center X in mm from the sign's left edge (shapes: anchor; line: start; curve: origin)",
  y: "Center Y in mm from the sign's bottom edge",
  arc: "Text only: arched text, baseline radius in mm; positive curves up (smile), negative curves down; null = straight",
  offset: "Thickens (+) or thins (−) the outline in mm",
  outline: "Adds a ring around the element (null = none)",
  "outline.distance": "Gap between the element and the ring, mm",
  "outline.width": "Width of the ring, mm",
  operation: "normal = carved; subtract = cuts its area out of the elements under it (not carved itself); mask = keeps only the part of the other elements inside it",
  targets: "subtract/mask only: which elements are affected (omitted = all normal elements)",
  "targets.type": "Kind of the target element",
  "targets.index": "Index of the target within its kind (text:2 → type text, index 2)",
  hatch: "Engrave only: engrave the outline plus parallel lines inside instead of clearing the area (null = clear it)",
  "hatch.spacing": "Distance between hatch lines, mm",
  "hatch.angle": "Angle of the hatch lines, degrees",
  mirror: "Mirror left to right around its own anchor",
  copies: "Grid of linked copies (null = none). Prefer the set_copies tool",
  "copies.rows": "Rows of copies (rows go down)",
  "copies.cols": "Columns of copies",
  "copies.dx": "Horizontal distance between copy centers, mm",
  "copies.dy": "Vertical distance between copy centers, mm",
  "copies.alternate": "Turn every other copy 180° (nests triangles, hearts…)",
  "copies.pivot": "Center the alternate copies turn around (omitted = the element's own center)",
  "copies.pivot.x": "Pivot X, mm",
  "copies.pivot.y": "Pivot Y, mm",
  "copies.texts": "Text elements only: the text of each copy from the second one on",
  type: "Shape type (rectangle, circle, polygon, star, curve, line); to change it, remove the shape and add a new one",
  id: "Icon id (heart, star, house, leaf) or library element id",
  width: "Width in mm (rectangle, drawing, slot)",
  height: "Height in mm (rectangle)",
  radius: "Rectangle corner radius, mm",
  diameter: "Diameter in mm (circle, hole; polygon/star: circle through the points)",
  sides: "Number of sides of a polygon",
  rotation: "Rotation in degrees (polygon, star)",
  points: "Number of points of a star",
  inner: "Star inner radius as a fraction of the outer one",
  nodes: "Curve nodes relative to (x, y); handles relative to the node; no handles = corner",
  "nodes.x": "Node X relative to the curve origin, mm",
  "nodes.y": "Node Y relative to the curve origin, mm",
  "nodes.ix": "Incoming handle X, relative to the node",
  "nodes.iy": "Incoming handle Y, relative to the node",
  "nodes.ox": "Outgoing handle X, relative to the node",
  "nodes.oy": "Outgoing handle Y, relative to the node",
  closed: "Curve: closed = an area; open = a stroke of `thickness`",
  thickness: "Stroke width of a line or open curve, mm",
  x2: "Line end X, mm",
  y2: "Line end Y, mm",
  name: "Drawing name shown in the element list",
  length: "Slot length, mm",
  angle: "Slot angle in degrees (0 = horizontal)",
};

/** Engine fields no tool sets directly, with the reason (checked by schema.test.ts). */
export const EXCLUDED: Record<string, string> = {
  "board.inlay": "Pro: inlays are made with the inlay wizard (open_pro_feature), never written directly",
  "board.texts": "element list: use add_element / update_element / remove_element",
  "board.icons": "element list: use add_element / update_element / remove_element",
  "board.shapes": "element list: use add_element / update_element / remove_element",
  "board.svgs": "element list: use add_element (library) / update_element / remove_element",
  "board.holes": "element list: use add_element (hole) / update_element / remove_element",
  "board.slots": "element list: use add_element (slot) / update_element / remove_element",
  "svg.content": "the drawing file itself: comes from the library or the user's own import, never written by the model",
};

const docKey = (path: string) => path.replace(/\[\]/g, "");

/** Fills in descriptions from FIELD_DOCS (walks nested objects, arrays and unions). */
function withDocs(node: JsonSchema, path: string, self = true): JsonSchema {
  const out: JsonSchema = { ...node };
  const doc = FIELD_DOCS[docKey(path)];
  if (self && doc && path) out.description = out.description ? `${doc} ${out.description}` : doc;
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties as Record<string, JsonSchema>).map(([k, v]) => [k, withDocs(v, path ? `${path}.${k}` : k)]));
  if (out.items) out.items = withDocs(out.items as JsonSchema, `${path}[]`);
  // Union variants share the field's description (set once, on the union itself).
  for (const key of ["anyOf", "oneOf"]) if (out[key]) out[key] = (out[key] as JsonSchema[]).map((v) => withDocs(v, path, false));
  return out;
}

// ------------------------------------------------------------------ element schemas

/** The engine's element schemas, by assistant kind. */
export const ENGINE_ELEMENTS = {
  text: engineJson(TextSchema),
  icon: engineJson(IconSchema),
  svg: engineJson(SvgSchema),
  hole: engineJson(HoleSchema),
  slot: engineJson(SlotSchema),
} as const;

/** Shape variants (rectangle, circle, polygon, star, curve, line…), straight from the engine's union. */
export const SHAPE_VARIANTS: JsonSchema[] = ((engineJson(ShapeSchema).oneOf ?? engineJson(ShapeSchema).anyOf) as JsonSchema[]) ?? [];
export const shapeTypeOf = (v: JsonSchema) => ((v.properties as Record<string, JsonSchema>).type.const ?? ((v.properties as Record<string, JsonSchema>).type.enum as string[])[0]) as string;
export const SHAPE_TYPES = SHAPE_VARIANTS.map(shapeTypeOf);

/** Field names of an element kind (for update validation and coverage). */
export function elementFields(kind: "text" | "icon" | "svg" | "hole" | "slot" | `shape.${string}`): string[] {
  if (kind.startsWith("shape.")) {
    const v = SHAPE_VARIANTS.find((x) => shapeTypeOf(x) === kind.slice(6));
    return v ? Object.keys(v.properties as object) : [];
  }
  return Object.keys(ENGINE_ELEMENTS[kind as keyof typeof ENGINE_ELEMENTS].properties as object);
}

const withKind = (kind: string, s: JsonSchema, drop: string[] = []): JsonSchema => {
  const props = Object.fromEntries(Object.entries(s.properties as Record<string, JsonSchema>).filter(([k]) => !drop.includes(k)));
  return {
    ...s,
    properties: { kind: { type: "string", const: kind }, ...props },
    required: ["kind", ...((s.required as string[]) ?? []).filter((k) => !drop.includes(k))],
  };
};

/** Library elements (frames, nature, icons…) added as drawings: the svg fields minus the file itself. */
function libraryVariant(): JsonSchema {
  const base = withKind("library", ENGINE_ELEMENTS.svg, ["content", "name", ...ADVANCED]);
  const props = base.properties as Record<string, JsonSchema>;
  return {
    ...base,
    description: "An element from the design library (see list_library), carved as a drawing. Frames are drawn at the given width and fill the sign's height.",
    properties: { kind: props.kind, id: { type: "string", enum: ELEMENTS.map((e) => e.id) }, ...Object.fromEntries(Object.entries(props).filter(([k]) => k !== "kind")) },
    required: ["kind", "id", "x", "y"],
  };
}

/**
 * Modifier fields every drawn element shares. add_element leaves them out (they would repeat in
 * every variant and multiply the schema's size); update_element and set_copies set them, and
 * add_element still accepts them.
 */
export const ADVANCED = ["offset", "outline", "operation", "targets", "hatch", "mirror", "copies"];

/** Input schema of add_element (generated). */
export function addElementSchema(): JsonSchema {
  const variants = [
    withKind("text", ENGINE_ELEMENTS.text, ADVANCED),
    withKind("icon", ENGINE_ELEMENTS.icon, ADVANCED),
    ...SHAPE_VARIANTS.map((v) => withKind("shape", v, ADVANCED)),
    libraryVariant(),
    withKind("hole", ENGINE_ELEMENTS.hole),
    withKind("slot", ENGINE_ELEMENTS.slot),
  ].map((v) => withDocs(v, ""));
  return toApiSchema({
    type: "object",
    properties: { element: { anyOf: variants } },
    required: ["element"],
  });
}

/** Every element field with the kinds that have it ("text", "shape.star", "svg"…). */
export function elementPropTable(): Record<string, { variants: JsonSchema[]; kinds: string[] }> {
  const sources: [string, JsonSchema][] = [
    ["text", ENGINE_ELEMENTS.text],
    ["icon", ENGINE_ELEMENTS.icon],
    ...SHAPE_VARIANTS.map((v) => [`shape.${shapeTypeOf(v)}`, v] as [string, JsonSchema]),
    ["svg", ENGINE_ELEMENTS.svg],
    ["hole", ENGINE_ELEMENTS.hole],
    ["slot", ENGINE_ELEMENTS.slot],
  ];
  const props: Record<string, { variants: JsonSchema[]; kinds: string[] }> = {};
  for (const [kind, s] of sources) {
    for (const [k, v] of Object.entries(s.properties as Record<string, JsonSchema>)) {
      if (k === "type" && kind.startsWith("shape.")) continue; // shape discriminator: remove and add instead
      if (k === "content" && kind === "svg") continue; // EXCLUDED: svg.content
      const p = (props[k] ??= { variants: [], kinds: [] });
      p.kinds.push(kind);
      const clean = { ...v };
      delete clean.default;
      if (!p.variants.some((x) => JSON.stringify(x) === JSON.stringify(clean))) p.variants.push(clean);
    }
  }
  return props;
}

/** Merged element fields; same-named fields with different schemas become an anyOf; null clears. */
function allElementProps(): Record<string, JsonSchema> {
  return Object.fromEntries(
    Object.entries(elementPropTable()).map(([k, p]) => {
      const one = withDocs(p.variants.length === 1 ? p.variants[0] : { anyOf: p.variants }, k, false);
      const kinds = [...new Set(p.kinds.map((x) => (x === "svg" ? "drawing" : x.replace("shape.", ""))))];
      return [k, { anyOf: [one, { type: "null" }], description: `${FIELD_DOCS[k] ?? k}. Applies to: ${kinds.join(", ")}.` }];
    }),
  );
}

/** Input schema of update_element (generated): the element id and the fields to change. */
export function updateElementSchema(): JsonSchema {
  return toApiSchema({
    type: "object",
    properties: {
      id: { type: "string", description: 'Element id from get_design, e.g. "text:0", "shape:2", "icon:1", "drawing:0", "hole:3", "slot:0"' },
      changes: {
        type: "object",
        description: "Only the fields to change. null clears an optional field (text x/y null = automatic stacking; copies/outline/hatch/arc null = none).",
        properties: allElementProps(),
      },
    },
    required: ["id", "changes"],
  });
}

/** Element arrays of the spec (handled by the element tools, not set_board). */
export const ELEMENT_ARRAYS = ["texts", "icons", "shapes", "svgs", "holes", "slots"] as const;

/** Input schema of set_board (generated from the spec's top-level fields, minus elements and Pro-only fields). */
export function setBoardSchema(): JsonSchema {
  const spec = engineJson(PlateSpecSchema);
  const props: Record<string, JsonSchema> = {};
  for (const [k, v] of Object.entries(spec.properties as Record<string, JsonSchema>)) {
    if (EXCLUDED[`board.${k}`]) continue;
    const clean = { ...v };
    delete clean.default;
    props[k] = withDocs(clean, `board.${k}`);
  }
  // The app's materials (MDF, Pine, Oak…) map to the engine's material ids and set the board color.
  props.material = { type: "string", enum: MATERIALS.map((m) => m.id), description: `${FIELD_DOCS["board.material"]}: ${MATERIALS.map((m) => `${m.id} (${m.thick.join("/")} mm)`).join(", ")}` };
  return toApiSchema({ type: "object", properties: props, required: [] });
}

// ------------------------------------------------------------------ coverage (used by tests)

/** Every field path of a schema ("copies.rows", "nodes[].x"), walking objects, arrays and unions. */
export function fieldPaths(node: JsonSchema, prefix = ""): string[] {
  const out: string[] = [];
  const props = node.properties as Record<string, JsonSchema> | undefined;
  if (props)
    for (const [k, v] of Object.entries(props)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(p, ...fieldPaths(v, p));
    }
  if (node.items) out.push(...fieldPaths(node.items as JsonSchema, `${prefix}[]`));
  for (const key of ["anyOf", "oneOf", "allOf"]) for (const v of (node[key] as JsonSchema[] | undefined) ?? []) out.push(...fieldPaths(v, prefix));
  return [...new Set(out)];
}

/** Field paths of the engine spec: "board.width", "text.font", "shape.star.points", "svg.copies.rows"… */
export function enginePaths(): string[] {
  const spec = engineJson(PlateSpecSchema);
  const out = Object.keys(spec.properties as object).map((k) => `board.${k}`);
  out.push(...fieldPaths((spec.properties as Record<string, JsonSchema>).edge, "board.edge"));
  out.push(...fieldPaths(ENGINE_ELEMENTS.text, "text"), ...fieldPaths(ENGINE_ELEMENTS.icon, "icon"), ...fieldPaths(ENGINE_ELEMENTS.svg, "svg"));
  out.push(...fieldPaths(ENGINE_ELEMENTS.hole, "hole"), ...fieldPaths(ENGINE_ELEMENTS.slot, "slot"));
  for (const v of SHAPE_VARIANTS) out.push(...fieldPaths(v, `shape.${shapeTypeOf(v)}`));
  return out;
}

/** Field paths the tools expose, in the same naming as enginePaths. */
export function exposedPaths(): string[] {
  const out = fieldPaths(setBoardSchema()).map((p) => `board.${p}`);
  const add = (addElementSchema().properties as Record<string, JsonSchema>).element.anyOf as JsonSchema[];
  for (const v of add) {
    const props = v.properties as Record<string, JsonSchema>;
    const kind = props.kind.const as string;
    const prefix = kind === "shape" ? `shape.${props.type.const}` : kind === "library" ? "svg" : kind;
    out.push(...fieldPaths(v, prefix).filter((p) => !p.endsWith(".kind")));
  }
  // update_element exposes the merged fields for every kind that has them.
  const changes = ((updateElementSchema().properties as Record<string, JsonSchema>).changes.properties ?? {}) as Record<string, JsonSchema>;
  const table = elementPropTable();
  for (const [k, v] of Object.entries(changes)) for (const kind of table[k]?.kinds ?? []) out.push(`${kind}.${k}`, ...fieldPaths(v, `${kind}.${k}`));
  return [...new Set(out)];
}
