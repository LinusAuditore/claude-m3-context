import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Usage } from '../types'

const usage = atom({ plugin: 'm3-context', key: 'usage' } as const, null)
const limits = atom({ plugin: 'm3-context', key: 'limits' } as const, [])

type Tone = 'primary' | 'tertiary' | 'error'

// Where a meter changes its color role: calm, getting full, nearly out.
const WARN_AT = 60
const ALERT_AT = 85
const COMPACT_AT = 80

const toneOf = (percent: number | undefined): Tone =>
  percent === undefined || percent < WARN_AT
    ? 'primary'
    : percent < ALERT_AT
      ? 'tertiary'
      : 'error'

const formatTokens = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
      : `${n}`

const figure = (u: Usage): string =>
  u.tokens === undefined
    ? `— / ${formatTokens(u.window)}`
    : `${formatTokens(u.tokens)} / ${formatTokens(u.window)}`

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'Spend',
}

const limitName = (kind: string): string => LIMIT_NAMES[kind] ?? kind.slice(0, 4)

// M3 baseline tonal roles: accent, container, on-container; light then dark.
const PALETTE = {
  light: {
    surface: '#ECE6F0',
    on: '#1D1B20',
    onVariant: '#49454F',
    track: '#E8DEF8',
    primary: ['#6750A4', '#EADDFF', '#4F378B'],
    tertiary: ['#7D5260', '#FFD8E4', '#633B48'],
    error: ['#B3261E', '#F9DEDC', '#8C1D18'],
  },
  dark: {
    surface: '#2B2930',
    on: '#E6E0E9',
    onVariant: '#CAC4D0',
    track: '#4A4458',
    primary: ['#D0BCFF', '#4F378B', '#EADDFF'],
    tertiary: ['#EFB8C8', '#633B48', '#FFD8E4'],
    error: ['#F2B8B5', '#8C1D18', '#F9DEDC'],
  },
} as const

const TONES: readonly Tone[] = ['primary', 'tertiary', 'error']

const vars = (scheme: 'light' | 'dark'): string => {
  const p = PALETTE[scheme]
  const roles = TONES.flatMap(tone => {
    const [accent, container, onContainer] = p[tone]

    return [`--${tone}:${accent}`, `--${tone}-c:${container}`, `--${tone}-on-c:${onContainer}`]
  })

  return [
    `--surface:${p.surface}`,
    `--on:${p.on}`,
    `--on-variant:${p.onVariant}`,
    `--track:${p.track}`,
    ...roles,
  ].join(';')
}

const toneRules = TONES.map(
  tone =>
    `.tone-${tone} { --accent: var(--${tone}); --container: var(--${tone}-c); --on-container: var(--${tone}-on-c); }`,
).join('\n')

// Layout, in CSS pixels.
const H = 72
const BADGE_X = 40
const MID_Y = 36
const X0 = 84
const PAD_R = 28
const TRACK_Y = 49
const WAVE = 24
const AMP = 3
const GAP = 8
const RING_R = 11
const RING_ITEM = 76
const MIN_W = 420
const MAX_W = 3200

// On desktop `bodyColumns` is the slot's width over the code font's advance:
// this is that advance, so columns times it is the slot in pixels.
const ADVANCE = 8.4
const BUTTON_ROOM = 132

// Every shape is one closed polygon of the same number of points around the
// badge's centre, so CSS can morph `d` from any shape to any other.
const POINTS = 72
const R = 23

const shape = (radius: (t: number) => number): string => {
  const points: string[] = []

  for (let i = 0; i < POINTS; i += 1) {
    const t = (i / POINTS) * Math.PI * 2
    const r = radius(t)
    points.push(`${(BADGE_X + r * Math.cos(t)).toFixed(2)} ${(MID_Y + r * Math.sin(t)).toFixed(2)}`)
  }

  return `M ${points.join(' L ')} Z`
}

const lobed = (lobes: number, depth: number, phase = 0) => (t: number) =>
  R + depth * Math.cos(lobes * (t + phase))
const oval = (a: number, b: number) => (t: number) =>
  (a * b) / Math.sqrt((b * Math.cos(t)) ** 2 + (a * Math.sin(t)) ** 2)

// The resting badge: the M3 Expressive 9-sided cookie.
const COOKIE = shape(lobed(9, 1.7))

// The loading indicator's cycle, after M3 Expressive's: soft burst, cookie,
// pentagon, pill, sunny, four-sided cookie, oval, and back.
const MORPHS = [
  shape(lobed(10, 2.8)),
  shape(lobed(9, 1.7)),
  shape(lobed(5, 2.2, Math.PI / 10)),
  shape(oval(R + 2, R - 7)),
  shape(lobed(8, 2.6, Math.PI / 8)),
  shape(lobed(4, 3.4, Math.PI / 4)),
  shape(oval(R - 1, R - 4)),
]

const MORPH_KEYFRAMES = (() => {
  const steps = [...MORPHS, MORPHS[0]]
  const frames = steps.map((d, i) => {
    const at = ((i / (steps.length - 1)) * 100).toFixed(2)

    return `${at}% { d: path('${d}'); animation-timing-function: cubic-bezier(0.42, 1.67, 0.21, 0.9); }`
  })

  return `@keyframes morph { ${frames.join(' ')} }`
})()

const ring = (limit: Limit, x: number): string => {
  const p = Math.min(1, Math.max(0, limit.percentUsed / 100))
  const c = 2 * Math.PI * RING_R
  const cx = x + RING_R + 2
  const arc =
    p > 0.005
      ? `<circle class="arc" cx="${cx}" cy="${MID_Y}" r="${RING_R}" stroke-dasharray="${(c * p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${cx} ${MID_Y})"/>`
      : ''

  return `<g class="tone-${toneOf(limit.percentUsed)}">
<circle class="ring" cx="${cx}" cy="${MID_Y}" r="${RING_R}"/>${arc}
<text x="${cx + RING_R + 8}" y="${MID_Y - 3}" class="rk">${limitName(limit.kind)}</text>
<text x="${cx + RING_R + 8}" y="${MID_Y + 12}" class="rv">${Math.round(limit.percentUsed)}%</text>
</g>`
}

const scene = (u: Usage, shown: readonly Limit[], isWorking: boolean, W: number): string => {
  const tone = toneOf(u.percent)
  const ringsRoom = shown.length > 0 ? shown.length * RING_ITEM + 8 : 0
  const XT = W - PAD_R - ringsRoom
  const trackW = XT - X0
  const fraction = Math.min(1, Math.max(0, (u.percent ?? 0) / 100))
  const end = X0 + trackW * fraction
  const hasActive = u.percent !== undefined && end > X0 + 2

  // A long wave, always drifting by one wavelength (faster while a turn runs);
  // the clip keeps its visible part between the track's start and the fill's end.
  const waveStart = X0 - WAVE * 2
  const segments = Math.ceil((end - waveStart + WAVE * 2) / (WAVE / 2))
  const wave =
    `M ${waveStart} ${TRACK_Y} q ${WAVE / 4} ${-AMP} ${WAVE / 2} 0` +
    ' t ' +
    Array.from({ length: segments }, () => `${WAVE / 2} 0`).join(' t ')

  const restStart = hasActive ? end + GAP : X0
  const hasRest = restStart < XT - 2

  const compactFraction = u.compactAt === undefined ? undefined : u.compactAt / u.window
  const compactX =
    compactFraction !== undefined && compactFraction > 0 && compactFraction < 1
      ? X0 + trackW * compactFraction
      : undefined

  const badge =
    u.percent === undefined
      ? `<text x="${BADGE_X}" y="${MID_Y + 6}" text-anchor="middle" class="num">–</text>`
      : `<text x="${BADGE_X}" y="${MID_Y + 6}" text-anchor="middle" class="num">${Math.round(u.percent)}<tspan class="pct">%</tspan></text>`

  const status =
    u.percent === undefined
      ? 'Waiting for first reply'
      : tone === 'error'
        ? 'Context almost full'
        : tone === 'tertiary'
          ? 'Context filling up'
          : 'Context'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet">
<style>
svg { ${vars('light')}; font-family: 'Google Sans Flex', 'Google Sans', 'Roboto Flex', Roboto, system-ui, sans-serif; }
@media (prefers-color-scheme: dark) { svg { ${vars('dark')}; } }
${toneRules}
.card { fill: var(--surface); }
.spin { transform-box: view-box; transform-origin: ${BADGE_X}px ${MID_Y}px; animation: spin 18s linear infinite; }
.badge { fill: var(--container); }
.busy .spin { animation-duration: 2.8s; }
.busy .badge { animation: morph 4.9s infinite; }
.num { fill: var(--on-container); font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
.pct { font-size: 11px; font-weight: 600; }
.label { fill: var(--on-variant); font-size: 12px; font-weight: 500; letter-spacing: 0.4px; }
.fig { fill: var(--on); font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; }
.wave { fill: none; stroke: var(--accent); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; animation: flow 6s linear infinite; }
.busy .wave { animation-duration: 1.1s; }
.rest { stroke: var(--track); stroke-width: 4; stroke-linecap: round; }
.stop { fill: var(--accent); }
.tick { fill: var(--on-variant); opacity: 0.7; }
.tick-label { fill: var(--on-variant); font-size: 10px; font-weight: 500; opacity: 0.85; }
.ring { fill: none; stroke: var(--track); stroke-width: 4; }
.arc { fill: none; stroke: var(--accent); stroke-width: 4; stroke-linecap: round; }
.rk { fill: var(--on-variant); font-size: 11px; font-weight: 500; }
.rv { fill: var(--on); font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes flow { to { transform: translateX(${WAVE}px); } }
${MORPH_KEYFRAMES}
@media (prefers-reduced-motion: reduce) { .spin, .badge, .wave { animation: none; } }
</style>
<defs><clipPath id="fill"><rect x="${X0 - 2}" y="${TRACK_Y - 6}" width="${Math.max(0, end - X0 + 4).toFixed(1)}" height="12" rx="6"/></clipPath></defs>
<g class="tone-${tone}${isWorking ? ' busy' : ''}">
<rect class="card" x="0" y="4" width="${W}" height="${H - 8}" rx="${(H - 8) / 2}"/>
<g class="spin"><path class="badge" d="${COOKIE}"/></g>
${badge}
<text x="${X0}" y="30" class="label">${status}</text>
<text x="${XT}" y="30" text-anchor="end" class="fig">${figure(u)}</text>
${hasActive ? `<g clip-path="url(#fill)"><path class="wave" d="${wave}"/></g>` : ''}
${hasRest ? `<line class="rest" x1="${restStart.toFixed(1)}" y1="${TRACK_Y}" x2="${XT}" y2="${TRACK_Y}"/>` : ''}
${fraction < 0.97 ? `<circle class="stop" cx="${XT}" cy="${TRACK_Y}" r="2"/>` : ''}
${compactX === undefined ? '' : `<rect class="tick" x="${(compactX - 1.5).toFixed(1)}" y="${TRACK_Y - 8}" width="3" height="16" rx="1.5"/><text x="${compactX.toFixed(1)}" y="${H - 7}" text-anchor="middle" class="tick-label">Auto-compact</text>`}
</g>
${shown.map((l, i) => ring(l, XT + 24 + i * RING_ITEM)).join('\n')}
</svg>`
}

const TERMINAL_COLOR: Record<Tone, string> = {
  primary: '#D0BCFF',
  tertiary: '#EFB8C8',
  error: '#F2B8B5',
}

const fromContext = (
  context: { tokens?: number; window: number; percent?: number },
  before: Usage | null,
): Usage => ({
  tokens: context.tokens,
  window: context.window,
  percent: context.percent,
  // The threshold belongs to the window it was measured for.
  compactAt: before?.window === context.window ? before.compactAt : undefined,
})

const toLimits = (list: readonly Limit[]): Limit[] =>
  list.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))

async function refresh($: EngineInterface): Promise<void> {
  const now = await $.session.usage()
  await update($, usage, before => fromContext(now.context, before))
  await update($, limits, () => toLimits(now.rateLimits))
}

// The auto-compact threshold, from the local (free) estimate of /context.
async function loadCompactAt($: EngineInterface): Promise<void> {
  const now = await $.session.usage({ breakdown: 'summary' })
  const breakdown = now.context.breakdown
  const compactAt =
    breakdown?.isAutoCompactEnabled === true ? breakdown.autoCompactThreshold : undefined

  await update($, usage, before => ({
    ...fromContext(now.context, before),
    compactAt,
  }))
}

// The window the threshold was last read for; read again when it changes.
let compactWindow: number | undefined

async function ensureCompactAt($: EngineInterface, window: number): Promise<void> {
  if (compactWindow === window) {
    return
  }

  compactWindow = window
  await loadCompactAt($).catch(() => {
    compactWindow = undefined
  })
}

export const register: Register = on => {
  compactWindow = undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => undefined)
    const u = await read($, usage)

    if (u !== null) {
      await ensureCompactAt($, u.window)
    }

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, usage, before => fromContext(e.context, before))
      await ensureCompactAt($, e.context.window)
    }

    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => toLimits(e.rateLimits))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)

    if (e.props.hasSurvey || u === null) {
      return next(e)
    }

    const shown = (await read($, limits)).slice(0, 3)
    const ui = $.ui.resolve(e)
    const tone = toneOf(u.percent)
    const canCompact = (u.percent ?? 0) >= COMPACT_AT && !e.props.isWorking
    const compact = (Button: (typeof ui)['Button']) =>
      canCompact ? (
        <Button
          key="compact"
          label="Compact now"
          variant={tone === 'error' ? 'primary' : 'secondary'}
          onPress={async () => {
            await $.session.compact()
          }}
        />
      ) : null

    if (e.surface === 'terminal') {
      const { Box, Progress, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold color={TERMINAL_COLOR[tone]}>
            {u.percent === undefined ? '–' : `${Math.round(u.percent)}%`}
          </Text>
          <Box width={28}>
            <Progress
              label="Context"
              value={u.percent === undefined ? 0 : u.percent / 100}
              valueText={figure(u)}
              color={TERMINAL_COLOR[tone]}
            />
          </Box>
          {shown.map(l => (
            <Text key={l.kind} color={TERMINAL_COLOR[toneOf(l.percentUsed)]}>
              {limitName(l.kind)} {Math.round(l.percentUsed)}%
            </Text>
          ))}
          {compact(ui.Button)}
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const slot = Math.round(e.props.bodyColumns * ADVANCE) - (canCompact ? BUTTON_ROOM : 0)
    const W = Math.min(MAX_W, Math.max(MIN_W, slot))
    const compactNote =
      u.compactAt === undefined ? '' : `, auto-compacts at ${formatTokens(u.compactAt)}`
    const limitNote = shown
      .map(l => `${limitName(l.kind)} limit ${Math.round(l.percentUsed)}% used`)
      .join(', ')
    const alt =
      (u.percent === undefined
        ? `Context: waiting for first reply, ${formatTokens(u.window)} window`
        : `Context ${Math.round(u.percent)}% used (${figure(u)})`) +
      compactNote +
      (limitNote === '' ? '' : `; ${limitNote}`)

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg source={scene(u, shown, e.props.isWorking, W)} alt={alt} width={W} height={H} />
        {compact(ui.Button)}
      </Box>
    )
  })
}
