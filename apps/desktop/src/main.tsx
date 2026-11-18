import "@maindy/design-system/tokens.css";
import "./styles.css";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { bridge, initBridge, resolveView } from "./bridge";
import { AppProvider } from "./data";
import type { Bootstrap } from "./types";
import { MainWindow } from "./views/MainWindow";
import { NotchView } from "./views/NotchView";
import { PillView } from "./views/PillView";
import { QuickPanel } from "./views/QuickPanel";
import { Snapshot } from "./views/Snapshot";

function QuickWindow() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void bridge().quickHide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="quick-root">
      <QuickPanel variant="tray" onClose={() => void bridge().quickHide()} />
    </div>
  );
}

async function start() {
  const b = await initBridge();
  const view = resolveView(b);
  document.documentElement.dataset.view = view;
  const root = createRoot(document.getElementById("root")!);
  if (view === "snapshot") {
    root.render(<Snapshot />);
    return;
  }
  let boot: Bootstrap;
  try {
    boot = await b.bootstrap();
  } catch (e) {
    root.render(<pre className="fatal">Falha ao iniciar: {String((e as { message?: string })?.message ?? e)}</pre>);
    return;
  }
  document.documentElement.dataset.platform = boot.platform;
  if (boot.reduceMotion) document.documentElement.classList.add("reduce-motion");
  root.render(
    <StrictMode>
      <AppProvider initial={boot}>
        {view === "main" && <MainWindow />}
        {view === "quick" && <QuickWindow />}
        {view === "pill" && <PillView />}
        {view === "notch" && boot.launcher.notch && <NotchView initial={boot.launcher.notch} />}
      </AppProvider>
    </StrictMode>,
  );
}

void start();
