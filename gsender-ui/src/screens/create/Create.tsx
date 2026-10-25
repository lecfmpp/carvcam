import { TopBar } from "../../components/TopBar";
import { useEngine } from "../../engine/useEngine";
import { materialById } from "../../lib/catalog";
import { useDesign } from "../../state/design";
import { Board, ToolpathOverlay, useSegments } from "../../stage/Board";
import { SimCanvas } from "../../stage/SimCanvas";
import { fitScale, Stage } from "../../stage/Stage";
import { ThreeView } from "../../stage/ThreeView";

export default function Create() {
  const design = useDesign((s) => s.design);
  const eng = useEngine(design);
  const segs = useSegments(eng.result?.gcode);
  const b = eng.result?.layout.bloco;
  return (
    <div className="app">
      <div className="dotgrid" />
      <TopBar variant="job" step="create" />
      <Stage
        caption={eng.busy ? "Working…" : `${eng.result?.avisos.length ?? 0} avisos · ok=${String(eng.result?.ok)} ${eng.error ?? ""}`}
        render={(api) =>
          eng.sim && b ? (
            api.view === "3d" ? (
              <ThreeView sim={eng.sim} thickness={b.espessura} material={materialById(design.material)} board={{ width: b.largura, height: b.altura }} zoom={api.zoom} spin={api.spin} size={api.size} />
            ) : (
              <Board width={b.largura} height={b.altura} scale={fitScale(api.size, b.largura, b.altura)} zoom={api.zoom} label={`${b.largura} × ${b.altura} mm`}>
                <SimCanvas sim={eng.sim} thickness={b.espessura} material={materialById(design.material)} scale={fitScale(api.size, b.largura, b.altura)} board={{ width: b.largura, height: b.altura }} />
                <ToolpathOverlay segments={segs} width={b.largura} height={b.altura} scale={fitScale(api.size, b.largura, b.altura)} opacity={0.25} />
              </Board>
            )
          ) : null
        }
      />
    </div>
  );
}
