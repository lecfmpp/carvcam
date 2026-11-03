/**
 * Features that are built but not shown to users yet. Turn one on locally to test it:
 *   - at build time: VITE_ENABLE_ASSISTANT=1 npm run dev
 *   - in a running app: localStorage.setItem("carvcam-enable-assistant", "1"), then reload
 */
const ASSISTANT_KEY = "carvcam-enable-assistant";

/** Design assistant (chat in Create). Hidden until it knows every current feature and passes its evals. */
export function assistantEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_ASSISTANT === "1") return true;
  try {
    return localStorage.getItem(ASSISTANT_KEY) === "1";
  } catch {
    return false;
  }
}
