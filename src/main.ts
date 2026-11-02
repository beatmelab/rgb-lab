import { initializeUI } from './ui';
import { initializeInformationDialogs } from './about';

const cleanup = initializeUI();
const cleanupDialogs = initializeInformationDialogs();
// Reveal the complete layout only after local fonts and the initial Canvas frame.
void document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    document.querySelector('.app')?.setAttribute('data-ready', '');
  });
});

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) { cleanupDialogs(); cleanup(); }
});
