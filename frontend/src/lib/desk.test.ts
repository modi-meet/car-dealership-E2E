import { describe, expect, it } from 'vitest'
import { ago, clock, timer } from './desk'

const T0 = Date.parse('2026-11-06T10:00:00Z')
const at = (ms: number) => new Date(T0 + ms).toISOString()

describe('response timer', () => {
  it('green for the first three minutes', () => {
    expect(timer({ created_at: at(0), first_response_at: null }, T0 + 65_000)).toEqual({ tone: 'ok', text: '1:05' })
  })
  it('amber from three to five', () => {
    expect(timer({ created_at: at(0), first_response_at: null }, T0 + 4 * 60_000).tone).toBe('warn')
    expect(timer({ created_at: at(0), first_response_at: null }, T0 + 5 * 60_000).tone).toBe('warn')
  })
  it('red and counting once overdue', () => {
    expect(timer({ created_at: at(0), first_response_at: null }, T0 + 17 * 60_000)).toEqual({ tone: 'bad', text: 'Overdue 12m' })
  })
  it('answered in time vs late', () => {
    expect(timer({ created_at: at(0), first_response_at: at(3 * 60_000) }, T0).tone).toBe('done')
    expect(timer({ created_at: at(0), first_response_at: at(40 * 60_000) }, T0)).toEqual({ tone: 'late', text: 'Replied in 40m' })
  })
  it('helpers', () => {
    expect(clock(247_000)).toBe('4:07')
    expect(ago(3 * 86_400_000)).toBe('3d')
  })
})
