
export interface TimelineSegment {
  id: string
  start: Date
  end: Date
}

export interface InsertionPlan {
  newSegment: { start: Date; end: Date }
  resized: { id: string; start: Date; end: Date }[]
  removed: string[]
}

function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function largestOf(list: TimelineSegment[]): TimelineSegment {
  return list.reduce((a, b) => (minutesBetween(b.start, b.end) > minutesBetween(a.start, a.end) ? b : a))
}

export function planInsertion(
  segments: TimelineSegment[],
  boundsStart: Date,
  boundsEnd: Date,
  desiredMinutes: number,
  dropInstant?: Date
): InsertionPlan {
  const sorted = [...segments].sort((a, b) => a.start.getTime() - b.start.getTime())

  const gaps: { start: Date; end: Date }[] = []
  let cursor = boundsStart
  for (const seg of sorted) {
    if (seg.start.getTime() > cursor.getTime()) gaps.push({ start: cursor, end: seg.start })
    if (seg.end.getTime() > cursor.getTime()) cursor = seg.end
  }
  if (boundsEnd.getTime() > cursor.getTime()) gaps.push({ start: cursor, end: boundsEnd })

  const gapUnderDrop = dropInstant
    ? gaps.find(g => dropInstant.getTime() >= g.start.getTime() && dropInstant.getTime() < g.end.getTime())
    : undefined
  const chosenGap = gapUnderDrop ?? gaps[0]

  if (chosenGap) {
    const available = minutesBetween(chosenGap.start, chosenGap.end)
    const useMinutes = Math.min(desiredMinutes, available)
    const start = dropInstant && dropInstant.getTime() >= chosenGap.start.getTime()
      ? new Date(Math.min(dropInstant.getTime(), addMinutes(chosenGap.end, -useMinutes).getTime()))
      : chosenGap.start
    return { newSegment: { start, end: addMinutes(start, useMinutes) }, resized: [], removed: [] }
  }

  const target = dropInstant
    ? sorted.find(s => dropInstant.getTime() >= s.start.getTime() && dropInstant.getTime() < s.end.getTime()) ?? largestOf(sorted)
    : largestOf(sorted)

  if (!target) {
    return { newSegment: { start: boundsStart, end: addMinutes(boundsStart, desiredMinutes) }, resized: [], removed: [] }
  }

  return biteFrom(target, sorted, desiredMinutes, dropInstant)
}

function biteFrom(
  target: TimelineSegment,
  allSorted: TimelineSegment[],
  desiredMinutes: number,
  anchor?: Date
): InsertionPlan {
  const duration = minutesBetween(target.start, target.end)
  const biteFromStart = anchor
    ? Math.abs(anchor.getTime() - target.start.getTime()) <= Math.abs(anchor.getTime() - target.end.getTime())
    : true

  if (duration > desiredMinutes) {
    if (biteFromStart) {
      const newSegStart = target.start
      const newSegEnd = addMinutes(target.start, desiredMinutes)
      return {
        newSegment: { start: newSegStart, end: newSegEnd },
        resized: [{ id: target.id, start: newSegEnd, end: target.end }],
        removed: [],
      }
    }
    const newSegStart = addMinutes(target.end, -desiredMinutes)
    return {
      newSegment: { start: newSegStart, end: target.end },
      resized: [{ id: target.id, start: target.start, end: newSegStart }],
      removed: [],
    }
  }

  if (duration === desiredMinutes) {
    return { newSegment: { start: target.start, end: target.end }, resized: [], removed: [target.id] }
  }

  const remaining = allSorted.filter(s => s.id !== target.id)
  if (remaining.length === 0) {
    return { newSegment: { start: target.start, end: target.end }, resized: [], removed: [target.id] }
  }

  const largest = largestOf(remaining)
  const largestDuration = minutesBetween(largest.start, largest.end)

  if (largestDuration <= desiredMinutes) {
    return { newSegment: { start: largest.start, end: largest.end }, resized: [], removed: [target.id, largest.id] }
  }

  const largestBiteFromStart = anchor
    ? Math.abs(anchor.getTime() - largest.start.getTime()) <= Math.abs(anchor.getTime() - largest.end.getTime())
    : true
  const newSegment = largestBiteFromStart
    ? { start: largest.start, end: addMinutes(largest.start, desiredMinutes) }
    : { start: addMinutes(largest.end, -desiredMinutes), end: largest.end }
  const resizedLargest = largestBiteFromStart
    ? { id: largest.id, start: newSegment.end, end: largest.end }
    : { id: largest.id, start: largest.start, end: newSegment.start }

  return { newSegment, resized: [resizedLargest], removed: [target.id] }
}
