/** The loading screen is shown on the first visit of each day only. UI preference, never data. */
const KEY = 'cotizai.splash.day';
const today = () => new Date().toLocaleDateString('en-CA'); // local day as YYYY-MM-DD

export const isSplashDue = () => {
  try {
    return typeof window === 'undefined' || window.localStorage?.getItem(KEY) !== today();
  } catch {
    return false; // storage blocked: skip it instead of repeating it on every load
  }
};

export const markSplashShown = () => {
  try {
    window.localStorage.setItem(KEY, today());
  } catch {
    /* nothing to remember */
  }
};
