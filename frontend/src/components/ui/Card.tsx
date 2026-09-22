import { cn } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'

type DivProps = HTMLAttributes<HTMLDivElement> & { children?: ReactNode }

export function Card({ children, className, ...props }: DivProps) {
  return (
    <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className, ...props }: DivProps) {
  return <div className={cn('flex flex-col space-y-1 p-5', className)} {...props}>{children}</div>
}

export function CardTitle({ children, className, ...props }: DivProps) {
  return <h3 className={cn('text-sm font-medium text-muted-foreground', className)} {...props}>{children}</h3>
}

export function CardContent({ children, className, ...props }: DivProps) {
  return <div className={cn('p-5 pt-0', className)} {...props}>{children}</div>
}
