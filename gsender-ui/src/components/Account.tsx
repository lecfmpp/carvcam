import { ExternalLink, LogIn, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SITE_URL } from "../account/config";
import { isExpired, licenseIsPro, planLabel } from "../account/license";
import { useAccount } from "../state/account";
import "./account.css";

const fmtDate = (iso: string | number) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** Loads the saved sign-in once, and shows the sign-in dialog when it is open. Mounted in App. */
export function AccountHost() {
  const init = useAccount((s) => s.init);
  const open = useAccount((s) => s.dialogOpen);
  useEffect(() => void init(), [init]);
  return open ? <SignInDialog /> : null;
}

export const openSignIn = () => useAccount.getState().openSignIn();

function SignInDialog() {
  const { signIn, startSignIn, cancelSignIn, closeSignIn } = useAccount();
  const left = useCountdown(signIn.phase === "waiting" ? signIn.expiresAt : 0);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeSignIn();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [closeSignIn]);
  return (
    <div className="acct-modal" role="dialog" aria-modal="true" aria-label="Sign in to CarvCAM" onPointerDown={(e) => e.target === e.currentTarget && closeSignIn()}>
      <div className="acct-modal__card">
        <button className="acct-modal__close" aria-label="Close" onClick={closeSignIn}>
          <X size={18} />
        </button>
        <h2>Sign in to CarvCAM</h2>
        {signIn.phase === "waiting" ? (
          <>
            <p className="acct-muted">We opened carvcam.com in your browser. Log in or create a free account there, then confirm this code:</p>
            <div className="acct-code" aria-label={`Code ${signIn.userCode.split("").join(" ")}`}>
              {signIn.userCode}
            </div>
            <p className="acct-muted acct-small">
              Browser didn't open, or you're on the machine's touch screen? On any phone or computer, go to{" "}
              <b>{signIn.url.replace(/^https?:\/\//, "")}</b> and type the code.
            </p>
            <div className="acct-wait">
              <span className="acct-spinner" aria-hidden /> Waiting for you to confirm… <span className="acct-muted">({left})</span>
            </div>
            <div className="acct-actions">
              <button className="acct-btn acct-btn--ghost acct-btn--lg" onClick={cancelSignIn}>
                Cancel
              </button>
              <button className="acct-btn acct-btn--primary acct-btn--lg" onClick={() => window.open(signIn.urlComplete, "_blank", "noopener")}>
                Open browser <ExternalLink size={16} />
              </button>
            </div>
          </>
        ) : signIn.phase === "error" ? (
          <>
            <p className="acct-error" role="alert">
              {signIn.message}
            </p>
            <div className="acct-actions">
              <button className="acct-btn acct-btn--ghost acct-btn--lg" onClick={cancelSignIn}>
                Close
              </button>
              <button className="acct-btn acct-btn--primary acct-btn--lg" onClick={() => void startSignIn()}>
                Try again
              </button>
            </div>
          </>
        ) : (
          <div className="acct-wait">
            <span className="acct-spinner" aria-hidden /> Getting a sign-in code…
          </div>
        )}
      </div>
    </div>
  );
}

function useCountdown(until: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  const s = Math.max(0, Math.round((until - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Top bar: "Sign in" when signed out, the plan when signed in. */
export function AccountChip() {
  const { ready, token, license } = useAccount();
  if (!ready) return null;
  if (!token)
    return (
      <button className="acct-chip" onClick={openSignIn} title="Sign in with your CarvCAM account">
        <LogIn size={16} strokeWidth={1.5} /> Sign in
      </button>
    );
  const pro = licenseIsPro(license);
  return (
    <a className={`acct-chip${pro ? " acct-chip--pro" : ""}`} href="#/workshop/settings" title={license?.email ?? "Your account"}>
      {pro ? <Sparkles size={16} strokeWidth={1.5} /> : null}
      {planLabel(license)}
    </a>
  );
}

/** Settings › Account. */
export function AccountSettings() {
  const { ready, token, license, offline, refresh, signOut } = useAccount();
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  const pro = licenseIsPro(license);
  const expired = !!license?.pro && isExpired(license);

  let detail = "Design, check and carve with no limit on cuts. Pro adds batch production, the cost calculator, cloud projects and more.";
  if (pro && license!.lifetime) detail = "Pro forever. Thanks for backing CarvCAM.";
  else if (pro && license!.status === "trialing" && license!.trial_end) detail = `Free trial until ${fmtDate(license!.trial_end)}.`;
  else if (pro && license!.status === "past_due") detail = "Your last payment didn't go through. Update your card on carvcam.com to keep Pro.";
  else if (pro && license!.period_end) detail = `${license!.cancel_at_period_end ? "Ends" : "Renews"} on ${fmtDate(license!.period_end)}.`;
  else if (pro) detail = "Pro is on for this computer.";
  if (expired) detail = "CarvCAM hasn't reached carvcam.com in 30 days. Connect to the internet to turn Pro back on.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="field-label" style={{ margin: 0 }}>
        Account
      </span>
      <div className="acct-panel">
        {token ? (
          <>
            <div className="acct-panel__row">
              <div>
                <div className="acct-plan">{expired ? "Pro (reconnect)" : planLabel(license)}</div>
                <div className="acct-muted acct-small">{license?.email ?? "Signed in"}</div>
              </div>
              <div className="acct-panel__btns">
                {!pro ? (
                  <a className="acct-btn acct-btn--primary" href={`${SITE_URL}/pricing/`} target="_blank" rel="noopener">
                    Upgrade
                  </a>
                ) : null}
                <a className="acct-btn acct-btn--ghost" href={`${SITE_URL}/account/`} target="_blank" rel="noopener">
                  Manage <ExternalLink size={14} />
                </a>
              </div>
            </div>
            <p className="acct-muted acct-small" style={{ margin: 0 }}>
              {detail}
            </p>
            <div className="acct-panel__foot">
              <span className="acct-muted acct-small">
                {offline ? "Offline. " : ""}
                {license ? `Last checked ${fmtDate(license.iat * 1000)}.` : ""}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <button
                  className="acct-btn acct-btn--ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await refresh();
                    setBusy(false);
                  }}
                >
                  <RefreshCw size={14} /> Check now
                </button>
                <button className="acct-btn acct-btn--ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
              </span>
            </div>
          </>
        ) : (
          <div className="acct-panel__row">
            <div>
              <div className="acct-plan">Free</div>
              <div className="acct-muted acct-small">No account needed for Free. Sign in to turn on Pro on this computer.</div>
            </div>
            <button className="acct-btn acct-btn--primary" onClick={openSignIn}>
              <LogIn size={16} /> Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
