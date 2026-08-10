import React, { createContext, useContext, useEffect, useState } from 'react';

export type ViewMode = 'desktop' | 'phone';

interface ViewModeContextType {
  viewMode: ViewMode;
  isPhone: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

const STORAGE_KEY = 'tw_view_mode';
const MANUAL_KEY = 'tw_view_mode_manual';

const ViewModeContext = createContext<ViewModeContextType | null>(null);

const applyViewAttr = (mode: ViewMode) => {
  document.documentElement.dataset.view = mode;
};

const detectNarrow = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

export const ViewModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const manual = localStorage.getItem(MANUAL_KEY) === '1';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (manual && (saved === 'phone' || saved === 'desktop')) return saved;
    return detectNarrow() ? 'phone' : 'desktop';
  });

  useEffect(() => {
    applyViewAttr(viewMode);
    localStorage.setItem(STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => {
      if (localStorage.getItem(MANUAL_KEY) === '1') return;
      setViewModeState(mq.matches ? 'phone' : 'desktop');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setViewMode = (mode: ViewMode) => {
    localStorage.setItem(MANUAL_KEY, '1');
    setViewModeState(mode);
  };

  const toggleViewMode = () => {
    localStorage.setItem(MANUAL_KEY, '1');
    setViewModeState((prev) => (prev === 'phone' ? 'desktop' : 'phone'));
  };

  return (
    <ViewModeContext.Provider
      value={{
        viewMode,
        isPhone: viewMode === 'phone',
        setViewMode,
        toggleViewMode,
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
};
