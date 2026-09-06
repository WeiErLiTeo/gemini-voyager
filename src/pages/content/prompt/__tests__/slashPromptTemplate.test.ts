import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { startPromptSlashCommand } from '../slashPrompt';

const prompts: PromptItem[] = [
  {
    id: 'fable',
    name: 'Fable',
    text: '围绕 {{concept}} 这个概念,用 {{tone}} 的语气写一则寓言。',
    tags: ['writing'],
    createdAt: 1,
  },
  {
    id: 'plain',
    name: 'Plain',
    text: 'Review this code and report correctness issues.',
    tags: ['code'],
    createdAt: 2,
  },
];

function setRect(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      x: 20,
      y: 300,
      top: 300,
      left: 20,
      right: 420,
      bottom: 360,
      width: 400,
      height: 60,
      toJSON: () => ({}),
    }) as DOMRect;
}

function createContentEditable(text: string): HTMLElement {
  document.body.innerHTML = `<rich-textarea><div id="question-input" contenteditable="true" role="textbox"></div></rich-textarea>`;
  const input = document.getElementById('question-input')!;
  input.textContent = text;
  setRect(input);
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return input;
}

function typeInto(input: HTMLElement): void {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(input: HTMLElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function fillSurface(): HTMLElement | null {
  return document.querySelector('.gv-pm-fill');
}

function slots(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.gv-pm-fill .gv-pm-slot')];
}

function token(input: HTMLElement): HTMLElement | null {
  return input.querySelector('.gv-pm-slash-token');
}

describe('slash completion with template prompts', () => {
  let destroy: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    destroy?.();
    destroy = null;
    document.body.innerHTML = '';
  });

  it('asks for the values before it places a token', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    // Nothing has been committed to the composer yet.
    expect(token(input)).toBeNull();
    expect(fillSurface()).not.toBeNull();
    expect(slots().map((slot) => slot.dataset.gvVar)).toEqual(['concept', 'tone']);
    // The result list gets out of the way.
    expect(document.getElementById('gv-pm-slash-root')?.hidden).toBe(true);
  });

  it('stores the resolved body on the token so expansion stays unchanged', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    const [concept, tone] = slots();
    concept.value = '沉没成本';
    tone.value = '克制';
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();

    const placed = token(input);
    expect(placed).not.toBeNull();
    // The chip still reads as the prompt's name…
    expect(placed?.textContent).toBe('Fable');
    // …while the body it will expand into is already resolved.
    expect(placed?.dataset.gvPromptText).toBe('围绕 沉没成本 这个概念,用 克制 的语气写一则寓言。');
    expect(fillSurface()).toBeNull();
  });

  it('keeps the placeholders when the user defers filling', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    (document.querySelector('.gv-pm-fill .gv-pm-cancel') as HTMLButtonElement).click();

    // "Keep as is" is the deferred path: the body expands literally at send.
    expect(token(input)?.dataset.gvPromptText).toBe(prompts[0].text);
  });

  it('leaves the composer alone when the fill is abandoned', () => {
    const input = createContentEditable('/fable');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    slots()[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(fillSurface()).toBeNull();
    expect(token(input)).toBeNull();
    // The query the user typed is still theirs to edit.
    expect(input.textContent).toBe('/fable');
  });

  it('does not disturb a prompt that has no placeholders', () => {
    const input = createContentEditable('/plain');
    destroy = startPromptSlashCommand({ initialItems: prompts }).destroy;
    typeInto(input);
    press(input, 'Enter');

    expect(fillSurface()).toBeNull();
    expect(token(input)?.dataset.gvPromptText).toBe(prompts[1].text);
  });

  it('takes an open fill surface down with the controller', () => {
    const input = createContentEditable('/fable');
    const controller = startPromptSlashCommand({ initialItems: prompts });
    destroy = controller.destroy;
    typeInto(input);
    press(input, 'Enter');
    expect(fillSurface()).not.toBeNull();

    controller.destroy();
    destroy = null;

    expect(fillSurface()).toBeNull();
  });
});
