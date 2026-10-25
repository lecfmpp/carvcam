import { TopBar } from "../../components/TopBar";

export default function Onboarding(_props: Record<string, unknown>) {
  return (
    <div className="app">
      <TopBar variant="app" />
      <div style={{ padding: 40 }} className="muted">Onboarding — em construção</div>
    </div>
  );
}
