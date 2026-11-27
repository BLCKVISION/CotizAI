/**
 * Tells whether the person is navigating with the keyboard. A dialog gives focus back to the card that opened it;
 * after a click that must not leave the card looking selected, while keyboard users still see where they are.
 */
let usingKeyboard = false;

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) usingKeyboard = true;
  }, true);
  document.addEventListener('pointerdown', () => {
    usingKeyboard = false;
  }, true);
}

export const isKeyboardFocus = (focused: boolean | undefined) => Boolean(focused) && usingKeyboard;
