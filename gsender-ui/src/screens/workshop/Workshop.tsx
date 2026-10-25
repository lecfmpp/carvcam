import { TopBar } from "../../components/TopBar";

export default function Workshop(_props: Record<string, unknown>) {
  return (
    <div className="app">
      <TopBar variant="app" />
      <div style={{ padding: 40 }} className="muted">Workshop — em construção</div>
    </div>
  );
}
