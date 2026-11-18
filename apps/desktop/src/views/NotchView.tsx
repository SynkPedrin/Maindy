/**
 * Content of the native notch window (macOS). The window itself is positioned/resized by Rust
 * (src-tauri/src/notch.rs) over the real camera housing; this component only draws the black
 * shape that merges with the notch and the Quick Panel when expanded.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";
import { orbitStatus, useApp, useDashboard } from "../data";
import type { NotchState, NotchView as NotchGeom } from "../types";
import { Orb, cx } from "../ui";
import { QuickPanel } from "./QuickPanel";

export function NotchView({ initial, simulated }: { initial: NotchGeom; simulated?: boolean }) {
  const { boot, gateway, demo } = useApp();
  const [geom, setGeom] = useState<NotchGeom>(initial);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = geom.reduceMotion || boot.reduceMotion;
  // light poll for the resting state (active / alert); the panel itself polls when open
  const d = useDashboard("24h", ["policy"], 60_000);
  const status = orbitStatus(d.policy.data, gateway);

  const alert = boot.sessionRevoked || gateway.phase === "crashed" || (!!boot.keychainError && !demo);
  const base: NotchState = boot.settings.silentMode ? "silent" : alert ? "alert" : status === "active" && gateway.healthy ? "active" : "collapsed";

  useEffect(() => {
    if (!simulated) void bridge().notchSetBase(base);
  }, [base, simulated]);

  useEffect(() => {
    const subs = [
      bridge().on<NotchGeom>("notch://state", (g) => {
        setGeom(g);
        if (g.state !== "expanded") setClosing(false);
      }),
      bridge().on("notch://request-collapse", () => collapse()),
    ];
    return () => subs.forEach((p) => void p.then((u) => u()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collapse = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => void bridge().notchSetState("collapsed"), reduce ? 0 : 170);
  }, [reduce]);

  const expand = () => {
    setClosing(false);
    void bridge().notchSetState("expanded");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && geom.state === "expanded") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [geom.state, collapse]);

  useEffect(() => {
    if (geom.state === "expanded") rootRef.current?.querySelector<HTMLElement>(".qp")?.focus({ preventScroll: true });
  }, [geom.state]);

  const expanded = geom.state === "expanded";
  const shown: NotchState = expanded ? "expanded" : geom.state === "hover" ? "hover" : simulated ? geom.state : base;
  const wing = expanded ? 0 : Math.max(0, (geom.frameW - geom.notchW) / 2);

  return (
    <div
      ref={rootRef}
      className={cx("notch-root", `ns-${shown}`, reduce && "reduce-motion", closing && "is-closing", simulated && "is-simulated")}
      style={{ ["--notch-h" as string]: `${geom.notchH}px`, ["--notch-w" as string]: `${geom.notchW}px`, ["--wing" as string]: `${wing}px` }}
    >
      {!expanded ? (
        <button
          type="button"
          className="notch-pill"
          onClick={expand}
          aria-label={`Abrir painel rápido da maindy. ${shown === "alert" ? "(requer atenção)" : shown === "active" ? "(ORBIT ativo)" : ""}`}
        >
          <span className="notch-wing notch-wing-l">
            <Orb size={shown === "hover" ? 20 : 17} active={shown === "active" && !reduce} />
          </span>
          <span className="notch-gap" aria-hidden />
          <span className="notch-wing notch-wing-r">
            <span className={cx("notch-ind", `ind-${shown}`)} aria-hidden />
          </span>
        </button>
      ) : (
        <div className="notch-panel">
          <div className="notch-panel-top" aria-hidden>
            <span />
          </div>
          <QuickPanel variant="notch" onClose={collapse} onNavigate={collapse} />
        </div>
      )}
    </div>
  );
}
