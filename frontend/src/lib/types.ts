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

export type UsedCard = {
  stock_id: string
  model_name: string
  variant: string
  body_type: string
  fuel: string
  transmission: string
  year: number
  km: number
  owners: number
  price: number
  colour: string
  status: 'available' | 'booked'
  photo: string
  inspection_score: number
}

export type UsedDetail = UsedCard & {
  reg_masked: string
  city: string
  photos: string[]
  inspection: { score: number; inspected_on: string; checks: { item: string; status: 'ok' | 'attention'; note: string }[] }
  showroom: string | null
}

export type DemoCar = {
  id: number
  colour: string
  variant: string
  variant_id: number
  fuel: string
  transmission: string
  model: string
  model_slug: string
  hero_image: string
  showroom_id: number
  showroom: string
  locality: string
  address: string
}

export type Slot = { slot: string; free: boolean; why: 'booked' | 'past' | null }

export type Booking = {
  ref: string
  day: string
  slot: string
  model: string
  variant: string
  showroom: string
  address: string
  phone: string
  consultant: string | null
}
