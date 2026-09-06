import type { marked as MarkedFn } from 'marked';

/**
 * Prompt bodies are text destined for an LLM, not HTML documents, so a raw tag
 * inside one is content the author typed rather than markup to honour.
 *
 * Left at its default, `marked` emits `<text>`, `<style>` and `<path>` as real
 * elements. DOMPurify then sees SVG/MathML-namespaced names in an HTML context
 * and drops each one together with its contents, so `Translate <text> into
 * <language>.` reaches the reader as `Translate ` — the tail of the sentence is
 * destroyed, not merely the placeholder. Names outside that set fare no better:
 * `<YOUR_API_KEY>` is simply removed.
 *
 * Disabling both HTML tokenizers routes those runs to the text tokenizer, which
 * escapes them, so the author sees exactly what they wrote. The cost is that a
 * prompt deliberately embedding real HTML renders as literal text — the right
 * trade for a surface whose job is to preview prompt text faithfully.
 */
/**
 * Structural, so both the `marked` singleton the panel uses and a throwaway
 * `new Marked()` fit. `use()` returns `this`, so a `Pick` would not.
 */
type MarkedConfigurable = {
  use: (...extensions: Parameters<typeof MarkedFn.use>) => unknown;
};

export function renderPromptHtmlAsText(marked: MarkedConfigurable): void {
  marked.use({ tokenizer: { html: () => undefined, tag: () => undefined } });
}
