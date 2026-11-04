import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { MATERIALS } from "../lib/catalog";
import { defaultTabs, useDesign, type Design } from "../state/design";
import { useProjects } from "../state/projects";
import { toast } from "../state/ui";

/** Shape of a project shared by link (the CarvCAM MCP server, netlify/functions/mcp.mts). */
interface Shared {
  v: 1;
  /** Project id from the connector: the same id updates the project already in My projects. */
  pid?: string;
  name: string;
  material: string;
  spec: Design["spec"];
  bit: string;
  bit2?: string;
  useBit2?: boolean;
  preset?: Design["preset"];
  machine?: string;
}

/** base64url(deflate-raw(JSON)) → object. */
async function decode(d: string): Promise<Shared> {
  const b64 = d.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(d.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return JSON.parse(await new Response(stream).text());
}

/**
 * #/import?d=… opens a project designed elsewhere (Claude, through the CarvCAM connector) in Create.
 * It becomes the open design, so autosave puts it in My projects as a draft.
 */
export default function ImportProject() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const d = params.get("d");
  const done = useRef(false);
  useEffect(() => {
    if (!d || done.current) return;
    done.current = true;
    decode(d)
      .then((s) => {
        if (s.v !== 1 || !s.spec || typeof s.spec.width !== "number") throw new Error("bad");
        const mat = MATERIALS.find((m) => m.id === s.material) ?? MATERIALS[0];
        // Same project id as a saved project (or the open one): update it instead of adding a new one.
        const pid = typeof s.pid === "string" ? s.pid : undefined;
        const open = useDesign.getState().design;
        const saved = pid ? useProjects.getState().projects.find((p) => p.design.externalId === pid) : undefined;
        const savedId = saved?.id ?? (pid && open.externalId === pid ? open.savedId : undefined);
        const design: Design = {
          name: s.name || "Shared project",
          material: mat.id,
          spec: { ...s.spec, material: mat.engine },
          bit: s.bit,
          bit2: s.bit2,
          useBit2: !!s.useBit2,
          preset: s.preset,
          tabs: saved?.design.tabs ?? defaultTabs(s.spec.thickness),
          externalId: pid,
          savedId,
        };
        useDesign.getState().setDesign(design);
        toast(savedId ? `Updated “${design.name}” with the latest changes.` : `Opened “${design.name}”. Check the 3D preview, then Prepare.`, 6000);
        nav("/create", { replace: true });
      })
      .catch(() => {
        toast("This project link is damaged or incomplete. Ask for a new one.", 6000);
        nav("/workshop", { replace: true });
      });
  }, [d, nav]);
  if (!d) return <Navigate to="/workshop" replace />;
  return <div className="app" />;
}
