import { afterEach, describe, expect, it, vi } from 'vitest';

import { highlightTemplateVariables, openTemplateFill } from '../PromptTemplateFill';

const labels = { insert: '插入', keepRaw: '保持原样', title: '填写变量' };

function anchor(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('openTemplateFill', () => {
  it('lays the slots out inside the sentence they belong to', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 用 {{tone}} 的语气写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    const surface = document.querySelector('.gv-pm-fill') as HTMLElement;
    // The text either side of a slot is what makes this readable as a sentence.
    expect(surface.querySelector('.gv-pm-fill-doc')?.textContent).toContain('围绕');
    expect(surface.querySelector('.gv-pm-fill-doc')?.textContent).toContain('的语气写');
    expect(handle.slots.map((s) => s.dataset.gvVar)).toEqual(['concept', 'tone']);
    expect(handle.slots[0].placeholder).toBe('concept');
  });

  it('submits the body with the supplied values substituted', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    handle.slots[0].value = '沉没成本';
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();

    expect(onSubmit).toHaveBeenCalledWith('围绕 沉没成本 写');
    expect(document.querySelector('.gv-pm-fill')).toBeNull();
  });

  it('keeps a blank slot literal instead of sending an empty hole', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 用 {{tone}} 的语气',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    handle.slots[0].value = '沉没成本';
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();

    expect(onSubmit).toHaveBeenCalledWith('围绕 沉没成本 用 {{tone}} 的语气');
  });

  it('grows a slot to fit what is typed into it, and its repeats too', () => {
    // jsdom has no layout, so stand the ruler in for one: report a width per
    // character of whatever text it is asked to measure.
    const measured = vi
      .spyOn(HTMLSpanElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLSpanElement) {
        return { width: (this.textContent ?? '').length * 10 } as DOMRect;
      });

    const handle = openTemplateFill({
      text: '把 {{topic}} 讲给 {{topic}} 听',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: vi.fn(),
    });

    // Mounted empty, both slots are sized from the placeholder.
    expect(handle.slots.map((slot) => slot.style.width)).toEqual(['50px', '50px']);

    handle.slots[0].value = '一个 AI 的可解释性研究方向';
    handle.slots[0].dispatchEvent(new Event('input', { bubbles: true }));

    // The typed slot grows, and so does the repeat that mirrors its value —
    // a fixed `size` attribute would have left both at the placeholder width.
    expect(handle.slots[0].style.width).toBe('150px');
    expect(handle.slots[1].value).toBe('一个 AI 的可解释性研究方向');
    expect(handle.slots[1].style.width).toBe('150px');

    measured.mockRestore();
    handle.close();
  });

  it('treats a repeated variable as one question', () => {
    const onSubmit = vi.fn();
    const handle = openTemplateFill({
      text: '{{x}} 与 {{x}}',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    handle.slots[0].value = '甲';
    handle.slots[0].dispatchEvent(new Event('input', { bubbles: true }));

    expect(handle.slots[1].value).toBe('甲');
    (document.querySelector('.gv-pm-fill .gv-pm-save') as HTMLButtonElement).click();
    expect(onSubmit).toHaveBeenCalledWith('甲 与 甲');
  });

  it('offers an escape that inserts the body untouched', () => {
    const onSubmit = vi.fn();
    openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit,
    });

    (document.querySelector('.gv-pm-fill .gv-pm-cancel') as HTMLButtonElement).click();
    expect(onSubmit).toHaveBeenCalledWith('围绕 {{concept}} 写');
  });

  it('commits on Enter and abandons on Escape', () => {
    const submitted = vi.fn();
    const cancelled = vi.fn();
    const handle = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: submitted,
      onCancel: cancelled,
    });

    handle.slots[0].value = '沉没成本';
    handle.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(submitted).toHaveBeenCalledWith('围绕 沉没成本 写');

    const second = openTemplateFill({
      text: '围绕 {{concept}} 写',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: submitted,
      onCancel: cancelled,
    });
    second.slots[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-pm-fill')).toBeNull();
  });

  it('unbinds its window listeners once closed', () => {
    const cancelled = vi.fn();
    const handle = openTemplateFill({
      text: '{{a}}',
      anchor: anchor(),
      theme: 'dark',
      labels,
      onSubmit: vi.fn(),
      onCancel: cancelled,
    });

    handle.close();
    handle.close(); // idempotent

    // A stray outside click after teardown must not reach the closed surface.
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('highlightTemplateVariables', () => {
  it('turns placeholders in rendered markup into chips', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>围绕 {{concept}} 用 {{tone}} 的语气</p>';
    highlightTemplateVariables(root);

    const chips = [...root.querySelectorAll('.gv-pm-var')].map((el) => el.textContent);
    expect(chips).toEqual(['concept', 'tone']);
    // The surrounding prose survives intact.
    expect(root.textContent).toBe('围绕 concept 用 tone 的语气');
  });

  it('leaves a body with no placeholders untouched', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>把这篇论文讲清楚</p>';
    const before = root.innerHTML;
    highlightTemplateVariables(root);
    expect(root.innerHTML).toBe(before);
  });

  it('does not reinterpret the markup around the text', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><strong>标题</strong> {{concept}}</p>';
    highlightTemplateVariables(root);
    expect(root.querySelector('strong')?.textContent).toBe('标题');
    expect(root.querySelectorAll('.gv-pm-var').length).toBe(1);
  });
});
