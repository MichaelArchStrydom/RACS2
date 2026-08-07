// Rounds an hours value down to the nearest 0.5h for display only
export function roundHoursForDisplay(hours: number): number {
  return Math.floor(hours * 2) / 2
}
