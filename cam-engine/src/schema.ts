import { z } from "zod";

/**
 * Spec for a sign or cut-out lettering, in the format the AI assistant fills in.
 * All measurements in millimeters. Work origin: bottom-left corner of the stock,
 * Z0 on the top surface of the material.
 */

export const FONT_IDS = ["archivo-black", "pacifico", "bebas-neue"] as const;
export const ICON_IDS = ["heart", "star", "house", "leaf"] as const;
export const MATERIAL_IDS = ["mdf", "plywood", "softwood", "hardwood", "acrylic"] as const;

export const ModeSchema = z.enum(["relief", "engrave", "cutout"]);

/**
 * Modifiers that apply to any drawn element (text, icon, shape, imported drawing).
 * - offset: thickens (+) or thins (−) the element's outline, in mm (vector offset).
 * - outline: adds a ring around the element, `distance` mm away from it and `width` mm wide.
 * - operation: "subtract" removes this element's area from the others it covers (it is not
 *   cut itself); "mask" keeps only the part of the other elements that lies inside it.
 */
export const ModifiersShape = {
  offset: z.number().min(-20).max(30).default(0),
  outline: z
    .object({
      distance: z.number().min(0).max(50).default(2),
      width: z.number().positive().max(30).default(2),
    })
    .optional(),
  operation: z.enum(["normal", "subtract", "mask"]).default("normal"),
  /**
   * Subtract/mask only: the affected elements. Omitted = all normal elements.
   * Empty list = none.
   */
  targets: z
    .array(z.object({ type: z.enum(["text", "icon", "shape", "svg"]), index: z.number().int().min(0) }))
    .max(80)
    .optional(),
  /** Engrave only: instead of clearing the area, engraves the outline plus parallel lines inside it. */
  hatch: z
    .object({
      spacing: z.number().min(0.3).max(30).default(2),
      angle: z.number().min(-180).max(180).default(45),
    })
    .optional(),
};

export const TextSchema = z.object({
  content: z.string().min(1).max(60),
  font: z.enum(FONT_IDS).default("archivo-black"),
  /** Cap height of the letters, in mm. */
  size: z.number().positive().max(500),
  mode: ModeSchema.default("relief"),
  depth: z.number().positive().max(50).default(3),
  /** Text center. If omitted, the texts are stacked and centered on the sign. */
  x: z.number().optional(),
  y: z.number().optional(),
  /**
   * Arched text: baseline radius in mm. Positive curves up, negative curves down.
   * Omitted or 0 = straight text.
   */
  arc: z.number().min(-5000).max(5000).optional(),
  ...ModifiersShape,
});

export const IconSchema = z.object({
  id: z.enum(ICON_IDS),
  x: z.number(),
  y: z.number(),
  size: z.number().positive().max(500),
  mode: ModeSchema.default("relief"),
  depth: z.number().positive().max(50).default(3),
  ...ModifiersShape,
});

/**
 * Node of a freeform curve (cubic Bézier), relative to the curve origin. The handles (in and
 * out) are relative to the node itself; with no handles, the node is a corner.
 */
export const CurvePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  ix: z.number().optional(),
  iy: z.number().optional(),
  ox: z.number().optional(),
  oy: z.number().optional(),
});
export type CurvePoint = z.infer<typeof CurvePointSchema>;

/**
 * Shapes drawn on the Create screen. Rectangle, circle, polygon and star are centered on
 * (x, y); the line runs from (x, y) to (x2, y2) with the given thickness.
 */
export const ShapeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rectangle"),
    x: z.number(),
    y: z.number(),
    width: z.number().positive().max(3000),
    height: z.number().positive().max(3000),
    radius: z.number().min(0).default(0),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("circle"),
    x: z.number(),
    y: z.number(),
    diameter: z.number().positive().max(3000),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("polygon"),
    x: z.number(),
    y: z.number(),
    /** Diameter of the circle through the vertices. */
    diameter: z.number().positive().max(3000),
    sides: z.number().int().min(3).max(24).default(6),
    rotation: z.number().default(0),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("star"),
    x: z.number(),
    y: z.number(),
    /** Diameter of the circle through the points. */
    diameter: z.number().positive().max(3000),
    points: z.number().int().min(3).max(24).default(5),
    /** Inner radius as a fraction of the outer one. */
    inner: z.number().min(0.15).max(0.95).default(0.45),
    rotation: z.number().default(0),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("curve"),
    /** Curve origin: the points are relative to (x, y); moving the curve only changes this. */
    x: z.number(),
    y: z.number(),
    nodes: z.array(CurvePointSchema).min(2).max(400),
    /** Closed becomes an area; open becomes a stroke with the given thickness. */
    closed: z.boolean().default(true),
    thickness: z.number().positive().max(100).default(3.2),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(2),
    ...ModifiersShape,
  }),
  z.object({
    type: z.literal("line"),
    x: z.number(),
    y: z.number(),
    x2: z.number(),
    y2: z.number(),
    thickness: z.number().positive().max(100).default(3.2),
    mode: ModeSchema.default("engrave"),
    depth: z.number().positive().max(50).default(1),
    ...ModifiersShape,
  }),
]);

/**
 * Drawing imported from an SVG or DXF file (the format is detected from the content).
 * The file text travels with the spec;
 * (x, y) is the center and the width sets the size (the height follows the drawing's aspect ratio).
 */
export const SvgSchema = z.object({
  content: z.string().min(10).max(3_000_000),
  name: z.string().max(120).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(3000),
  mode: ModeSchema.default("engrave"),
  depth: z.number().positive().max(50).default(2),
  ...ModifiersShape,
});

export const HoleSchema = z.object({
  x: z.number(),
  y: z.number(),
  diameter: z.number().positive().max(100),
});

export const SlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  length: z.number().positive().max(200),
  width: z.number().positive().max(50),
  /** Angle in degrees; 0 = horizontal. */
  angle: z.number().default(0),
});

export const EdgeSchema = z.object({
  type: z.enum(["straight", "rounded", "chamfered"]).default("straight"),
  radius: z.number().min(0).default(0),
});

export const PlateSpecSchema = z.object({
  type: z.enum(["plate", "lettering"]).default("plate"),
  width: z.number().positive().max(3000),
  height: z.number().positive().max(3000),
  thickness: z.number().positive().max(100),
  material: z.enum(MATERIAL_IDS).default("mdf"),
  texts: z.array(TextSchema).max(6).default([]),
  edge: EdgeSchema.default({ type: "straight", radius: 0 }),
  /** Width of the raised frame around the relief. 0 = no frame. */
  frame: z.number().min(0).default(6),
  icons: z.array(IconSchema).max(12).default([]),
  shapes: z.array(ShapeSchema).max(40).default([]),
  svgs: z.array(SvgSchema).max(8).default([]),
  holes: z.array(HoleSchema).max(12).default([]),
  slots: z.array(SlotSchema).max(4).default([]),
  /** Profile cut the part's outer outline (with tabs). */
  outerCutout: z.boolean().default(true),
  /** Extra material around the part, when there is an outer cutout. */
  margin: z.number().min(0).default(10),
});

export type PlateSpec = z.infer<typeof PlateSpecSchema>;
export type PlateSpecInput = z.input<typeof PlateSpecSchema>;
export type Text = z.infer<typeof TextSchema>;
export type Icon = z.infer<typeof IconSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type SvgElement = z.infer<typeof SvgSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type FontId = (typeof FONT_IDS)[number];
export type IconId = (typeof ICON_IDS)[number];
export type MaterialId = (typeof MATERIAL_IDS)[number];

export const ToolSchema = z.object({
  id: z.number().int().positive().default(1),
  name: z.string().default("1/8\" straight bit"),
  type: z.enum(["straight", "vbit"]).default("straight"),
  diameter: z.number().positive().max(25).default(3.175),
  /** Tip angle for a V-bit, in degrees. */
  angle: z.number().positive().max(180).optional(),
  flutes: z.number().int().positive().max(6).default(2),
  /** Usable cutting length. */
  cutLength: z.number().positive().default(12),
});
export type Tool = z.infer<typeof ToolSchema>;
export type ToolInput = z.input<typeof ToolSchema>;

/**
 * Machine limits. When integrating with gSender, fill these from the firmware
 * settings ($110–$112 max rates, $130–$132 travel) instead of using the defaults.
 */
export const MachineSchema = z.object({
  name: z.string().default("Generic (conservative)"),
  travelX: z.number().positive().default(300),
  travelY: z.number().positive().default(300),
  travelZ: z.number().positive().default(60),
  maxFeedXY: z.number().positive().default(3000),
  maxFeedZ: z.number().positive().default(800),
  rpmMin: z.number().positive().default(10000),
  rpmMax: z.number().positive().default(30000),
  /** Safe height for moves between operations. */
  safeHeight: z.number().positive().default(10),
  /** Retract height within an operation. */
  retractHeight: z.number().positive().default(3),
});
export type Machine = z.infer<typeof MachineSchema>;
export type MachineInput = z.input<typeof MachineSchema>;
