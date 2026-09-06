import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STYLE_ID = 'gemini-voyager-edit-input-width';
const STORAGE_KEY = 'geminiEditInputWidth';
const ENABLED_KEY = 'gvEditInputWidthEnabled';

function getInjectedStyle(): HTMLStyleElement {
  const style = document.getElementById(STYLE_ID);
  expect(style).not.toBeNull();
  return style as HTMLStyleElement;
}

describe('editInputWidth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    document.head.innerHTML = '';
    document.body.innerHTML = '<main></main>';

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: string[], callback: (value: Record<string, unknown>) => void) => {
        callback({ [STORAGE_KEY]: 80, [ENABLED_KEY]: true });
      },
    );
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
  });

  it('applies the configured width to the main input area', async () => {
    const { startEditInputWidthAdjuster } = await import('../index');
    startEditInputWidthAdjuster();

    const styleText = getInjectedStyle().textContent ?? '';
    expect(styleText).toContain('max-width: 80vw !important');
    expect(styleText).toContain('width: min(100%, 80vw) !important');
    expect(styleText).toContain('--bard-chat-window-content-width-default: 80vw');
    expect(styleText).toContain('html body input-container input-area-v2');
  });

  it('widens the file-drop overlay to match the input area (#887)', async () => {
    const { startEditInputWidthAdjuster } = await import('../index');
    startEditInputWidthAdjuster();

    const styleText = getInjectedStyle().textContent ?? '';
    // Read the selector back out of the injected CSS so this test fails if the
    // shipped rule changes, instead of only checking a hardcoded copy of it
    const overlayRule = styleText.match(
      /(^|\n)\s*(html body input-container file-drop-indicator[^{]+)\{([^}]+)\}/,
    );
    expect(overlayRule).not.toBeNull();
    const selector = (overlayRule as RegExpMatchArray)[2].trim();
    const body = (overlayRule as RegExpMatchArray)[3];

    // More specific than chatWidth's input-container-prefixed overlay rule so
    // both-enabled sessions follow Edit input width for the composer (#955).
    expect(selector).toBe(
      'html body input-container file-drop-indicator .overlay-container[data-filedrop-id="chat-window-input-container"]',
    );
    expect(body).toContain('max-width: 80vw !important');
    expect(body).toContain('width: min(100%, 80vw) !important');
    expect(body).toContain('margin-left: auto !important');
    expect(body).toContain('margin-right: auto !important');

    // Behavioral check against the real DOM shape: the chat overlay matches,
    // an overlay for a different drop target does not
    document.body.innerHTML = `
      <main>
        <input-container>
          <fieldset class="input-area-container">
            <file-drop-indicator>
              <div class="overlay-container" data-filedrop-id="chat-window-input-container"></div>
            </file-drop-indicator>
          </fieldset>
        </input-container>
        <file-drop-indicator>
          <div class="overlay-container" data-filedrop-id="some-other-target"></div>
        </file-drop-indicator>
      </main>
    `;
    const matches = [...document.querySelectorAll(selector)];
    expect(matches.map((el) => el.getAttribute('data-filedrop-id'))).toEqual([
      'chat-window-input-container',
    ]);
  });

  it('sizes only the outermost edit container so the actions stay under the box', async () => {
    const { startEditInputWidthAdjuster } = await import('../index');
    startEditInputWidthAdjuster();

    const styleText = getInjectedStyle().textContent ?? '';

    // Read the shipped rule back out so this fails if the selector changes.
    const nestedRule = styleText.match(
      /(^|\n)\s*(\.edit-mode \.edit-container \.edit-container,[^{]+)\{([^}]+)\}/,
    );
    expect(nestedRule).not.toBeNull();
    const selector = (nestedRule as RegExpMatchArray)[2].trim().replace(/\s*\n\s*/g, ' ');
    expect((nestedRule as RegExpMatchArray)[3]).toContain('width: 100% !important');

    // Gemini's real edit-mode shape: two nested .edit-container elements, the
    // outer one also holding .edit-button-area (Cancel/Update). The inner one
    // is indented by .query-content's padding, so sizing both to the slider
    // width pushed the box past the buttons by exactly that padding.
    document.body.innerHTML = `
      <main>
        <user-query-content class="user-query-container">
          <div class="user-query-container edit-mode">
            <div class="edit-container" id="outer">
              <div class="query-content ng-star-inserted edit-mode" id="query">
                <div class="edit-container" id="inner">
                  <mat-form-field class="mat-mdc-form-field edit-form"></mat-form-field>
                </div>
              </div>
              <div class="edit-button-area">
                <button type="button">Cancel</button>
                <button type="button">Update</button>
              </div>
            </div>
          </div>
        </user-query-content>
      </main>
    `;

    const filled = [...document.querySelectorAll(selector)].map((el) => el.id);
    // The outer container keeps the slider width; everything nested fills it.
    expect(filled).toContain('inner');
    expect(filled).toContain('query');
    expect(filled).not.toContain('outer');
  });

  it('measures every width rule against the border box', async () => {
    const { startEditInputWidthAdjuster } = await import('../index');
    startEditInputWidthAdjuster();

    const styleText = getInjectedStyle().textContent ?? '';
    const borderBoxRule = styleText.match(/([^{}]+)\{\s*box-sizing: border-box !important;\s*\}/);
    expect(borderBoxRule).not.toBeNull();
    const selector = (borderBoxRule as RegExpMatchArray)[1];

    // These containers carry horizontal padding. A content-box width overflows
    // the parent by that padding and desyncs the box from the button row.
    for (const needed of [
      '.query-content.edit-mode',
      '.edit-mode .edit-container',
      '.edit-mode .edit-form',
      '.edit-mode .mat-mdc-form-field-infix',
    ]) {
      expect(selector).toContain(needed);
    }
  });
});
