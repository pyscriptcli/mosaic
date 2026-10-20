type FrameScheduler = ((callback: () => void) => void) & { cancel: () => void };

export function createFrameScheduler(requestFrame: (callback: FrameRequestCallback) => number): FrameScheduler {
  let frame: number | null = null;
  let pending: (() => void) | null = null;

  const schedule = ((callback: () => void) => {
    pending = callback;
    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      const current = pending;
      pending = null;
      current?.();
    });
  }) as FrameScheduler;

  schedule.cancel = () => {
    pending = null;
  };

  return schedule;
}
