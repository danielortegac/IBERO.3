import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, id, ...props }, ref) => {
    const baseClasses = "w-full bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 mt-1 focus-visible:outline-none focus-visible:border-brand-accent focus-visible:shadow-[0_0_6px_#8b5cf6]";
    
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    const inputElement = (
      <input 
        ref={ref}
        id={inputId}
        className={`${baseClasses} ${className}`} 
        {...props} 
      />
    );

    if (label) {
      return (
        <div className="w-full">
          <label htmlFor={inputId} className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">
            {label}
          </label>
          {inputElement}
        </div>
      );
    }

    return inputElement;
  }
);

Input.displayName = 'Input';

export default Input;