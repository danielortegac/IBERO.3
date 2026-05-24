
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  className = '', 
  ...props 
}) => {
  const baseClasses = "font-semibold rounded-xl transition-all duration-300 ease-out flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-bg focus:ring-brand-primary disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]";

  const variantClasses = {
    primary: 'bg-brand-primary text-white hover:bg-brand-secondary shadow-md hover:shadow-lg hover:shadow-brand-primary/25',
    secondary: 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 shadow-sm hover:shadow',
    ghost: 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:text-brand-primary hover:bg-brand-primary/5 dark:hover:bg-white/5',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-8 py-3.5 text-base',
  };

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <button className={combinedClasses} {...props}>
      {children}
    </button>
  );
};

export default Button;
