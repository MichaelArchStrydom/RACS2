// Thrown when two people try to act on the same request at once and this
// caller lost the race. Callers should catch this specifically (by message)
// and show a "someone beat you to it" message rather than a generic error.
export const ALREADY_ACTIONED = 'ALREADY_ACTIONED'
