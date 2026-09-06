/**
 * Prompt template variables.
 *
 * A prompt becomes a template only when it contains at least one `{{name}}`
 * placeholder. Single braces are deliberately not a placeholder: prompt bodies
 * render through `marked-katex-extension`, where `\frac{a}{b}` would otherwise
 * turn `{a}` and `{b}` into variables. `convertLegacyBraces` exists so prompts
 * already authored with single braces can be migrated on purpose rather than
 * guessed at.
 *
 * Pure string operations only — no DOM, no storage. The fill surface and the
 * slash path both resolve through here so the two entry points cannot drift.
 */

/** Placeholder names: no whitespace, no nesting, Latin or CJK. */
const NAME = String.raw`[\w一-龥.\-]+`;

/** `\{{` escapes a literal `{{`, so a prompt can talk about the syntax itself. */
const SCAN = new RegExp(String.raw`\\\{\{|\{\{\s*(${NAME})\s*\}\}`, 'g');

/**
 * `{name}` with a brace on neither side. Deliberately written without a
 * lookbehind: Safari only gained those in 16.4 and the extension supports
 * 15.4+ (`vite.config.safari.ts`), where a lookbehind inside a module-level
 * `new RegExp` throws at content-script evaluation and takes every Voyager
 * feature down with it, not just this one. The opening brace is matched
 * plainly and the character before it is checked by offset in
 * `convertLegacyBraces`. A leading `{` cannot be followed by another `{`
 * anyway, since `NAME` excludes braces.
 */
const LEGACY_SINGLE = new RegExp(String.raw`\{\s*(${NAME})\s*\}(?!\})`, 'g');

/**
 * Source for a global matcher over `{{name}}`, exported so anything that has to
 * find placeholders in already-rendered text uses the same name charset as the
 * parser instead of a copy that can drift from it.
 */
export const TEMPLATE_VARIABLE_SOURCE = String.raw`\{\{\s*(${NAME})\s*\}\}`;

export interface TemplateTextSegment {
  kind: 'text';
  value: string;
}

export interface TemplateVariableSegment {
  kind: 'variable';
  name: string;
}

export type TemplateSegment = TemplateTextSegment | TemplateVariableSegment;

/**
 * Split a prompt body into literal text and variable slots, in source order.
 * The fill surface renders this directly: text runs stay text, variable runs
 * become inputs sitting in the sentence they belong to.
 */
export function parsePromptTemplate(text: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let cursor = 0;

  const pushText = (value: string): void => {
    if (!value) return;
    const last = segments[segments.length - 1];
    if (last?.kind === 'text') last.value += value;
    else segments.push({ kind: 'text', value });
  };

  SCAN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCAN.exec(text)) !== null) {
    pushText(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (match[1] === undefined) {
      // An escaped opener: emit the braces as ordinary text.
      pushText('{{');
      continue;
    }
    segments.push({ kind: 'variable', name: match[1] });
  }
  pushText(text.slice(cursor));

  return segments;
}

/** Variable names in first-appearance order. A name repeated in the body is asked for once. */
export function promptTemplateVariables(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const segment of parsePromptTemplate(text)) {
    if (segment.kind !== 'variable') continue;
    if (seen.has(segment.name)) continue;
    seen.add(segment.name);
    names.push(segment.name);
  }
  return names;
}

export function isPromptTemplate(text: string): boolean {
  return promptTemplateVariables(text).length > 0;
}

/**
 * Substitute the values that were supplied. A variable left blank keeps its
 * `{{name}}` form: sending a half-filled prompt is the user's call, and the
 * literal placeholder is the only honest, recoverable thing to send.
 */
export function fillPromptTemplate(text: string, values: Record<string, string>): string {
  return parsePromptTemplate(text)
    .map((segment) => {
      if (segment.kind === 'text') return segment.value;
      const value = values[segment.name];
      return value != null && value.trim() !== '' ? value : `{{${segment.name}}}`;
    })
    .join('');
}

/** Names still unfilled once `values` is applied, in first-appearance order. */
export function unfilledTemplateVariables(text: string, values: Record<string, string>): string[] {
  return promptTemplateVariables(text).filter((name) => {
    const value = values[name];
    return value == null || value.trim() === '';
  });
}

/**
 * Rewrite `{name}` as `{{name}}` for prompts authored before double braces.
 * Offered as an explicit editor action, never applied automatically: only the
 * author knows whether a given `{x}` is a placeholder or part of the prose.
 */
export function convertLegacyBraces(text: string): string {
  LEGACY_SINGLE.lastIndex = 0;
  return text.replace(LEGACY_SINGLE, (match: string, name: string, offset: number) =>
    text[offset - 1] === '{' ? match : `{{${name}}}`,
  );
}
