// Dependency-free on purpose so it runs in the plain-Node unit tests.
/** The same limit the server enforces. Checking here avoids sending a file that will be rejected. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_LABEL = '10 MB';

export const isTooLarge = (bytes: number) => bytes > MAX_FILE_BYTES;

/** Rounded up, so a file just over the limit never reads as «10,0 MB». */
const megabytes = (bytes: number) => (Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toFixed(1).replace('.', ',');

export const tooLargeMessage = (bytes: number) => `Pesa ${megabytes(bytes)} MB y el máximo es ${MAX_FILE_LABEL}. Redúzcalo o divídalo.`;
