import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { SimGrid } from "../engine/protocol";
import { THROUGH_COLOR, type Material } from "../lib/catalog";
import { TAB_COLOR, tabMask, type TabMark } from "./tabs";

/**
 * 3D view of the simulated part: the height map becomes a lit mesh, with studio lighting
 * and a contact shadow. Drag to orbit; the 360° button does a full turn.
 */
export function ThreeView(props: { sim: SimGrid; thickness: number; material: Material; board: { width: number; height: number }; zoom: number; spin: number; size: { w: number; h: number }; marker?: { x: number; y: number; z: number } | null; /** Holding tabs, drawn in the tab colour. */ tabs?: TabMark[] }) {
  const host = useRef<HTMLDivElement>(null);
  // The pointer handlers are set up once, so drawing reads the latest props (zoom, board) from here.
  const live = useRef(props);
  live.current = props;
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; mesh?: THREE.Mesh; marker: THREE.Mesh; pins: THREE.Group; yaw: number; tilt: number; dist: number; raf?: number } | null>(null);

  // Scene (once).
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      el.textContent = "3D view needs WebGL";
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
    scene.add(new THREE.HemisphereLight(0xfff6ea, 0x1a1b1e, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-400, 600, 900);
    scene.add(key);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(3, 14, 24), new THREE.MeshStandardMaterial({ color: 0xff5b1f, emissive: 0x501a08 }));
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);
    const pins = new THREE.Group();
    scene.add(pins);
    ctx.current = { renderer, scene, camera, marker, pins, yaw: -14, tilt: 52, dist: 1 };

    let drag: { x: number; y: number; yaw: number; tilt: number } | null = null;
    const down = (e: PointerEvent) => {
      const c = ctx.current!;
      drag = { x: e.clientX, y: e.clientY, yaw: c.yaw, tilt: c.tilt };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || !ctx.current) return;
      ctx.current.yaw = drag.yaw - (e.clientX - drag.x) * 0.5;
      ctx.current.tilt = Math.max(5, Math.min(85, drag.tilt + (e.clientY - drag.y) * 0.4));
      draw();
    };
    const up = () => (drag = null);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  function draw() {
    const c = ctx.current;
    if (!c) return;
    const { board, zoom, thickness } = live.current;
    const { width, height } = board;
    const r = (Math.hypot(width, height) * 2.1) / zoom;
    const yaw = (c.yaw * Math.PI) / 180;
    const tilt = (c.tilt * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    c.camera.position.set(cx + r * Math.sin(yaw) * Math.sin(tilt), cy - r * Math.cos(yaw) * Math.sin(tilt), r * Math.cos(tilt));
    c.camera.up.set(0, 0, 1);
    c.camera.lookAt(cx, cy, -thickness / 2);
    c.renderer.render(c.scene, c.camera);
  }

  // Mesh from the height map.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const { sim, thickness, material } = props;
    const { cols, rows, res, x0, y0, h } = sim;
    // Reduce the mesh to at most ~520 columns (260 in Panel mode).
    const maxCols = document.documentElement.dataset.panel === "1" ? 260 : 520;
    const step = Math.max(1, Math.ceil(Math.max(cols, rows) / maxCols));
    const nx = Math.floor((cols - 1) / step) + 1;
    const ny = Math.floor((rows - 1) / step) + 1;
    const pos = new Float32Array(nx * ny * 3);
    const col = new Float32Array(nx * ny * 3);
    const face = new THREE.Color(material.face);
    const recess = new THREE.Color(material.recess);
    const side = new THREE.Color(material.side);
    const through = new THREE.Color(THROUGH_COLOR);
    const tab = new THREE.Color(TAB_COLOR);
    const mask = props.tabs?.length ? tabMask(sim, props.tabs) : null;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cell = j * step * cols + i * step;
        const v = h[cell];
        const k = (j * nx + i) * 3;
        pos[k] = x0 + i * step * res;
        pos[k + 1] = y0 + j * step * res;
        pos[k + 2] = Math.max(-thickness, v);
        const cc = v <= -thickness + 0.02 ? through : v > -0.02 ? face : mask?.[cell] ? tab : -v > thickness * 0.55 ? side : recess;
        col[k] = cc.r;
        col[k + 1] = cc.g;
        col[k + 2] = cc.b;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        idx.push(a, a + 1, a + nx + 1, a, a + nx + 1, a + nx);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (c.mesh) {
      c.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    c.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
    c.scene.add(c.mesh);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sim, props.thickness, props.material, JSON.stringify(props.tabs ?? [])]);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    c.renderer.setSize(props.size.w, props.size.h);
    c.camera.aspect = props.size.w / Math.max(1, props.size.h);
    c.camera.updateProjectionMatrix();
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.size.w, props.size.h, props.zoom]);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (props.marker) {
      c.marker.visible = true;
      c.marker.position.set(props.marker.x, props.marker.y, props.marker.z + 7);
    } else c.marker.visible = false;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.marker?.x, props.marker?.y, props.marker?.z]);

  // Holding tabs: the tab tops are coloured in the mesh, and a small amber pin over each one makes
  // them easy to find from any angle (they sit deep in the cut).
  const tabsKey = JSON.stringify(props.tabs ?? []);
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    for (const ch of [...c.pins.children]) {
      c.pins.remove(ch);
      (ch as THREE.Mesh).geometry.dispose();
    }
    const mat = new THREE.MeshStandardMaterial({ color: TAB_COLOR, emissive: 0x6b3500, roughness: 0.5 });
    for (const t of props.tabs ?? []) {
      const pin = new THREE.Mesh(new THREE.ConeGeometry(2, 6, 18), mat);
      pin.rotation.x = -Math.PI / 2;
      pin.position.set(t.x, t.y, 5);
      c.pins.add(pin);
    }
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsKey]);

  // 360° turn (respects prefers-reduced-motion).
  useEffect(() => {
    const c = ctx.current;
    if (!c || props.spin === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      c.yaw = -14;
      c.tilt = 52;
      draw();
      return;
    }
    const y0 = c.yaw;
    const t0 = c.tilt;
    const start = performance.now();
    const dur = 4200;
    const f = (t: number) => {
      const s = Math.min(1, (t - start) / dur);
      const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
      c.yaw = y0 + 360 * e;
      c.tilt = t0 + (Math.max(t0, 48) - t0) * Math.min(1, s * 4);
      draw();
      if (s < 1) c.raf = requestAnimationFrame(f);
    };
    c.raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(c.raf!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.spin]);

  return <div ref={host} style={{ position: "absolute", inset: 0, cursor: "grab" }} aria-label="3D preview. Drag to turn the piece." />;
}
