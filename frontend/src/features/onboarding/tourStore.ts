/** Remembers whether the intro was seen and lets any screen reopen it. UI preference only. */
const SEEN_KEY = 'cotizai.tour.seen';
type Listener = () => void;
const listeners = new Set<Listener>();

export const hasSeenTour = () => {
  try {
    return typeof window === 'undefined' || window.localStorage?.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked: do not show it on every visit
  }
};

export const markTourSeen = () => {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* nothing to remember */
  }
};

export const openTour = () => listeners.forEach((l) => l());
export const onOpenTour = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
