import { describe, expect, it } from 'vitest'
import { emi, loanSummary } from './emi'

describe('emi', () => {
  it('matches the textbook figure', () => {
    // ₹10 lakh at 9% for 5 years is ₹20,758 a month
    expect(emi(1_000_000, 9, 60)).toBe(20758)
  })
  it('zero rate just splits the loan', () => {
    expect(emi(600_000, 0, 60)).toBe(10000)
  })
  it('nothing to borrow means no emi', () => {
    expect(emi(0, 9, 60)).toBe(0)
    expect(loanSummary(800_000, 900_000, 9, 60)).toEqual({ loan: 0, monthly: 0, interest: 0 })
  })
  it('summary adds up', () => {
    const s = loanSummary(1_442_045, 300_000, 9, 60)
    expect(s.loan).toBe(1_142_045)
    expect(s.interest).toBe(s.monthly * 60 - s.loan)
  })
})
