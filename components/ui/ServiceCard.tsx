import React from 'react';
import Card from './Card';
import Icon from '../Icon';
import Button from './Button';
import { useTranslation } from '../../hooks/useTranslation';

export interface ServicePromo {
    nameKey: string;
    descKey: string;
    icon: React.ComponentProps<typeof Icon>['name'];
}

const catchyPhrases = [
    "Convierte tu talento en ingresos.",
    "Monetiza tu creatividad.",
    "Haz crecer tus ideas con nosotros.",
    "Genera ingresos con tus habilidades.",
    "Empieza a ganar hoy.",
    "Únete y monetiza."
];

// Get a "random" but consistent phrase based on the service name to avoid re-renders
const getCatchyPhrase = (nameKey: string) => {
    const index = nameKey.length % catchyPhrases.length;
    return catchyPhrases[index];
}

const ServiceCard: React.FC<{ service: ServicePromo }> = ({ service }) => {
    const { t } = useTranslation();

    const handleNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        window.location.hash = 'partners';
    }

    return (
        <a href="#partners" onClick={handleNav} className="h-full block group">
            <Card className="p-6 bg-gradient-to-br from-brand-primary to-purple-800 text-white shadow-lg transform group-hover:-translate-y-1 transition-transform duration-300 h-full flex flex-col">
                <div className="flex items-start gap-3">
                    <Icon name={service.icon} className="w-8 h-8 text-white flex-shrink-0"/>
                    <h3 className="text-lg font-bold">{t(service.nameKey as any)}</h3>
                </div>
                <p className="text-sm font-semibold mt-2 mb-4 opacity-90 flex-grow">{t(service.descKey as any)}</p>
                <div className="relative overflow-hidden w-full text-center bg-white text-black font-bold py-3 px-4 rounded-lg mt-auto transition-all duration-300 group-hover:shadow-lg group-hover:shadow-white/20 scale-100 group-hover:scale-105">
                    {getCatchyPhrase(service.nameKey)}
                    <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent to-white opacity-30 transform -skew-x-12 transition-transform duration-700 group-hover:left-full" />
                </div>
            </Card>
        </a>
    )
}

export default ServiceCard;