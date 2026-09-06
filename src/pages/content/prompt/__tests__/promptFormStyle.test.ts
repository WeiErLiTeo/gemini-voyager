import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every rule block that targets the class `cls`, as [selector, body] pairs.
 * Matched on a class-name boundary so `.gv-pm-save` does not also pull in
 * `.gv-pm-saved-filters`.
 */
function blocksFor(css: string, cls: string): Array<[string, string]> {
  const boundary = new RegExp(`\\${cls}(?![\\w-])`);
  const out: Array<[string, string]> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim();
    if (boundary.test(selector)) out.push([selector, m[2]]);
  }
  return out;
}

function readContentStyle(): string {
  return readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
}

describe('prompt form accent', () => {
  it('paints the primary buttons from the brand token in every theme layer', () => {
    const css = readContentStyle();
    // The panel always carries data-gv-theme, so that layer wins over the base
    // rules — both must resolve the accent through the token, or a custom
    // colour only survives in whichever layer was updated.
    const save = blocksFor(css, '.gv-pm-save');
    expect(save.length).toBeGreaterThan(2);

    for (const [selector, body] of save) {
      if (!/background:/.test(body)) continue;
      expect(
        /var\(--gv-pm-brand/.test(body),
        `${selector} sets a background that does not come from the brand token`,
      ).toBe(true);
    }
  });

  it('never rebuilds the accent from a literal hue', () => {
    const css = readContentStyle();

    // Regression: :hover hardcoded hue 158 and the dark foreground hue 160, so
    // a user's custom accent snapped back to the default green on hover.
    for (const needle of ['.gv-pm-save', '.gv-pm-add']) {
      for (const [selector, body] of blocksFor(css, needle)) {
        expect(body, `${selector} hardcodes a brand hue`).not.toMatch(
          /oklch\([^)]*\b(?:158|160)\b[^)]*\)/,
        );
      }
    }
  });

  it('keeps the form fields on one shape and inherits the panel foreground', () => {
    const css = readContentStyle();
    // The class also appears in the shared user-select and box-sizing resets;
    // the shape block is the one that sets the radius.
    const base = blocksFor(css, '.gv-pm-input-text').find(([, body]) =>
      body.includes('border-radius'),
    );
    expect(base).toBeDefined();
    const body = (base as [string, string])[1];

    // Inheriting kills the per-theme hex duplication these fields used to carry.
    expect(body).toContain('color: inherit');
    // Form controls do not inherit type by default.
    expect(body).toContain('font: inherit');
    expect(body).toContain('border-radius: 10px');
    expect(body).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it('keeps the slot sizer out of the fill surface scroll region', () => {
    const css = readContentStyle();
    const sizer = blocksFor(css, '.gv-pm-slot-sizer').find(([, body]) => body.includes('position'));
    expect(sizer).toBeDefined();
    const body = (sizer as [string, string])[1];

    // The sizer parks itself off-canvas inside `.gv-pm-fill`, which scrolls.
    // An absolutely positioned child is measured into that box's scrollable
    // overflow, and `left: -9999px` only escapes it while the surface is LTR;
    // on an RTL host page it becomes end-side overflow and the fill card grows
    // a horizontal scrollbar that pans the sentence away. A fixed box
    // contributes to no ancestor's scrollable overflow.
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).not.toMatch(/position:\s*absolute/);

    const fill = blocksFor(css, '.gv-pm-fill').find(([selector]) => selector === '.gv-pm-fill');
    expect(fill).toBeDefined();
    // Pins the premise: a transformed ancestor would make `fixed` contained
    // again, and would already be mispositioning the surface itself.
    expect((fill as [string, string])[1]).not.toMatch(/\b(?:transform|filter|contain)\s*:/);
  });
});
