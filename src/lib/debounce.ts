export type TimerRef = { current: ReturnType<typeof setTimeout> | null };

export function scheduleDebouncedTask(timerRef: TimerRef, callback: () => void, delay: number): void {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(callback, delay);
}

export function cancelDebouncedTask(timerRef: TimerRef): void {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = null;
}
