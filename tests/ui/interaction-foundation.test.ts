import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const style = readFileSync(new URL("../../src/style.css", import.meta.url), "utf8");
const menu = readFileSync(new URL("../../src/ui/workbench-menu.ts", import.meta.url), "utf8");

describe("interaction foundation", () => {
  it("centralizes target, state, duration and easing tokens", () => {
    expect(style).toContain("--interaction-target-compact: 28px");
    expect(style).toContain("--interaction-hover-background:");
    expect(style).toContain("--interaction-pressed-background:");
    expect(style).toContain("--motion-feedback: 110ms");
    expect(style).toContain("--motion-surface: 200ms");
    expect(style).toContain("--ease-out-quart:");
  });

  it("keeps motion spatially restrained and honors reduced motion", () => {
    const foundation = style.slice(style.indexOf("/* Interaction foundation"));
    expect(foundation).toContain("@media (prefers-reduced-motion: reduce)");
    expect(foundation).toContain("transform: none !important");
    expect(foundation).not.toMatch(/transition:\s*(?:width|height|padding|margin)/u);
  });

  it("gives Dock surfaces explicit opening and closing states", () => {
    expect(menu).toContain('menu.popup.dataset.state = "opening"');
    expect(menu).toContain('menu.popup.dataset.state = "closing"');
    expect(menu).toContain('menu.popup.dataset.state = "closed"');
    expect(style).toContain('.workbench-menu__popup[data-state="opening"]');
    expect(style).toContain('.workbench-menu__popup[data-state="closing"]');
  });

  it("keeps lesson and transcript surfaces on theme and background tokens", () => {
    const lessonStart = style.indexOf("/* === v6 guided lesson rail");
    const lessonEnd = style.indexOf(".quick-open", lessonStart);
    const lesson = style.slice(lessonStart, lessonEnd);
    const transcript = style.slice(
      style.indexOf(".mentor-panel__transcript"),
      style.indexOf(".mentor-panel__chat-empty"),
    );

    expect(lesson).toContain("background: var(--surface)");
    expect(lesson).toContain("color: var(--ink)");
    expect(lesson).toContain("outline: 2px solid var(--focus)");
    expect(lesson).not.toMatch(/#[fF]{3,6}\b/u);
    expect(transcript).toContain("background: var(--surface)");
    expect(transcript).not.toMatch(/background:\s*#(?:fff|ffffff)\b/iu);
  });
});
