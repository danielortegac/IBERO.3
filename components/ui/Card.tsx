import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ children, className = '', ...props }, ref) => {
  const cardClasses = `bg-light-surface dark:bg-dark-surface rounded-2xl shadow-md ${className}`;
  
  return (
    <div ref={ref} className={cardClasses} {...props}>
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export default Card;