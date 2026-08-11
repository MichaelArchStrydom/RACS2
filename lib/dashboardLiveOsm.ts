import * as cheerio from 'cheerio'

// DashboardLive is a third-party vendor system (dashboardlive.nz) this brigade
// also uses, separate from racs2. This is a live mirror, not an import it
// fetches and reparses their page fresh on every request. nothing from it is
// stored in racs2 own database. If DashboardLive changes their HTML, this breaks
// DashboardLive's host does not answer connections from Vercel's datacenter
// offloaded to raspberry pi at home

const BU = '{1B421B9F-6A82-4C06-8828-EEE7A2EC7694}'
const DIRECT_MUSTER_URL = `https://www.dashboardlive.nz/musters.php?bu=${encodeURIComponent(BU)}`
const OSM_PROXY_URL = process.env.OSM_PROXY_URL
const OSM_PROXY_SECRET = process.env.OSM_PROXY_SECRET

export interface MemberMusterRow {
  osmId: string | null
  osmProfileUrl: string | null
  rank: string
  name: string
  mustersAttended: number
  brigadeMusters: number
  mustersPercent: number
  mustersFlagged: boolean // red: under 50% musters
  oic: number
  driver: number
  crew: number
  ownTransport: number
  incidentsTotal: number
  appliancePercent: number
  atStation: number
  attendancePercent: number
  incidentsFlagged: boolean // red: under 10% incidents
  leaveDays: number
  absentDays: number
  grandTotal: number
  onLeave: boolean // blue: currently on leave
}

export interface MusterPageData {
  asOfLabel: string | null
  rows: MemberMusterRow[]
}

function cellNumber(text: string): number {
  const cleaned = text.replace('%', '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function isRed(bg: string | undefined): boolean {
  return !!bg && bg.trim().toLowerCase().startsWith('red')
}

function isBlue(bg: string | undefined): boolean {
  return !!bg && bg.trim().toLowerCase().replace(/\s/g, '') === '#0000cc'
}

function splitRankAndName(fullText: string): { rank: string; name: string } {
  const trimmed = fullText.trim()
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return { rank: '', name: trimmed }
  return { rank: trimmed.slice(0, spaceIndex), name: trimmed.slice(spaceIndex + 1).trim() }
}

const FETCH_TIMEOUT_MS = 20000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchDashboardLiveHtml(directUrl: string, proxyPath: string): Promise<string> {
  const useProxy = !!OSM_PROXY_URL
  if (useProxy && !OSM_PROXY_SECRET) throw new Error('OSM_PROXY_SECRET is not configured')

  const url = useProxy ? `${OSM_PROXY_URL}${proxyPath}` : directUrl
  const headers: Record<string, string> = useProxy
    ? { 'X-Osm-Proxy-Secret': OSM_PROXY_SECRET! }
    : { 'User-Agent': 'Mozilla/5.0 (RACS2 OSM mirror)' }

  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`DashboardLive returned ${res.status} ${res.statusText}`)
      return await res.text()
    } catch (e: any) {
      lastErr = e
      if (e?.cause?.code !== 'ENOTFOUND' || attempt === 3) throw e
      await sleep(attempt * 500)
    }
  }
  throw lastErr
}

export async function fetchMusterData(): Promise<MusterPageData> {
  const html = await fetchDashboardLiveHtml(DIRECT_MUSTER_URL, '/musters')
  const $ = cheerio.load(html)

  const dateLikeText = /^[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}$/
  let asOfLabel: string | null = null
  $('div').each((_, el) => {
    const text = $(el).text().trim()
    if (dateLikeText.test(text)) asOfLabel = text
  })

  const rows: MemberMusterRow[] = []

  // Skip the first 2 <tr>s — they're the grouped/detail header rows, not data.
  $('table tr').slice(2).each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 16) return // malformed/short row — skip rather than crash

    const cell = (i: number) => $(tds[i])
    const text = (i: number) => cell(i).text().trim()
    const bg = (i: number) => cell(i).attr('style')?.match(/background-color:\s*([^;'"]*)/)?.[1]

    const link = cell(0).find('a')
    const osmProfileUrl = link.attr('href')
      ? `https://www.dashboardlive.nz/${link.attr('href')}`
      : null
    const osmIdMatch = link.attr('href')?.match(/id=(\{[^&]+\})/)
    const { rank, name } = splitRankAndName(link.text() || text(0))

    rows.push({
      osmId: osmIdMatch ? decodeURIComponent(osmIdMatch[1]) : null,
      osmProfileUrl,
      rank,
      name,
      mustersAttended: cellNumber(text(1)),
      brigadeMusters: cellNumber(text(2)),
      mustersPercent: cellNumber(text(3)),
      mustersFlagged: isRed(bg(1)) || isRed(bg(2)) || isRed(bg(3)),
      // index 4 is the "|" separator column
      oic: cellNumber(text(5)),
      driver: cellNumber(text(6)),
      crew: cellNumber(text(7)),
      ownTransport: cellNumber(text(8)),
      incidentsTotal: cellNumber(text(9)),
      appliancePercent: cellNumber(text(10)),
      atStation: cellNumber(text(11)),
      attendancePercent: cellNumber(text(12)),
      incidentsFlagged: isRed(bg(5)) || isRed(bg(9)) || isRed(bg(12)),
      leaveDays: cellNumber(text(13)),
      absentDays: cellNumber(text(14)),
      grandTotal: cellNumber(text(15)),
      onLeave: isBlue(bg(13)) || isBlue(bg(1)),
    })
  })

  return { asOfLabel, rows }
}

export type OsmSkillStatus = 'overdue' | 'dueSoon' | 'current' | 'na' | 'other'

export interface OsmSkill {
  skillType: string
  skillName: string
  dueDate: string
  status: OsmSkillStatus
}

export interface OsmAggregateStatus {
  color: 'red' | 'yellow' | 'green'
  overdueCount: number
  dueSoonCount: number
  skills: OsmSkill[]
}

function classifySkillColor(bg: string | undefined): OsmSkillStatus {
  const c = bg?.trim().toLowerCase().replace(/\s/g, '') ?? ''
  if (c === '#7c0303') return 'overdue'
  if (c === '#ff6600') return 'dueSoon'
  if (c === '#008000') return 'current'
  if (c === 'grey' || c === 'gray') return 'na'
  return 'other'
}

export async function fetchMemberOsmSkills(osmId: string): Promise<OsmSkill[]> {
  const directUrl = `https://www.dashboardlive.nz/osmindividual.php?id=${encodeURIComponent(osmId)}&bu=${encodeURIComponent(BU)}`
  const html = await fetchDashboardLiveHtml(directUrl, `/individual?id=${encodeURIComponent(osmId)}`)
  const $ = cheerio.load(html)

  const skills: OsmSkill[] = []
  $('table tr').slice(1).each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 3) return

    const skillType = $(tds[0]).text().trim()
    const skillName = $(tds[1]).text().trim()
    const dueDate = $(tds[2]).text().trim()
    if (!skillName) return

    const bg = $(tds[0]).attr('style')?.match(/background-color:\s*([^;'"]*)/)?.[1]
    skills.push({ skillType, skillName, dueDate, status: classifySkillColor(bg) })
  })

  return skills
}

export function computeOsmAggregateStatus(skills: OsmSkill[]): OsmAggregateStatus {
  const overdueCount = skills.filter((s) => s.status === 'overdue').length
  const dueSoonCount = skills.filter((s) => s.status === 'dueSoon').length
  const color = overdueCount > 0 ? 'red' : dueSoonCount > 0 ? 'yellow' : 'green'
  return { color, overdueCount, dueSoonCount, skills }
}

export function matchMemberToOsm(
  member: { firstName: string; lastName: string; rank: string },
  osmRows: MemberMusterRow[]
): MemberMusterRow | null {
  const targetLast = member.lastName.trim().toLowerCase()
  const targetInitial = member.firstName.trim().charAt(0).toLowerCase()
  const targetRank = member.rank.trim().toLowerCase()

  const matchesInitial = (row: MemberMusterRow) => {
    const givenNames = row.name.split(',')[1]?.trim().toLowerCase() ?? ''
    return givenNames.startsWith(targetInitial)
  }

  const sameSurname = osmRows.filter((row) => {
    const [osmLast] = row.name.split(',')
    return osmLast?.trim().toLowerCase() === targetLast
  })

  if (sameSurname.length === 0) return null
  if (sameSurname.length === 1) return matchesInitial(sameSurname[0]) ? sameSurname[0] : null

  const byInitial = sameSurname.filter(matchesInitial)
  if (byInitial.length === 0) return null
  if (byInitial.length === 1) return byInitial[0]

  const byRank = byInitial.filter((row) => row.rank.trim().toLowerCase() === targetRank)
  if (byRank.length === 1) return byRank[0]

  return null
}
