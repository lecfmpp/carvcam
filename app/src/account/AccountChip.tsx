import { UserRound } from "lucide-react";
import { useState } from "react";
import { initials, planLabel, useAccount } from "./pro";
import { ProBadge, SignInDialog } from "./ProGate";
import "./account.css";

/**
 * Compact top-bar account chip: "Sign in", or initials (+ Pro badge). Opens the account dialog.
 * `acct-chip--job` hides it on narrow windows in the job steps, whose top bar is already full.
 */
export function AccountChip({ className }: { className?: string }) {
  const a = useAccount();
  const [open, setOpen] = useState(false);
  const signedIn = a.status === "signed-in";
  const title = signedIn ? `${a.name ?? a.email ?? "Account"} · ${planLabel(a)}${a.offline ? " · offline" : ""}` : a.pro ? "Pro (test mode) · Sign in" : "Sign in to your CarvCAM account";
  return (
    <>
      <button className={`acct-chip ${signedIn ? "acct-chip--in" : ""} ${className ?? ""}`} aria-haspopup="dialog" onClick={() => setOpen(true)} title={title} aria-label={title}>
        {signedIn ? (
          <span className="acct-avatar" aria-hidden>
            {initials(a)}
          </span>
        ) : (
          <UserRound size={16} strokeWidth={1.5} color="var(--text-3)" />
        )}
        {!signedIn ? <span className="acct-chip__label">{a.status === "loading" ? "Account" : "Sign in"}</span> : null}
        {a.pro ? <ProBadge /> : null}
        {a.stale ? <span className="acct-chip__dot" aria-hidden /> : null}
      </button>
      <SignInDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Settings › Account row. */
export function AccountSetting() {
  const a = useAccount();
  const [open, setOpen] = useState(false);
  const signedIn = a.status === "signed-in";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="field-label" style={{ margin: 0 }}>
        CarvCAM account
      </span>
      <div className="ws-panel acct-setting">
        <span className="acct-avatar acct-avatar--lg" aria-hidden>
          {signedIn ? initials(a) : <UserRound size={20} strokeWidth={1.5} />}
        </span>
        <span className="acct-setting__text">
          <span style={{ font: "600 15px var(--font)", color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
            {signedIn ? (a.name ?? a.email) : "Not signed in"}
            {a.pro ? <ProBadge /> : null}
          </span>
          <span className="tiny muted">{signedIn || a.pro ? planLabel(a) : "Sign in to unlock Pro. Everything else is free, no account needed."}</span>
        </span>
        <button className="btn btn--outline btn--sm" onClick={() => setOpen(true)}>
          {signedIn ? "Manage" : "Sign in"}
        </button>
      </div>
      <SignInDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
