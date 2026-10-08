import * as React from 'react';
import { cn } from '@/lib/utils';

const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <select
    className={cn(
      'flex h-9 w-full rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export { Select };
