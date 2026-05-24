
import React, { useContext } from 'react';
import { AppContext } from '../../context/AppContext';

interface LinkRendererProps {
  text: string;
  className?: string;
}

const LinkRenderer: React.FC<LinkRendererProps> = ({ text, className = "text-brand-primary dark:text-brand-accent hover:underline break-all font-bold cursor-pointer z-50 relative" }) => {
  const { allUsers, setViewingProfile, setCurrentView } = useContext(AppContext);

  // Regex to find URLs
  const urlRegex = /((?:https?:\/\/|www\.)[^\s]+)/g;
  // Regex to find @mentions (e.g., @Shivo, @User, @Daniel)
  const mentionRegex = /(@[\w\u00C0-\u00FF-]+)/g;
  
  if (!text) {
    return null;
  }

  const handleMentionClick = (mention: string) => {
      const targetName = mention.substring(1).replace('_', ' ');
      // Buscar usuario por primer nombre o nombre completo de forma insensible a mayúsculas
      const user = allUsers.find(u => {
        const firstName = u.name.split(' ')[0].toLowerCase();
        const fullName = u.name.toLowerCase();
        const agentName = u.alterEgo?.agentName?.toLowerCase() || '';
        const inputName = targetName.toLowerCase();

        return firstName === inputName || fullName === inputName || agentName === inputName || agentName.split(' ')[0] === inputName;
      });
      
      if (user) {
          setViewingProfile(user);
          setCurrentView('profile');
          window.location.hash = 'profile';
      }
  };

  // Helper to process text segments for links
  const processLinks = (segment: string) => {
      const parts = segment.split(urlRegex);
      return parts.map((part, index) => {
        if (part.match(urlRegex)) {
           let href = part;
           let suffix = '';
           
           // Limpiar caracteres de puntuación al final
           const lastCharsRegex = /[.,!?;:)"'\]]+$/;
           const match = part.match(lastCharsRegex);
           
           if (match) {
               suffix = match[0];
               href = part.substring(0, part.length - suffix.length);
           }

           let fullHref = href;
           if (href.startsWith('www.')) {
               fullHref = `https://${href}`;
           }
           
           return (
               <React.Fragment key={`link-${index}`}>
                   <a 
                     href={fullHref} 
                     target="_blank" 
                     rel="noopener noreferrer" 
                     className={className}
                     onClick={(e) => e.stopPropagation()}
                   >
                     {href}
                   </a>
                   {suffix}
               </React.Fragment>
           );
        }
        return part;
      });
  };
  
  // First split by mentions
  const parts = text.split(mentionRegex);

  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, index) => {
        if (part.match(mentionRegex)) {
            return (
                <span 
                    key={`mention-${index}`} 
                    onClick={(e) => { e.stopPropagation(); handleMentionClick(part); }}
                    className="text-blue-500 font-bold hover:underline cursor-pointer"
                >
                    {part}
                </span>
            );
        }
        // Process remaining parts for links
        return <React.Fragment key={`text-${index}`}>{processLinks(part)}</React.Fragment>;
      })}
    </span>
  );
};

export default LinkRenderer;
