import { describe, expect, it } from 'vitest'
import { gearbox, istDay, km, lakh, ordinal, ownerLabel, priceDetail, rupees, slotLabel } from './format'

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

describe('hindi formats', () => {
  it('units and owners', () => {
    expect(lakh(1245000, 'hi')).toBe('12.45 लाख')
    expect(km(41200, 'hi')).toBe('41,200 किमी')
    expect(ownerLabel(1, 'hi')).toBe('पहला मालिक')
    expect(ownerLabel(2, 'en')).toBe('2nd owner')
  })
  it('engine text from the db', () => {
    expect(gearbox('Automatic (CVT)', 'hi')).toBe('ऑटोमैटिक (CVT)')
    expect(gearbox('Automatic (CVT)', 'en')).toBe('Automatic (CVT)')
    expect(priceDetail('road_tax', '10% of ex-showroom', 'hi')).toBe('एक्स-शोरूम का 10%')
    expect(priceDetail('acc_1', 'accessory', 'en')).toBe('')
  })
})
