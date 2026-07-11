export interface CalendarAssignment {
  applianceRole: string
  memberName: string
}

export interface CalendarSlot {
  id: string
  appliance: string
  status: string // LIVE | CANCELLED | DRAFT
  watchName: string | null // null = mixed crews, or no assignments yet
  assignments: CalendarAssignment[]
}

export type MonthSlotsByDate = Record<string, CalendarSlot[]>

export interface CrewOption {
  id: string
  watchName: string
}

export interface ApplianceOption {
  name: string
}
