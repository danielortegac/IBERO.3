import React, { forwardRef, useEffect, useRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = '', value, ...props }, ref) => {
  const baseClasses = "w-full bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 mt-1 focus-visible:outline-none focus-visible:border-brand-accent focus-visible:shadow-[0_0_6px_#8b5cf6] resize-none overflow-y-auto custom-scrollbar";
  
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const combinedRef = (node: HTMLTextAreaElement) => {
      internalRef.current = node;
      if (typeof ref === 'function') {
          ref(node);
      } else if (ref) {
          ref.current = node;
      }
  };

  useEffect(() => {
      if (internalRef.current) {
          internalRef.current.style.height = 'auto';
          // Limitar a 128px (aprox 5-6 líneas) y permitir scroll
          const newHeight = Math.min(internalRef.current.scrollHeight, 128); 
          internalRef.current.style.height = `${newHeight}px`;
      }
  }, [value]);
  
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      e.currentTarget.style.height = 'auto';
      const newHeight = Math.min(e.currentTarget.scrollHeight, 128);
      e.currentTarget.style.height = `${newHeight}px`;
      props.onInput && props.onInput(e);
  };

  return (
    <textarea 
        ref={combinedRef} 
        className={`${baseClasses} ${className}`} 
        value={value}
        onInput={handleInput}
        {...props} 
    />
  );
});

Textarea.displayName = 'Textarea';

export default Textarea;