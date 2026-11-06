import Image from 'next/image'
import { cn } from '@/lib/utils/cn'

/** Identidad del sistema; independiente del logo configurable de la empresa. */
export function SystemLogo({
  className,
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/brand/sgrh-isotipo-v1.png"
      alt="SGRH"
      width={1280}
      height={1280}
      priority={priority}
      className={cn('h-auto w-10 shrink-0 object-contain', className)}
    />
  )
}
