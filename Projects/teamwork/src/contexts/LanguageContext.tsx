import React, { createContext, useContext, useState, useEffect } from 'react';
import t, { Lang, Translations } from '../data/translations';

interface LanguageContextType {
  lang: Lang;
  toggleLang: () => void;
  tr: Translations;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('app_lang') as Lang) || 'ar';
  });

  const toggleLang = () => {
    setLang((prev) => {
      const next: Lang = prev === 'ar' ? 'en' : 'ar';
      localStorage.setItem('app_lang', next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, tr: t[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
};
