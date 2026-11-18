/**
 * Visual QA gallery (browser only, Vite preview): renders the real components with fixture data so
 * Playwright can capture them. Each frame is labeled; the macOS menu bar/notch drawn here is a
 * backdrop for the screenshot only — in the app the launcher is a native window over the real notch.
 *
 *   ?shot=main|main-empty|pairing|quick|notch-collapsed|notch-hover|notch-active|notch-alert|notch-silent|notch-expanded|pill|pill-expanded
 */
import { useEffect, useState, type ReactNode } from "react";
import { bridge } from "../bridge";
import { AppProvider } from "../data";
import type { Bootstrap, ConnectorKind, NotchState, Section } from "../types";
import { MainWindow } from "./MainWindow";
import { NotchView } from "./NotchView";
import { PillView } from "./PillView";
import { QuickPanel } from "./QuickPanel";

const NOTCH_W = 185;
const NOTCH_H = 32;
const frameFor = (s: NotchState) => {
  const wing = s === "hover" ? 40 : s === "alert" ? 36 : s === "silent" ? 16 : 30;
  if (s === "expanded") return { w: 384, h: NOTCH_H + 568 };
  return { w: NOTCH_W + 2 * wing, h: NOTCH_H + (s === "hover" ? 4 : 0) };
};

function MenuBarBackdrop({ state, children }: { state: NotchState; children: ReactNode }) {
  const f = frameFor(state);
  return (
    <div className="sim-desktop">
      <div className="sim-menubar">
        <span className="sim-apple"></span>
        <span>Terminal</span>
        <span>Arquivo</span>
        <span>Editar</span>
        <span className="sim-right">qua 18 nov 14:32</span>
      </div>
      <div className="sim-notch" style={{ width: NOTCH_W, height: NOTCH_H }} aria-hidden />
      <div className="sim-window" style={{ width: f.w, height: f.h }}>
        {children}
      </div>
      <div className="sim-caption">Simulação para QA visual · no app a janela é nativa (AppKit) sobre o notch físico</div>
    </div>
  );
}

export function Snapshot() {
  const params = new URLSearchParams(location.search);
  const shot = params.get("shot") ?? "main";
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  useEffect(() => {
    void bridge().bootstrap().then(setBoot);
  }, []);
  if (!boot) return null;
  document.documentElement.dataset.platform = boot.platform;
  document.documentElement.dataset.shot = shot;

  let body: ReactNode;
  if (shot.startsWith("notch-")) {
    const st = shot.slice(6) as NotchState;
    const f = frameFor(st);
    body = (
      <MenuBarBackdrop state={st}>
        <NotchView
          simulated
          initial={{ available: true, state: st, base: st === "hover" || st === "expanded" ? "active" : st, notchW: NOTCH_W, notchH: NOTCH_H, frameW: f.w, frameH: f.h, screenName: null, reduceMotion: false }}
        />
      </MenuBarBackdrop>
    );
  } else if (shot === "quick") {
    body = (
      <div className="sim-desktop sim-tray">
        <div className="sim-menubar">
          <span className="sim-apple"></span>
          <span>Finder</span>
          <span className="sim-right">
            <img src="./brand/orb-96.webp" alt="" className="sim-trayicon" /> qua 18 nov 14:32
          </span>
        </div>
        <div className="sim-quick">
          <div className="quick-root">
            <QuickPanel variant="tray" onClose={() => {}} />
          </div>
        </div>
        <div className="sim-caption">Mac sem notch / monitor externo: painel rápido ancorado ao ícone da barra de menus</div>
      </div>
    );
  } else if (shot === "pill" || shot === "pill-expanded") {
    body = (
      <div className="sim-desktop sim-win">
        <div className={shot === "pill" ? "sim-pill" : "sim-pill-exp"}>
          <PillView simulated initialExpanded={shot === "pill-expanded"} />
        </div>
        <div className="sim-taskbar" />
        <div className="sim-caption">Windows: pílula arrastável com snap nas bordas da área de trabalho (simulação)</div>
      </div>
    );
  } else {
    const section = (params.get("section") as Section) ?? "overview";
    body = (
      <div className="sim-main">
        <MainWindow initialSection={section} initialFocus={(params.get("focus") as ConnectorKind | null) ?? null} />
      </div>
    );
  }
  return <AppProvider initial={boot}>{body}</AppProvider>;
}
