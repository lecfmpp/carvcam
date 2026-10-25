import { TopBar, type JobStep } from "../../components/TopBar";

export default function Job({ step }: { step: JobStep }) {
  return (
    <div className="app">
      <TopBar variant="job" step={step} />
      <div style={{ padding: 40 }} className="muted">{step} — em construção</div>
    </div>
  );
}
