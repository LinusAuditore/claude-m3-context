import { expect, test } from 'claude-code/testing'

const band = (surface: 'desktop' | 'terminal', isWorking = false, bodyColumns = 100) =>
  ({
    plugin: 'm3-context',
    component: 'AbovePrompt',
    surface,
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
    },
  }) as const

const LIMITS = [
  { kind: 'five_hour', percentUsed: 32 },
  { kind: 'seven_day', percentUsed: 88 },
]

test('the meter fills the band, marks auto-compact and shows the limits', async ($, on) => {
  on('session.measure', () => ({ changed: ['context', 'rateLimits'] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 160_000,
        window: 1_000_000,
        percent: 16,
        // Only the two fields the mod reads.
        breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 830_000 } as never,
      },
      rateLimits: LIMITS,
    },
  }))

  await $.session.measure({
    context: { tokens: 160_000, window: 1_000_000, percent: 16 },
    rateLimits: LIMITS,
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount(band('desktop', true, 120))
  const svg = await ui.find({ type: 'Svg' })
  const source = String(svg?.props.source)
  // 120 columns at 8.4px each.
  expect(svg?.props.width).toBe(1008)
  expect(source).toContain('viewBox="0 0 1008 72"')
  expect(source).toContain('<svg xmlns="http://www.w3.org/2000/svg" class="busy"')
  // While a turn runs the fill gives way to the indeterminate sweep.
  expect(source).toContain('@keyframes sweep-a')
  expect(source).toContain('.busy .seg-b { animation: sweep-b 2s infinite; }')
  expect(source).toContain('Auto-compact')
  expect(source).toContain('>5h<')
  expect(source).toContain('>7d<')
  expect(svg?.props.alt).toBe('Context 16% used (160k / 1M), auto-compacts at 830k; 5h limit 32% used, 7d limit 88% used')
  expect(await ui.find({ type: 'Button' })).toBe(undefined)
  await ui.unmount()
})

test('a nearly full window turns red and offers no compact button, on the terminal', async ($, on) => {
  on('session.measure', () => ({ changed: ['context'] }))

  await $.session.measure({
    context: { tokens: 180_000, window: 200_000, percent: 90 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount(band('terminal'))
  expect((await ui.find({ type: 'Text', text: /90%/ }))?.text).toBe('90%')
  // A button would outlive a compaction until the next reply's figures arrive.
  expect(await ui.find({ type: 'Button' })).toBe(undefined)
  await ui.unmount()
})
