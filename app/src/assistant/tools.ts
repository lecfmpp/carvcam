import type Anthropic from "@anthropic-ai/sdk";
import { FONT_IDS } from "@carvcam/cam-engine";
import { addElementSchema, setBoardSchema, updateElementSchema, type JsonSchema } from "./schema";

/**
 * The assistant's tools. Small, fixed-shape tools are `strict` (the API guarantees schema-valid
 * input); the element and board tools are generated from the engine schema and too large for strict
 * mode's limits (24 optional parameters, 16 union parameters, 20 strict tools per request), so they
 * are validated in app code (ops.ts) with the engine's zod schemas. Either way, every input goes
 * through the same validation before it touches the design, and invalid input comes back to the
 * model as an error tool_result.
 *
 * Strict tools use sentinel values instead of optional fields ("keep", 0, "" = leave as it is) to
 * stay far from those limits; tools.test.ts counts them.
 *
 * There is deliberately no tool that talks to the machine.
 */

export type ToolDef = Anthropic.Beta.BetaTool;

const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra });
const num = (description: string): JsonSchema => ({ type: "number", description });
const ids = (description: string): JsonSchema => ({ type: "array", items: { type: "string" }, description });

const strict = (name: string, description: string, properties: Record<string, JsonSchema>): ToolDef => ({
  name,
  description,
  strict: true,
  input_schema: obj(properties) as ToolDef["input_schema"],
});
const loose = (name: string, description: string, schema: JsonSchema): ToolDef => ({ name, description, input_schema: schema as ToolDef["input_schema"] });

export const STYLE_NAMES = ["raised", "engraved", "cut_through", "part"] as const;

/** Tools that only read (never change the design). */
export const READ_TOOLS = ["get_design", "list_fonts", "list_library", "list_bits"] as const;

let cache: ToolDef[] | null = null;

/** The tool list, always in the same order (a stable prefix for prompt caching). */
export function assistantTools(): ToolDef[] {
  if (cache) return cache;
  cache = [
    // ---- read
    strict("get_design", "Returns the current design: board, bits, tabs, every element with its id, fields and box (center and size in mm), and the engine's current problems. Call it again after removing elements: ids of later elements of the same kind shift down.", {}),
    strict("list_fonts", "Lists the fonts with what each looks like and how well it carves.", {}),
    strict("list_library", "Lists the built-in icons (heart, star, house, leaf) and the design library elements (paw, anchor, frames, dividers…) with their ids and suggested widths.", {}),
    strict("list_bits", "Lists the bits in the user's My bits (the only ones you can select) and other bits CarvCAM supports, with diameter, V angle and what each is for.", {}),
    // ---- edit
    loose(
      "add_element",
      "Adds one element: text, icon, shape (rectangle, circle, polygon, star, curve, line), a library element, a hole or a slot. Coordinates are mm from the sign's bottom-left corner. Omitted optional fields take the engine defaults. To add several, call it several times. Set modifiers (outline ring, hatch, offset, subtract/mask, mirror) afterwards with update_element and copies with set_copies. Pick a style (mode) that fits the design: usually the same as the elements already there.",
      addElementSchema(),
    ),
    loose(
      "update_element",
      "Changes fields of one existing element by id (only the fields given). Use it for size, font, position, depth, style, arc, outline, hatch, offset, operation, mirror and shape dimensions.",
      updateElementSchema(),
    ),
    strict("remove_element", "Removes elements by id. Ids of later elements of the same kind shift down afterwards.", {
      ids: ids('Element ids, e.g. ["icon:0", "hole:2"]'),
    }),
    strict("move_element", "Moves an element so the center of its box lands at (x, y), in mm from the sign's bottom-left corner.", {
      id: str("Element id"),
      x: num("New center X, mm"),
      y: num("New center Y, mm"),
    }),
    strict(
      "align_elements",
      'Aligns elements. to "board": moves them together (keeping their layout) to a side or the center of the sign, `inset` mm from the edge. to "each_other": lines their edges or centers up within the group. Use [] for every element. "center everything" = all ids, center/center, to board.',
      {
        ids: ids("Element ids; [] = every element"),
        horizontal: str("Horizontal placement", { enum: ["left", "center", "right", "keep"] }),
        vertical: str("Vertical placement", { enum: ["top", "center", "bottom", "keep"] }),
        to: str("What to align to", { enum: ["board", "each_other"] }),
        inset: num("Board alignment only: distance from the sign's edge in mm for left/right/top/bottom (0 = touching the edge; 8–15 mm usually looks right)"),
      },
    ),
    loose(
      "set_board",
      "Changes the board: size, thickness, material, edge (straight/rounded/chamfered with radius), frame width, sign vs cut-out lettering, outer cutout and margin. Only the fields given change.",
      setBoardSchema(),
    ),
    strict(
      "set_style",
      "Sets how elements are carved: raised (background lowered around it), engraved (carved into the face), cut_through (cut all the way through, inside the outline, like a stencil) or part (cut out along the outside as a loose piece held by tabs). Optionally sets the depth.",
      {
        ids: ids("Element ids; [] = every text, icon, shape and drawing"),
        style: str("New style, or keep", { enum: [...STYLE_NAMES, "keep"] }),
        depth: num("Depth in mm (0 = keep the current depth)"),
      },
    ),
    strict("set_text", "Changes a text element's words, font or size.", {
      id: str('Text id, e.g. "text:0"'),
      content: str('New text (up to 60 characters), or "" to keep it'),
      font: str("New font id, or keep", { enum: ["keep", ...FONT_IDS] }),
      size: num("New cap height in mm (0 = keep)"),
    }),
    strict(
      "set_copies",
      "Makes a grid of linked copies of elements (name tags, coasters…). With several ids they are copied together as a group. For texts, `texts` gives the words of copy 2, 3… in reading order (the original keeps its own words). rows = cols = 1 removes the copies.",
      {
        ids: ids("Element ids to copy together"),
        rows: { type: "integer", description: "Rows (1–40; rows × cols at most 400)" },
        cols: { type: "integer", description: "Columns (1–40)" },
        dx: num("Distance between copy centers left to right, mm (0 = the group's width + 6 mm)"),
        dy: num("Distance between copy centers top to bottom, mm (0 = the group's height + 6 mm)"),
        alternate: { type: "boolean", description: "Turn every other copy 180° (nesting)" },
        texts: ids("Words of copies 2, 3… for text elements ([] = all copies say the same)"),
      },
    ),
    strict("select_bit", "Selects a bit from My bits. slot main = the bit that carves; slot second = the bit for cutouts and holes (bit_id \"\" turns the second bit off).", {
      slot: str("Which bit", { enum: ["main", "second"] }),
      bit_id: str("Bit id from list_bits (must be in My bits), or \"\" to turn the second bit off"),
    }),
    strict("set_speed", "Sets the cutting speed preset: fast, balanced or detailed (gentlest, cleanest edges).", {
      preset: str("Preset", { enum: ["fast", "balanced", "detailed"] }),
    }),
    strict("set_tabs", "Sets the holding tabs on the outer cut and on parts (spread evenly).", {
      count: { type: "integer", description: "Number of tabs (0–12; 0 = no tabs, the piece comes loose)" },
      height: num("How tall the tabs stay, mm (0 = keep)"),
      width: num("Length of each tab along the edge, mm (0 = keep)"),
    }),
    strict(
      "ask_clarifying_question",
      "Asks the user one short question when the request is ambiguous (which element, what size, which of several readings). Nothing changes until they answer. Give 2–4 short answer options.",
      {
        question: str("The question, one sentence"),
        options: ids("2–4 short answers the user can click"),
      },
    ),
    strict(
      "open_pro_feature",
      "Opens a Pro feature's own screen: inlay = the V-carve inlay wizard for the given elements; batch = batch carving from a list (in Prepare); cost = job cost and quote (in Prepare). The feature's Pro check decides what the user sees; you never set those features up yourself.",
      {
        feature: str("Feature", { enum: ["inlay", "batch", "cost"] }),
        ids: ids("Inlay: the element ids to inlay ([] = the whole design). Others: []"),
      },
    ),
  ];
  return cache;
}

export const toolNames = () => assistantTools().map((t) => t.name);
