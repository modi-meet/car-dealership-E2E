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

// yyyy-mm-dd for a day in india, n days from today
export function istDay(offset = 0) {
  const d = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d)
}

export function dayLabel(iso: string, lang = 'en') {
  return new Date(`${iso}T12:00:00+05:30`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

// "17:00" -> "5:00 pm"
export function slotLabel(s: string) {
  const [h, m] = s.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}
