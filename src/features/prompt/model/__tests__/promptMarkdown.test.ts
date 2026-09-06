import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { describe, expect, it } from 'vitest';

import { renderPromptHtmlAsText } from '../promptMarkdown';

/** The prompt panel's real pipeline: marked + KaTeX, then the sanitizer. */
function render(configure?: (instance: Marked) => void): (text: string) => string {
  const marked = new Marked();
  marked.use(markedKatex({ throwOnError: false, output: 'html', trust: true, strict: false }));
  configure?.(marked);
  marked.setOptions({ breaks: true });
  return (text: string) => DOMPurify.sanitize(marked.parse(text) as string);
}

describe('renderPromptHtmlAsText', () => {
  it('keeps angle-bracket placeholders visible instead of letting them be sanitized away', () => {
    const rendered = render(renderPromptHtmlAsText);

    expect(rendered('Translate <text> into <language>.')).toBe(
      '<p>Translate &lt;text&gt; into &lt;language&gt;.</p>\n',
    );
    expect(rendered('Use <YOUR_API_KEY> here.')).toContain('&lt;YOUR_API_KEY&gt;');
    expect(rendered('Set <style> then continue.')).toContain('continue.');
    expect(rendered('Wrap in <path> and finish.')).toContain('finish.');
  });

  it('pins the defect it fixes: the default pipeline eats the rest of the sentence', () => {
    // Guards the fix from being reverted as cosmetic. `<text>` is an SVG name,
    // so the sanitizer drops the element together with everything after it.
    const defaultRendered = render();

    expect(defaultRendered('Translate <text> into <language>.')).toBe('<p>Translate </p>\n');
  });

  it('leaves ordinary Markdown and KaTeX untouched', () => {
    const rendered = render(renderPromptHtmlAsText);

    expect(rendered('# Title')).toBe('<h1>Title</h1>\n');
    expect(rendered('**bold** and `code`')).toBe(
      '<p><strong>bold</strong> and <code>code</code></p>\n',
    );
    expect(rendered('- a\n- b')).toContain('<li>a</li>');
    expect(rendered('line1\nline2')).toContain('<br>');
    expect(rendered('[link](https://example.com)')).toContain('href="https://example.com"');
    expect(rendered('```js\nconst a = 1;\n```')).toContain('language-js');
    expect(rendered('math $E=mc^2$ inline')).toContain('katex');
    expect(rendered('$$\\frac{a}{b}$$')).toContain('katex-display');
  });
});
