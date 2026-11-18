"use client";

import "./film.css";
import { CinematicCanvas } from "./CinematicCanvas";
import { CinematicScrollController } from "./CinematicScrollController";
import { AssistantScene, ClarityScene, DemoScene, FinalScene, HeroScene, MeetScene, OrbitScene, OverloadScene, ProductScene, QualityScene, ShiftScene } from "./scenes/Scenes";
import { Experience } from "./ui/Experience";
import { SceneProgress } from "./ui/SceneProgress";
import type { OrbitDemoData } from "@/lib/lp/orbit-demo";

/** The MAINDY film: one continuous scroll-directed experience, from the first light to the download. */
export function Film({ demo }: { demo: OrbitDemoData }) {
  return (
    <CinematicScrollController>
      <noscript>
        <style>{`.film-section{height:auto!important}.film-stage{position:relative!important;visibility:visible!important;height:auto!important;min-height:100svh;padding-block:6rem}[data-r],[data-w]{opacity:1!important;visibility:visible!important;transform:none!important}`}</style>
      </noscript>
      {/* hold the hero entrance until the preloader hands over (first visit of the session, motion allowed) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(sessionStorage.getItem("maindy-lp-loaded")!=="1"&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("mk-loading")}catch(e){}`,
        }}
      />
      <CinematicCanvas />
      <Experience />
      <SceneProgress />
      <HeroScene />
      <OverloadScene />
      <ShiftScene />
      <MeetScene />
      <DemoScene data={demo} />
      <OrbitScene />
      <QualityScene />
      <AssistantScene />
      <ClarityScene />
      <ProductScene />
      <FinalScene />
    </CinematicScrollController>
  );
}
