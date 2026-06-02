import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, placeholder, children, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}
        <select
          className={cn(
            "flex h-10 w-full rounded-xl border bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-red-500 focus:ring-red-500/30"
              : "border-slate-200 dark:border-slate-700",
            className
          )}
          ref={ref}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        {error && (
          <p className="text-red-500 text-xs">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
