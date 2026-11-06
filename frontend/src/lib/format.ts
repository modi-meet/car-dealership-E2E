// indian number formats: ₹14,36,145 and 41,200 km

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en-IN')

export const rupees = (n: number) => inr.format(n)
export const km = (n: number) => `${num.format(n)} km`

// 1245000 -> "12.45 lakh", handy for cards
export function lakh(n: number) {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} crore`
  return `${(n / 1_00_000).toFixed(2).replace(/\.?0+$/, '')} lakh`
}

export function dateShort(iso: string, lang = 'en') {
  return new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
