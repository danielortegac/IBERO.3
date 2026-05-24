
import React, { useEffect } from 'react';
import Icon from '../Icon';

interface ToastProps {
  notification: { 
    title: string; 
    message: string; 
    icon?: React.ComponentProps<typeof Icon>['name'];
    onClick?: () => void;
    isLoading?: boolean;
  };
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
    useEffect(() => {
        if (notification.isLoading) {
            return; // Don't auto-close loading toasts
        }
        const timer = setTimeout(() => {
            onClose();
        }, 10000); // Auto-close after 10 seconds
        return () => clearTimeout(timer);
    }, [onClose, notification.isLoading]);
    
    const handleClick = () => {
        notification.onClick?.();
        onClose();
    }

    return (
        <div 
            onClick={handleClick}
            className={`fixed top-20 right-5 w-full max-w-sm bg-light-surface dark:bg-dark-surface shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden animate-subtle-slide-in-up z-[3000000] ${notification.onClick ? 'cursor-pointer' : ''}`}
        >
            <div className="p-4">
                <div className="flex items-start">
                    <div className="flex-shrink-0">
                        {notification.isLoading ? (
                            <svg className="animate-spin h-6 w-6 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <Icon name={notification.icon || 'discover'} className="h-6 w-6 text-brand-primary" />
                        )}
                    </div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                        <p className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">{notification.title}</p>
                        <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">{notification.message}</p>
                    </div>
                    <div className="ml-4 flex-shrink-0 flex">
                        <button onClick={(e) => { e.stopPropagation(); onClose();}} className="rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            <span className="sr-only">Close</span>
                            <Icon name="close" className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Toast;
