import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 font-medium rounded-full text-xs px-2.5 py-0.5 select-none transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-slate-100 text-slate-700 border border-slate-200',
        slate: 'bg-slate-100 text-slate-600 border border-slate-200',
        emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        amber: 'bg-amber-50 text-amber-700 border border-amber-200',
        indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        rose: 'bg-rose-50 text-rose-700 border border-rose-200',
        sky: 'bg-sky-50 text-sky-700 border border-sky-200',
        dark: 'bg-slate-900 text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant,
  dot = false,
  children,
  ...props
}) => {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props}>
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            variant === 'emerald' && 'bg-emerald-500',
            variant === 'amber' && 'bg-amber-500 animate-pulse',
            variant === 'indigo' && 'bg-indigo-500',
            variant === 'rose' && 'bg-rose-500',
            variant === 'sky' && 'bg-sky-500',
            (!variant || variant === 'default') && 'bg-slate-400'
          )}
        />
      )}
      {children}
    </span>
  );
};
