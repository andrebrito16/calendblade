"use client";

import { useEffect } from "react";

/**
 * Reveals `[data-reveal]` elements once, as they scroll into view. Only
 * elements still below the fold are hidden, so content already on screen never
 * flashes and nothing is hidden without JS. Styles live in globals.css.
 */
export function ScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal", "shown");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    for (const element of document.querySelectorAll("[data-reveal]")) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.setAttribute("data-reveal", "pending");
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return null;
}
