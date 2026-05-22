import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';

export interface MonthOption {
  value: string;       // e.g. '2025-05'
  label: string;       // e.g. 'May 2025'
  shortLabel: string;  // e.g. 'May 2025'
  meValue: number;     // Excel serial date e.g. 45808
  fiscalYear: number;  // e.g. 2026
}

let cachedMonths: MonthOption[] | null = null;
let fetchPromise: Promise<MonthOption[]> | null = null;

const fetchMonths = async (token: string): Promise<MonthOption[]> => {
  const response = await fetch(API_ENDPOINTS.AVAILABLE_MONTHS, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch available months');
  return response.json();
};

export const useAvailableMonths = (): { availableMonths: MonthOption[]; loading: boolean } => {
  const [months, setMonths] = useState<MonthOption[]>(cachedMonths || []);
  const [loading, setLoading] = useState(!cachedMonths);

  useEffect(() => {
    if (cachedMonths) {
      setMonths(cachedMonths);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetchMonths(token);
    }

    fetchPromise
      .then((data) => {
        cachedMonths = data;
        setMonths(data);
      })
      .catch((err) => {
        console.error('Failed to load available months:', err);
      })
      .finally(() => {
        setLoading(false);
        fetchPromise = null;
      });
  }, []);

  return { availableMonths: months, loading };
};

// Utility to invalidate cache (e.g. when GL data is updated)
export const invalidateMonthsCache = () => {
  cachedMonths = null;
  fetchPromise = null;
};
