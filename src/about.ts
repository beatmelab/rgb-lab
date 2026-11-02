import { drawDiagramHelp } from './fixture/diagram-help.ts';

export function initializeInformationDialogs(): () => void {
  const events = new AbortController();
  const { signal } = events;
  const dialogs: HTMLDialogElement[] = [];

  for (const [buttonId, dialogId] of [['open-about','about-dialog'],['open-diagram-help','diagram-help-dialog'],['open-engine-help','engine-help-dialog']]) {
    const button = document.querySelector<HTMLButtonElement>(`#${buttonId}`);
    const dialog = document.querySelector<HTMLDialogElement>(`#${dialogId}`);
    if (!button || !dialog) throw new Error(`Information dialog elements not found: ${dialogId}.`);
    dialogs.push(dialog);
    let illustrated = false;
    const closeWithAnimation = async (): Promise<void> => {
      if (!dialog.open || dialog.hasAttribute('data-closing')) return;
      dialog.setAttribute('data-closing', '');
      // Keep the native dialog and its backdrop in the top layer until both fade out.
      await Promise.allSettled(dialog.getAnimations().map(animation => animation.finished));
      if (!signal.aborted && dialog.open) dialog.close();
      dialog.removeAttribute('data-closing');
    };
    button.addEventListener('click', () => {
      if (dialogId === 'diagram-help-dialog' && !illustrated) {
        drawDiagramHelp(dialog.querySelector<HTMLCanvasElement>('#diagram-help-image')!);
        illustrated = true;
      }
      dialog.showModal();
    }, { signal });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      void closeWithAnimation();
    }, { signal });
    dialog.addEventListener('submit', event => {
      if (!(event.target instanceof HTMLFormElement) || event.target.method !== 'dialog') return;
      event.preventDefault();
      void closeWithAnimation();
    }, { signal });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) void closeWithAnimation();
    }, { signal });
  }

  return () => { events.abort(); for (const dialog of dialogs) { dialog.close(); dialog.removeAttribute('data-closing'); } };
}
