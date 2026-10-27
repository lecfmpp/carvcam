import { AlertCircle, ArrowUpRight, Check, Loader2, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FEATURES, initials, planLabel, signIn, signOut, SITE, openSite, refreshAccount, useAccount, type AccountState, type ProFeature } from "./pro";
import "./account.css";

/** Small "Pro" pill. */
export function ProBadge(): JSX.Element {
  return (
    <span className="pro-badge" aria-label="Pro">
      Pro
    </span>
  );
}

/** Modal shell: dimmed backdrop, card, Escape and backdrop click close it. */
function Modal(props: { label: string; eyebrow: ReactNode; title: ReactNode; onClose(): void; children: ReactNode }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="acct-modal" role="dialog" aria-modal="true" aria-label={props.label} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acct-card">
        <header className="acct-head">
          <div>
            <div className="acct-eyebrow">{props.eyebrow}</div>
            <h2 className="acct-title">{props.title}</h2>
          </div>
          <button className="acct-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </header>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

function daysAgo(t?: number) {
  if (!t) return "";
  const d = Math.floor((Date.now() - t) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

function longDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Extra line under the plan name. */
function planSub(a: AccountState) {
  if (a.forced) return "Unlocked by VITE_FORCE_PRO / carvcam-force-pro for testing.";
  if (!a.pro) return "Design, prepare and carve are free forever.";
  if (a.plan === "school") return "Pro features through your school.";
  if (a.lifetime) return "Yours for good, including future Pro features.";
  if (a.trialEnd) return `Your free trial ends on ${longDate(a.trialEnd)}.`;
  if (a.periodEnd) return a.cancels ? `Ends on ${longDate(a.periodEnd)}. You can turn renewal back on anytime.` : `Renews on ${longDate(a.periodEnd)}.`;
  return "";
}

function OfflineNotes({ a }: { a: AccountState }) {
  if (a.stale)
    return (
      <div className="acct-note" role="status">
        <WifiOff size={16} strokeWidth={1.5} />
        <span>Connect to the internet to confirm your Pro plan. Free features keep working in the meantime.</span>
      </div>
    );
  if (a.offline && a.status === "signed-in")
    return (
      <div className="acct-note" role="status">
        <WifiOff size={16} strokeWidth={1.5} />
        <span>Offline. Last checked {daysAgo(a.checkedAt)}; your plan keeps working for 30 days without internet.</span>
      </div>
    );
  return null;
}

function AccountPanel({ a, onClose }: { a: AccountState; onClose(): void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="acct-who">
        <span className="acct-avatar acct-avatar--lg" aria-hidden>
          {initials(a)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="acct-who__name">{a.name ?? a.email}</div>
          {a.name && a.email ? <div className="acct-who__mail">{a.email}</div> : null}
        </div>
      </div>
      <div className="acct-plan">
        <span className="acct-plan__k">Plan</span>
        <span className="acct-plan__v">
          {planLabel(a)}
          {a.pro ? <ProBadge /> : null}
        </span>
        <span className="acct-plan__sub">{planSub(a)}</span>
      </div>
      <OfflineNotes a={a} />
      <div className="acct-actions">
        <button className="btn btn--outline" onClick={() => openSite(a.pro ? SITE.account : SITE.pricing)}>
          {a.pro ? "Manage plan" : "See Pro plans"} <ArrowUpRight size={16} strokeWidth={1.5} />
        </button>
        <button
          className="btn btn--quiet"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            setBusy(false);
            onClose();
          }}
        >
          Sign out
        </button>
      </div>
      {a.pro ? null : (
        <div className="acct-foot">
          Just upgraded?
          <button className="acct-link" onClick={() => void refreshAccount()}>
            Check again
          </button>
        </div>
      )}
    </>
  );
}

function SignInForm({ onDone }: { onDone?(): void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => emailRef.current?.focus(), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      setPassword("");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in didn't work. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      <label className="acct-field">
        Email
        <input ref={emailRef} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="acct-field">
        <span className="acct-row">
          Password
          <button type="button" className="acct-link" onClick={() => openSite(SITE.reset)}>
            Forgot password?
          </button>
        </span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error ? (
        <div className="acct-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      ) : null}
      <button className="btn btn--primary btn--lg" type="submit" disabled={busy}>
        {busy ? <Loader2 size={18} className="acct-spin" /> : null}
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="acct-foot">
        New to CarvCAM?
        <button type="button" className="acct-link" onClick={() => openSite(SITE.signup)}>
          Create a free account <ArrowUpRight size={14} strokeWidth={1.5} />
        </button>
      </div>
    </form>
  );
}

/** Sign-in dialog; once signed in, shows the account (name, plan, Manage plan, Sign out). */
export function SignInDialog(props: { open: boolean; onClose(): void }): JSX.Element | null {
  const a = useAccount();
  if (!props.open) return null;
  const signedIn = a.status === "signed-in";
  return (
    <Modal label={signedIn ? "Your CarvCAM account" : "Sign in to CarvCAM"} eyebrow="CarvCAM account" title={signedIn ? "Your account" : "Sign in"} onClose={props.onClose}>
      {signedIn ? (
        <AccountPanel a={a} onClose={props.onClose} />
      ) : (
        <>
          <p className="acct-lead">Sign in to unlock your Pro plan on this computer. Everything else in CarvCAM works without an account.</p>
          <SignInForm />
        </>
      )}
    </Modal>
  );
}

/** Explains a Pro feature: start the free trial on the website, or sign in. */
export function UpgradeDialog(props: { feature: ProFeature; open: boolean; onClose(): void }): JSX.Element | null {
  const a = useAccount();
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    if (!props.open) setSigningIn(false);
  }, [props.open]);
  if (!props.open) return null;
  if (signingIn) return <SignInDialog open onClose={props.onClose} />;
  const f = FEATURES[props.feature];
  if (a.pro)
    return (
      <Modal label={f.title} eyebrow={<><ProBadge /> Unlocked</>} title={f.title} onClose={props.onClose}>
        <p className="acct-lead">Your plan includes {f.title.toLowerCase()}. Enjoy!</p>
        <button className="btn btn--primary btn--lg" onClick={props.onClose}>
          Continue
        </button>
      </Modal>
    );
  return (
    <Modal label={`${f.title} is a Pro feature`} eyebrow={<><ProBadge /> CarvCAM Pro</>} title={f.title} onClose={props.onClose}>
      <p className="acct-lead">{f.body}</p>
      <ul className="acct-perks">
        <li>
          <Check size={16} strokeWidth={2} />
          14 days free, then monthly or yearly. Cancel anytime.
        </li>
        <li>
          <Check size={16} strokeWidth={2} />
          Batch, nesting, inlays, job costs, cloud projects and the built-in assistant.
        </li>
        <li>
          <Check size={16} strokeWidth={2} />
          Design, prepare and carve stay free forever.
        </li>
      </ul>
      <OfflineNotes a={a} />
      <div className="acct-stack">
        <button className="btn btn--primary btn--lg" onClick={() => openSite(SITE.pricing)}>
          Start 14-day free trial <ArrowUpRight size={18} strokeWidth={1.5} />
        </button>
        {a.status === "signed-in" ? (
          <button className="btn btn--outline btn--lg" onClick={() => void refreshAccount()}>
            I just upgraded · Check again
          </button>
        ) : (
          <button className="btn btn--outline btn--lg" onClick={() => setSigningIn(true)}>
            I already have Pro · Sign in
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Gate for a Pro feature: `allowed`, `ask()` (opens the upgrade dialog when not allowed) and the dialog to render. */
export function useProGate(feature: ProFeature): { allowed: boolean; ask(): void; dialog: JSX.Element | null } {
  const allowed = useAccount().pro;
  const [open, setOpen] = useState(false);
  const ask = useCallback(() => {
    if (!allowed) setOpen(true);
  }, [allowed]);
  const close = useCallback(() => setOpen(false), []);
  return { allowed, ask, dialog: open ? <UpgradeDialog feature={feature} open onClose={close} /> : null };
}
