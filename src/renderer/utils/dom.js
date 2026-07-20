export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function listen(target, type, handler, options, cleanups) {
  target.addEventListener(type, handler, options);
  cleanups?.push(() => target.removeEventListener(type, handler, options));
  return handler;
}

export function setInteractive(element, enabled) {
  element.hidden = !enabled;
  element.inert = !enabled;
}

export function isTextInput(element = document.activeElement) {
  return Boolean(element?.matches('input, textarea, select, [contenteditable="true"]'));
}
