import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectWizardHost } from "./components/ConnectWizard";
import { Toasts } from "./components/ui";
import { usePanelMode } from "./lib/panel";
import { useDesign } from "./state/design";
import { useWorkshop } from "./state/workshop";

const Workshop = lazy(() => import("./screens/workshop/Workshop"));
const Onboarding = lazy(() => import("./screens/workshop/Onboarding"));
const Surfacing = lazy(() => import("./screens/surfacing/Surfacing"));
const Create = lazy(() => import("./screens/create/Create"));
const Job = lazy(() => import("./screens/job/Job"));

function Home() {
  const onboarded = useWorkshop((s) => s.onboarded);
  const panel = usePanelMode();
  const spec = useDesign((s) => s.design.spec);
  const hasProject = (spec.texts?.length ?? 0) + (spec.shapes?.length ?? 0) + (spec.icons?.length ?? 0) + (spec.svgs?.length ?? 0) > 0;
  // On gControl (attached to the machine), open straight where the work happens: Position.
  if (onboarded && panel && hasProject) return <Navigate to="/position" replace />;
  return <Navigate to={onboarded ? "/workshop" : "/workshop/onboarding"} replace />;
}

export default function App() {
  usePanelMode();
  return (
    <HashRouter>
      <Suspense fallback={<div className="app" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workshop/onboarding" element={<Onboarding />} />
          <Route path="/workshop" element={<Workshop tab="first-cuts" />} />
          <Route path="/workshop/projects" element={<Workshop tab="projects" />} />
          <Route path="/workshop/bits" element={<Workshop tab="bits" />} />
          <Route path="/workshop/settings" element={<Workshop tab="settings" />} />
          <Route path="/surfacing" element={<Surfacing />} />
          <Route path="/create" element={<Create />} />
          <Route path="/prepare" element={<Job step="prepare" />} />
          <Route path="/position" element={<Job step="position" />} />
          <Route path="/carve" element={<Job step="carve" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ConnectWizardHost />
      <Toasts />
    </HashRouter>
  );
}
