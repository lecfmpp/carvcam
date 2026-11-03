import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { JobCtx } from "./Job";
import { bitNameFor } from "./jobUtil";
import { JobModal } from "./Modal";
import { buildSetupSheet, setupSheetHtml } from "./setupSheet";
import { machineName } from "../../lib/catalog";

/**
 * Printable setup sheet. Shown in the app in a frame (Electron blocks new windows) and printed from
 * that frame, so only the sheet goes to the printer, in the browser and in the desktop app alike.
 */
export function SetupSheetDialog({ ctx, onClose }: { ctx: JobCtx; onClose(): void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => {
    if (!ctx.result) return "";
    const sheet = buildSetupSheet({
      design: ctx.design,
      result: ctx.result,
      groups: ctx.groups,
      machine: machineName(ctx.machine),
      head: { name: ctx.head.name, auto: ctx.head.auto },
      bitName: (t) => bitNameFor(ctx.design, t),
    });
    return setupSheetHtml(sheet);
  }, [ctx.design, ctx.result, ctx.groups, ctx.machine, ctx.head]);

  return (
    <JobModal
      label="Setup sheet"
      eyebrow="Print and take it to the machine"
      title="Setup sheet"
      onClose={onClose}
      wide
      foot={
        <>
          <span className="job-fine">Fits one A4 or Letter page.</span>
          <button className="btn btn--outline btn--sm" onClick={onClose}>
            Close
          </button>
          <button className="btn btn--primary btn--sm" disabled={!ready} onClick={() => frame.current?.contentWindow?.print()} style={{ gap: 6 }}>
            <Printer size={15} strokeWidth={1.75} />
            Print
          </button>
        </>
      }
    >
      {html ? <iframe ref={frame} className="sheet-frame" title="Setup sheet preview" srcDoc={html} onLoad={() => setReady(true)} /> : <div className="muted">Preparing the job…</div>}
    </JobModal>
  );
}
