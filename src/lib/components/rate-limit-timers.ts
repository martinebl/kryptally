import type { SourceState } from '$lib/types';

/** Countdown timers backing each source's `rateLimitSeconds`, keyed by exchange name. */
export const createRateLimitTimers = (states: Record<string, SourceState>) => {
  const timers: Record<string, ReturnType<typeof setInterval>> = {};

  const stop = (name: string) => {
    if (timers[name]) {
      clearInterval(timers[name]);
      delete timers[name];
    }
    states[name].rateLimitSeconds = 0;
  };

  const start = (name: string, waitMs: number) => {
    stop(name);
    states[name].rateLimitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
    timers[name] = setInterval(() => {
      states[name].rateLimitSeconds -= 1;
      if (states[name].rateLimitSeconds <= 0) stop(name);
    }, 1000);
  };

  return { start, stop };
};
