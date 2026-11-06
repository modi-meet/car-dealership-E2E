import { describe, expect, it } from 'vitest'
import { km, lakh, rupees } from './format'

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
