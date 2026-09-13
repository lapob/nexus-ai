"use client";

import { ArrowUpRight } from "lucide-react";
import { HardNavigationLink } from "./HardNavigationLink";

/** The title and core have separate grid tracks, including at 200% text size. */
export function AstralHero() {
  return <section className="hero astral-hero" id="top" aria-label="NexusNXS AI" data-cosmic-scene="center" data-cosmic-form="sigil">
    <div className="astral-hero__track">
    <div className="astral-hero__scene">
      <h1 className="hero-product-name" aria-label="NexusNXS AI">
        {["NEXUS", "NXS"].map((word) => <span className="hero-word" aria-hidden="true" key={word}>
          {[...word].map((letter, index) => <span className="hero-letter" key={index}>{letter}</span>)}
        </span>)}
      </h1>
      <div className="home-neural-core" aria-hidden="true" />
      <div className="hero-entry">
        <p>Il tuo assistente AI su PC, Android e web.</p>
        <HardNavigationLink className="primary-button" href="https://ai.nexusnxs.com"><span>Prova NexusNXS AI</span><ArrowUpRight size={16} /></HardNavigationLink>
        <div className="hero-intro">
          <div className="hero-actions">
            <a className="text-link" href="#apps"><span className="hero-action-label">Scopri cosa può fare</span><span className="hero-action-arrow" aria-hidden="true">↓</span></a>
          </div>
        </div>
      </div>
    </div>
    </div>
  </section>;
}
