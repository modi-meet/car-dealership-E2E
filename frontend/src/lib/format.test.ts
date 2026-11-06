import { describe, expect, it } from 'vitest'
import { istDay, km, lakh, ordinal, rupees, slotLabel } from './format'

describe('format', () => {
  it('uses indian grouping', () => {
    expect(rupees(1436145)).toBe('₹14,36,145')
    expect(km(41200)).toBe('41,200 km')
  })
  it('short lakh labels', () => {
    expect(lakh(1245000)).toBe('12.45 lakh')
    expect(lakh(500000)).toBe('5 lakh')
    expect(lakh(25000000)).toBe('2.50 crore')
  })
})

describe('booking helpers', () => {
  it('slot labels', () => {
    expect(slotLabel('10:00')).toBe('10:00 am')
    expect(slotLabel('12:00')).toBe('12:00 pm')
    expect(slotLabel('17:00')).toBe('5:00 pm')
  })
  it('ist day is yyyy-mm-dd', () => {
    expect(istDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('owners', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
  })
})
