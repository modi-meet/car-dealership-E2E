export type AVariant = { id: number; model_id: number; name: string; fuel: string; transmission: string; ex_showroom: number; stock_id: string | null }
export type AModel = {
  id: number
  slug: string
  name: string
  body_type: string
  tagline_en: string
  tagline_hi: string
  description_en: string
  description_hi: string
  hero_image: string
  is_published: boolean
  variants: AVariant[]
}
export type ACity = { id: number; name: string; state: string }
export type ATax = {
  id: number
  city_id: number
  fuel: string
  price_from: number
  price_to: number
  road_tax_bp: number
  registration_fee: number
  valid_from: string
  valid_until: string
}
export type AIns = { id: number; fuel: string; pct_bp: number; valid_from: string; valid_until: string }
export type AAcc = { id: number; name: string; price: number; is_default: boolean; variant_id: number | null }
export type ATables = { cities: ACity[]; tax_rules: ATax[]; insurance: AIns[]; accessories: AAcc[] }
export type AUsed = {
  id: number
  stock_id: string
  model_name: string
  variant: string
  fuel: string
  transmission: string
  year: number
  km: number
  owners: number
  price: number
  reg_number: string
  colour: string
  status: 'available' | 'booked' | 'sold'
  showroom_id: number | null
  inspection: { score: number }
}
export type AUser = { id: number; name: string; email: string; role: 'buyer' | 'consultant' | 'admin'; showroom_id: number | null; is_active: boolean; open_leads: number }

export const FUELS = ['petrol', 'diesel', 'cng', 'hybrid', 'electric']

// basis points <-> percent for the forms
export const pct = (bp: number) => String(bp / 100)
export const bp = (p: string) => Math.round(Number(p) * 100)
