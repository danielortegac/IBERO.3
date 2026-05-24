import { useContext } from 'react';
import { AppContext } from '../context/AppContext';
import type { Translations } from '../localization/en';
import en from '../localization/en';
import es from '../localization/es';

const resources: Record<string, Translations> = { en, es };

export const useTranslation = () => {
  const { language } = useContext(AppContext);

  const t = (key: keyof Translations): string => {
    return resources[language][key] || key;
  };

  return { t, language };
};
