import { $, listen, setInteractive } from '../utils/dom.js';

export function createContextPanel({ onOpenNote, onClose }) {
  const panel = $('#contextPanel'); const closeButton = $('#contextClose'); const openButton = $('#openSelectedNote');
  const cleanups = []; let current = null;
  const close = ({ notify = true } = {}) => {
    const wasOpen = !panel.hidden;
    current = null; setInteractive(panel, false); document.querySelector('#nexusShell').dataset.contextState = 'closed';
    if (wasOpen && notify) onClose?.();
  };
  const open = (node, connections = 0) => {
    current = node; $('#contextTitle').textContent = node.label; $('#contextCategory').textContent = node.category; $('#contextDescription').textContent = node.description;
    $('#contextConnections').innerHTML = `<dt>Connections</dt><dd>${connections}</dd><dt>Status</dt><dd>${node.available === false ? 'Not available' : 'Available'}</dd>`;
    openButton.hidden = !node.path; setInteractive(panel, true); document.querySelector('#nexusShell').dataset.contextState = 'open';
  };
  listen(closeButton, 'click', close, undefined, cleanups);
  listen(openButton, 'click', () => { if (current?.path) onOpenNote(current.path); }, undefined, cleanups);
  return { open, close, isOpen: () => !panel.hidden, destroy: () => cleanups.forEach((cleanup) => cleanup()) };
}
