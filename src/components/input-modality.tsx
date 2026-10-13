"use client";

import { useEffect } from "react";

/**
 * Tracks whether the user is driving the UI with a pointer or the keyboard
 * (`<html data-input="pointer|keyboard">`). Radix returns focus to triggers
 * when menus, selects and dialogs close; Chrome then paints a focus ring
 * even after a mouse click. globals.css hides rings in pointer mode (except
 * on text fields), so keyboard users still get them.
 */
export function InputModality() {
  useEffect(() => {
    const root = document.documentElement;
    const set = (mode: "pointer" | "keyboard") => {
      if (root.dataset.input !== mode) root.dataset.input = mode;
    };
    const onPointer = () => set("pointer");
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      set("keyboard");
    };
    set("pointer");
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return null;
}
