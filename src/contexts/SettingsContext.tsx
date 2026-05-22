import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SettingsContextType {
  defaultMonth: string;
  isDynamic: boolean;
  dynamicDays: number;
  saveSettings: (month: string, dynamic: boolean, days: number) => void;
  getDefaultMonth: () => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

// Pure function to calculate dynamic month — no dependency on state
const calculateDynamicMonth = (days: number = 15): string => {
  const today = new Date();
  const currentDay = today.getDate();

  let targetDate: Date;

  if (currentDay >= days) {
    // On or after the cutoff day: use previous month
    targetDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  } else {
    // Before the cutoff day: use the month before previous month
    targetDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  }

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
};

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [defaultMonth, setDefaultMonth] = useState<string>(() => calculateDynamicMonth());
  const [isDynamic, setIsDynamic] = useState<boolean>(true);
  const [dynamicDays, setDynamicDays] = useState<number>(15);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedMonth = localStorage.getItem('defaultMonth');
    const savedDynamic = localStorage.getItem('isDynamic');
    const savedDays = localStorage.getItem('dynamicDays');

    if (savedDynamic) setIsDynamic(savedDynamic === 'true');
    if (savedDays) setDynamicDays(parseInt(savedDays));
    if (savedDynamic === 'false' && savedMonth) setDefaultMonth(savedMonth);
  }, []);

  // Get the effective default month — always recalculates when dynamic
  const getDefaultMonth = (): string => {
    if (isDynamic) {
      return calculateDynamicMonth(dynamicDays);
    }
    return defaultMonth;
  };

  // Save settings to localStorage
  const saveSettings = (month: string, dynamic: boolean, days: number) => {
    setDefaultMonth(month);
    setIsDynamic(dynamic);
    setDynamicDays(days);

    localStorage.setItem('defaultMonth', month);
    localStorage.setItem('isDynamic', dynamic.toString());
    localStorage.setItem('dynamicDays', days.toString());
  };

  return (
    <SettingsContext.Provider
      value={{
        defaultMonth,
        isDynamic,
        dynamicDays,
        saveSettings,
        getDefaultMonth,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
