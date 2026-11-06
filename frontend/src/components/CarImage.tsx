import { useState } from 'react'

// every photo has a 1600w and an -800w copy, let the browser pick
export function srcSet(src: string) {
  return src.endsWith('.jpg') ? `${src.replace(/\.jpg$/, '-800.jpg')} 800w, ${src} 1600w` : undefined
}

type Props = {
  src: string
  alt: string
  sizes?: string
  className?: string
  priority?: boolean
}

export default function CarImage({ src, alt, sizes = '100vw', className = '', priority = false }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    // keep the layout, just say there's no photo
    return <div className={`grid place-items-center bg-mist text-[13px] text-ink-3 ${className}`}>Photo coming soon</div>
  }
  return (
    <img
      src={src}
      srcSet={srcSet(src)}
      sizes={sizes}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-mist object-cover ${className}`}
    />
  )
}
