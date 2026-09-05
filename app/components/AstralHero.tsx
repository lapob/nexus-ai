"use client";

import { useState } from "react";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { HardNavigationLink } from "./HardNavigationLink";
import { InteractiveVisualizer } from "./InteractiveVisualizer";

/** The title and core have separate grid tracks, including at 200% text size. */
export function AstralHero() {
  const [composition, setComposition] = useState(0);
  const replay = () => {
    setComposition(value => value + 1);
    window.dispatchEvent(new Event("nxs:replay-composition"));
  };
  return <section className="hero astral-hero" id="top" aria-label="NexusNXS AI">
    <div className="astral-hero__scene" key={composition}>
      <h1 className="hero-product-name" aria-label="NexusNXS AI">
        {["NEXUS", "NXS"].map((word) => <span className="hero-word" aria-hidden="true" key={word}>
          {[...word].map((letter, index) => <span className="hero-letter" key={index}>{letter}</span>)}
        </span>)}
      </h1>
      <div className="home-neural-core" aria-hidden="true"><InteractiveVisualizer variant="android" /></div>
    </div>
    <div className="hero-intro">
      <p>Un pensiero. La voce. Le possibilità.</p>
      <div className="hero-actions">
        <HardNavigationLink className="primary-button" href="https://ai.nexusnxs.com">Apri NexusNXS AI <ArrowUpRight size={16} /></HardNavigationLink>
        <a className="text-link" href="#apps">Scopri cosa può fare <span>↓</span></a>
      </div>
    </div>
    <button className="astral-hero__replay" onClick={replay} aria-label="Ripeti animazione" title="Ripeti animazione"><RotateCcw size={19} strokeWidth={1.5} /></button>
  </section>;
}
