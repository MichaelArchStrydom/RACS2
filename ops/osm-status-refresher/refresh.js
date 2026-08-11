// Runs periodically on the Pi (via systemd timer) to keep
// Member.osmStatusColor / osmOverdueCount / osmDueSoonCount fresh

const { Client } = require('pg')
const cheerio = require('cheerio')

const DATABASE_URL = process.env.DATABASE_URL
const BU = '{1B421B9F-6A82-4C06-8828-EEE7A2EC7694}'
const REQUEST_DELAY_MS = 1500 // stay polite to DashboardLive between requests

if (!DATABASE_URL) {
  console.error('DATABASE_URL env var not set')
  process.exit(1)
}

function classifySkillColor(bg) {
  const c = (bg || '').trim().toLowerCase().replace(/\s/g, '')
  if (c === '#7c0303') return 'overdue'
  if (c === '#ff6600') return 'dueSoon'
  if (c === '#008000') return 'current'
  if (c === 'grey' || c === 'gray') return 'na'
  return 'other'
}

async function fetchMemberSkillStatuses(osmId) {
  const url = `https://www.dashboardlive.nz/osmindividual.php?id=${encodeURIComponent(osmId)}&bu=${encodeURIComponent(BU)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (RACS2 OSM status refresher)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`DashboardLive returned ${res.status} ${res.statusText}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const statuses = []
  $('table tr').slice(1).each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 3) return
    const skillName = $(tds[1]).text().trim()
    if (!skillName) return
    const bg = $(tds[0]).attr('style')?.match(/background-color:\s*([^;'"]*)/)?.[1]
    statuses.push(classifySkillColor(bg))
  })
  return statuses
}

function aggregate(statuses) {
  const overdueCount = statuses.filter((s) => s === 'overdue').length
  const dueSoonCount = statuses.filter((s) => s === 'dueSoon').length
  const color = overdueCount > 0 ? 'red' : dueSoonCount > 0 ? 'yellow' : 'green'
  return { color, overdueCount, dueSoonCount }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  const { rows: members } = await client.query(
    'SELECT id, "firstName", "lastName", "osmId" FROM "Member" WHERE "osmId" IS NOT NULL'
  )
  console.log(`refreshing ${members.length} linked members`)

  let okCount = 0
  let failCount = 0

  for (const member of members) {
    try {
      const statuses = await fetchMemberSkillStatuses(member.osmId)
      const { color, overdueCount, dueSoonCount } = aggregate(statuses)
      await client.query(
        'UPDATE "Member" SET "osmStatusColor" = $1, "osmOverdueCount" = $2, "osmDueSoonCount" = $3, "osmStatusCheckedAt" = now() WHERE id = $4',
        [color, overdueCount, dueSoonCount, member.id]
      )
      okCount++
    } catch (e) {
      failCount++
      console.error(`failed for ${member.firstName} ${member.lastName} (${member.osmId}):`, e.message)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  console.log(`done: ${okCount} refreshed, ${failCount} failed`)
  await client.end()
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
