// standard reducing-balance emi, rounded to the rupee

export function emi(principal: number, annualRatePct: number, months: number) {
  if (principal <= 0 || months <= 0) return 0
  const r = annualRatePct / 12 / 100
  if (r === 0) return Math.round(principal / months)
  const f = (1 + r) ** months
  return Math.round((principal * r * f) / (f - 1))
}

export function loanSummary(price: number, down: number, ratePct: number, months: number) {
  const loan = Math.max(0, price - down)
  const monthly = emi(loan, ratePct, months)
  return { loan, monthly, interest: Math.max(0, monthly * months - loan) }
}
