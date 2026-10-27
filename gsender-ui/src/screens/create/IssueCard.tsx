import { ArrowUpRight, Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BitSilhouette } from "../../components/BitSilhouette";
import { Issue } from "../../components/ui";
import { bitById, machineName, materialById } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { toast, useUi } from "../../state/ui";
import { useActiveMachine, useWorkshop } from "../../state/workshop";
import type { ElementId } from "./elements";
import type { BitRec, IssueAction, IssueCtx, UiIssue } from "./issues";
import "./issue-card.css";

/** Everything buildIssues needs about the user, their machine and the design. */
export function useIssueCtx(): IssueCtx {
  const design = useDesign((s) => s.design);
  const canUndo = useDesign((s) => s.past.length > 0);
  const lastGood = useDesign((s) => s.lastGood);
  const ownedBits = useWorkshop((s) => s.bits);
  const { machine, headId } = useActiveMachine();
  return {
    spec: design.spec,
    bit: bitById(design.bit),
    bit2: design.useBit2 && design.bit2 ? bitById(design.bit2) : undefined,
    useBit2: design.useBit2,
    ownedBits,
    machineName: machineName(machine),
    machineArea: machine.area,
    headId,
    keepOut: design.keepOut,
    thicknesses: materialById(design.material).thick,
    canUndo,
    hasLastGood: !!lastGood && lastGood !== design,
    tabs: design.tabs,
  };
}

/** Runs a card's action wherever the card is (Create or Prepare). */
export function useIssueRunner(onSelect?: (id: ElementId) => void) {
  const nav = useNavigate();
  const here = useLocation().pathname;
  return (a: IssueAction) => {
    const d = useDesign.getState();
    switch (a.kind) {
      case "spec":
        d.patchSpec(() => a.spec);
        toast(`${a.label === "Apply suggestion" ? "Suggestion applied" : a.label}. Re-checking…`);
        return;
      case "bit":
        d.patch(a.patch);
        toast(`Switched to the ${bitById(a.bit)?.name ?? "new"} bit${a.patch.useBit2 && a.slot === "main" ? `; the ${bitById(String(a.patch.bit2))?.inch ?? ""} bit still cuts out` : ""}.`);
        return;
      case "own": {
        const ws = useWorkshop.getState();
        if (!ws.bits.includes(a.bit)) ws.toggleBit(a.bit);
        d.patch(a.patch);
        toast(`Added the ${bitById(a.bit)?.name ?? "bit"} to My bits and switched to it.`);
        return;
      }
      case "store":
        window.open(a.url, "_blank", "noopener");
        return;
      case "design":
        d.patch(a.patch);
        toast(`${a.label}. Re-checking…`);
        return;
      case "undo":
        toast(d.undo() ? "Last change undone." : "Nothing to undo.");
        return;
      case "restore":
        toast(d.restoreLastGood() ? "Back to the last design that worked." : "This is already the last working design.");
        return;
      case "go":
        if (a.to === "reload") return window.location.reload();
        if (a.to === "select" && a.target) {
          if (onSelect && here === "/create") return onSelect(a.target);
          useUi.getState().request({ pendingSel: a.target });
          return nav("/create");
        }
        if (a.to === "bits") {
          useUi.getState().request({ bitMenuReq: useUi.getState().bitMenuReq + 1 });
          if (here !== "/create") nav("/create");
          return;
        }
        nav(a.to === "clamps" ? "/position" : a.to === "workshop" ? "/workshop/settings" : a.to === "tabs" ? "/prepare" : "/create");
        if (a.to === "clamps") toast('Switch to "Board & clamps" to move or resize the clamp.');
        return;
    }
  };
}

const EYEBROW: Record<UiIssue["level"], string> = { error: "Error · blocks Continue", warning: "Warning · you can continue", info: "Note" };

/** One problem with its ways out: "Apply suggestion", other fixes, and the bit to use or buy. */
export function IssueCard({ issue: i, focused, onFocus, onRun, onSelect }: { issue: UiIssue; focused?: boolean; onFocus?(): void; onRun(a: IssueAction): void; onSelect?(): void }) {
  const showFocus = !!onFocus && i.level !== "error" && !!i.target;
  const actions = (
    <>
      {i.apply ? (
        <button className="btn btn--light btn--sm" onClick={() => onRun(i.apply!)}>
          {i.apply.label}
        </button>
      ) : null}
      {i.alts.map((a) =>
        a.kind === "store" ? (
          <a key={a.label} className="btn btn--outline btn--sm" href={a.url} target="_blank" rel="noopener noreferrer">
            {a.label} <ArrowUpRight size={13} strokeWidth={2} />
          </a>
        ) : (
          <button key={a.label} className="btn btn--outline btn--sm" onClick={() => onRun(a)}>
            {a.label}
          </button>
        ),
      )}
      {i.rec ? <BitRecBlock rec={i.rec} onRun={onRun} /> : null}
      {showFocus ? (
        <button className="btn btn--outline btn--sm" aria-pressed={focused} onClick={onFocus}>
          {focused ? <EyeOff size={14} /> : <Eye size={14} />}
          {focused ? "Hide on preview" : "Show on preview"}
        </button>
      ) : null}
    </>
  );
  const hasActions = !!i.apply || i.alts.length > 0 || !!i.rec || showFocus;
  return (
    <div className={`create-issue create-issue--${i.level}`} data-code={i.code} data-issue-key={i.key} tabIndex={-1} onClick={(e) => (e.target as HTMLElement).closest("button,a") || onSelect?.()}>
      <Issue kind={i.level} eyebrow={EYEBROW[i.level]} title={i.title} body={i.detail || undefined} fix={i.suggestion} actions={hasActions ? actions : undefined} />
    </div>
  );
}

/** Small card for the Sienci bit that solves the problem: photo, name, why, "I have it" and "Buy at Sienci". */
function BitRecBlock({ rec, onRun }: { rec: BitRec; onRun(a: IssueAction): void }) {
  const [noPhoto, setNoPhoto] = useState(!rec.image);
  const own = rec.actions.find((a) => a.kind === "own");
  const buy = rec.actions.find((a): a is Extract<IssueAction, { kind: "store" }> => a.kind === "store");
  return (
    <div className="issue-rec" aria-label={`Recommended bit: ${rec.name}`}>
      <div className="issue-rec__photo">
        {noPhoto ? <BitSilhouette profile={rec.profile} d={rec.d} size={56} /> : <img src={rec.image} alt="" width={64} height={48} loading="lazy" onError={() => setNoPhoto(true)} />}
      </div>
      <div className="issue-rec__main">
        <span className="issue-rec__eyebrow">Fix it with this bit</span>
        <span className="issue-rec__name">Sienci {rec.name}</span>
        <span className="issue-rec__why">{rec.why}</span>
        <span className="issue-rec__actions">
          {own ? (
            <button className="btn btn--light btn--sm" onClick={() => onRun(own)}>
              <Check size={14} strokeWidth={2.4} /> {own.label}
            </button>
          ) : null}
          {buy ? (
            <a className="btn btn--outline btn--sm" href={buy.url} target="_blank" rel="noopener noreferrer">
              {buy.label} <ArrowUpRight size={13} strokeWidth={2} />
            </a>
          ) : null}
        </span>
      </div>
    </div>
  );
}
