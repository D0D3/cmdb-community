import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { avatarUrl } from '@/api/auth'

interface AvatarProps {
  userId:    string
  fullName:  string
  hasAvatar: boolean
  updatedAt: string | null
  size?:     'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-16 w-16 text-xl',
}

export default function Avatar({
  userId, fullName, hasAvatar, updatedAt, size = 'sm', className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false)

  // Réinitialise l'erreur dès que l'URL change (nouvel upload)
  useEffect(() => { setImgError(false) }, [updatedAt])

  const initials = fullName
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const baseCls = cn(
    'shrink-0 rounded-full font-bold flex items-center justify-center overflow-hidden bg-brand text-brand-foreground',
    SIZE[size],
    className,
  )

  if (hasAvatar && !imgError) {
    return (
      <img
        src={avatarUrl(userId, updatedAt)}
        alt={fullName}
        className={cn(baseCls, 'object-cover')}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={baseCls}>
      {initials}
    </div>
  )
}
