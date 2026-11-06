export type ModelCard = {
  slug: string
  name: string
  body_type: string
  tagline_en: string
  tagline_hi: string
  hero_image: string
  fuels: string[]
  from_ex_showroom: number
  from_on_road: number | null
}

export type Variant = {
  id: number
  name: string
  fuel: string
  transmission: string
  ex_showroom: number
  stock_id: string | null
  specs: Record<string, string | number>
  colours: { name: string; hex: string }[]
}

export type ModelDetail = ModelCard & {
  description_en: string
  description_hi: string
  gallery: string[]
  variants: Variant[]
}

export type PriceLine = { key: string; label: string; amount: number; detail: string }

export type Price = {
  available: boolean
  city: string
  variant_id: number
  total: number | null
  lines: PriceLine[]
  valid_until: string | null
  note: string | null
  accessory_ids: number[]
  reason: string | null
}

export type Accessory = { id: number; name: string; price: number; is_default: boolean }
