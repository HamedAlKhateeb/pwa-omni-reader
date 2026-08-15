export function nextReaderControlsHidden(previousTop: number, currentTop: number, wasHidden: boolean) {
  if (currentTop <= 20) return false;
  const delta = currentTop - previousTop;
  if (delta >= 12) return true;
  if (delta <= -12) return false;
  return wasHidden;
}
