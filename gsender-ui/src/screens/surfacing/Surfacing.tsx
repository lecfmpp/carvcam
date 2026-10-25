import { TopBar } from "../../components/TopBar";

export default function Surfacing(_props: Record<string, unknown>) {
  return (
    <div className="app">
      <TopBar variant="app" />
      <div style={{ padding: 40 }} className="muted">Surfacing — em construção</div>
    </div>
  );
}
