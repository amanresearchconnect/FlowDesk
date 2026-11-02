import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
}) => {
  const isModalOpen = open ?? isOpen ?? false;
  const handleOpenChange = (state: boolean) => {
    if (onOpenChange) {
      onOpenChange(state);
    }
    if (!state && onClose) {
      onClose();
    }
  };

  return (
    <DialogPrimitive.Root open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-in fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl border border-slate-200 duration-200 animate-in fade-in zoom-in-95',
            maxWidthMap[maxWidth]
          )}
        >
          <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-xs text-slate-500 mt-0.5">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
