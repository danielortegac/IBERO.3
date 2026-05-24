import React from 'react';

interface SkeletonProps {
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse ${className}`} />
  );
};

const NewsCardSkeleton: React.FC = () => (
    <div className="bg-light-surface dark:bg-dark-surface p-6 rounded-2xl shadow-md">
        <Skeleton className="h-4 w-1/4 mb-4" />
        <Skeleton className="h-6 w-3/4 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-full mb-4" />
        <Skeleton className="h-5 w-1/3" />
    </div>
);

export { NewsCardSkeleton };
export default Skeleton;
