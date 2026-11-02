import React from 'react';
import { cn } from '../../lib/utils.js';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card: React.FC<CardProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm text-slate-900',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

