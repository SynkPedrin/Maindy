/**
 * Windows mini window ("pílula"). Dragging is native (startDragging); snapping to the work-area
 * edges and per-monitor persistence happen in Rust (src-tauri/src/pill.rs).
 */
import { useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";
import { orbitStatus, useApp, useDashboard } from "../data";
import type { PillView as PillState } from "../types";
import { Orb, StatusDot, cx, money, sourceShort } from "../ui";
import { QuickPanel } from "./QuickPanel";

export function PillView({ initialExpanded = false, simulated }: { initialExpanded?: boolean; simulated?: boolean }) {
  const { gateway, boot } = useApp();
  const [expanded, setExpanded] = useState(initialExpanded);
  const [ripple, setRipple] = useState(0);
  const d = useDashboard("24h", ["summary", "policy"], 60_000);
  const status = orbitStatus(d.policy.data, gateway);
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);

  useEffect(() => {
    const un = bridge().on<PillState>("pill://state", (p) => setExpanded(p.expanded));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void bridge().pillSetExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      void un.then((u) => u());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = () => {
    setRipple((r) => r + 1);
    if (simulated) setExpanded((v) => !v);
    void bridge().pillSetExpanded(!expanded);
  };

  if (expanded) {
    return (
      <div className="pill-expanded">
        <QuickPanel variant="pill" onClose={() => (simulated ? setExpanded(false) : void bridge().pillSetExpanded(false))} />
      </div>
    );
  }

  const s = d.summary.data;
  return (
    <div className="pill-root">
      <button
        type="button"
        className={cx("pill", status === "active" && "is-active", boot.settings.silentMode && "is-silent")}
        aria-label="maindy. — abrir painel rápido (arraste para mover)"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g || g.id !== e.pointerId || g.moved) return;
          if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) {
            g.moved = true;
            void bridge().startDragging();
          }
        }}
        onPointerUp={(e) => {
          const g = drag.current;
          drag.current = null;
          if (g && g.id === e.pointerId && !g.moved) toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span key={ripple} className="pill-ripple" aria-hidden />
        <Orb size={28} active={status === "active" && !boot.reduceMotion && !boot.settings.silentMode} />
        <span className="pill-text">
          <b>maindy.</b>
          <small>{s && s.netSavings.source !== "unavailable" ? `${money(s.netSavings)} · ${sourceShort[s.netSavings.source].toLowerCase()}` : status === "paused" ? "ORBIT pausado" : "sem dados ainda"}</small>
        </span>
        <StatusDot tone={status === "paused" ? "warn" : gateway.phase === "crashed" ? "error" : status === "active" ? "violet" : "idle"} />
      </button>
    </div>
  );
}
