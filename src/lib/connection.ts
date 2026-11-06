// Whether the server can be reached, as far as one answer tells. Pure, so the rule can be tested.

/** A proxy in front of a stopped server answers 502, 503 or 504: the server is not there, however fast the answer came. */
const GATEWAY_ERRORS = [502, 503, 504];

/** Any other answer, even an error of the app itself (500) or a refusal (401, 409), means the server was reached. */
export const reachedServer = (status: number): boolean => !GATEWAY_ERRORS.includes(status);

/** Seconds between the health checks while the server cannot be reached; the first answer that arrives ends it. */
export const RECHECK_MS = 10_000;
