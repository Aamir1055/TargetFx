import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { brokerAPI } from '../services/api';

const IBContext = createContext();

export const useIB = () => {
  const context = useContext(IBContext);
  if (!context) {
    throw new Error('useIB must be used within an IBProvider');
  }
  return context;
};

export const IBProvider = ({ children }) => {
  const [selectedIB, setSelectedIB] = useState(null);
  const [ibList, setIBList] = useState([]);
  const [ibMT5Accounts, setIBMT5Accounts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Prefetch IB list on login event, initial mount if token exists, and manual refresh event
  useEffect(() => {
    const handleLogin = () => {
      console.log('[IB] auth:login event → fetching IB emails...')
      fetchIBList()
    }
    const handleAppRefresh = () => {
      console.log('[IB] app:refresh event → refreshing IB emails...')
      fetchIBList()
    }

    window.addEventListener('auth:login', handleLogin)
    window.addEventListener('app:refresh', handleAppRefresh)

    // If already authenticated (tokens present) prefetch once on mount
    try {
      const token = localStorage.getItem('access_token')
      if (token) {
        console.log('[IB] Existing access_token detected on mount → prefetch IB emails')
        fetchIBList()
      }
    } catch {}

    return () => {
      window.removeEventListener('auth:login', handleLogin)
      window.removeEventListener('app:refresh', handleAppRefresh)
    }
  }, [])

  // Fetch MT5 accounts when IB is selected
  useEffect(() => {
    if (selectedIB?.email) {
      fetchIBMT5Accounts(selectedIB.email);
    } else {
      setIBMT5Accounts([]);
    }
  }, [selectedIB]);

  const fetchIBList = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await brokerAPI.getIBEmails()
      const d = response?.data
      if (import.meta?.env?.VITE_DEBUG_LOGS === 'true') {
        console.log('[IB] getIBEmails response:', d)
      }
      const statusOk = d?.status === 'success' || d?.success === true || d?.ok === true
      const emails = (
        d?.data?.emails ||
        d?.emails ||
        []
      )

      if (!statusOk || !Array.isArray(emails)) {
        setIBList([])
        setError(d?.message || 'Failed to fetch IB emails')
        return
      }

      // Sort if percentage field exists; otherwise leave order as provided
      const hasPercentage = emails.some(e => e?.percentage != null)
      const sortedEmails = hasPercentage
        ? emails.sort((a, b) => parseFloat(a.percentage || 0) - parseFloat(b.percentage || 0))
        : emails
      setIBList(sortedEmails)
    } catch (err) {
      console.error('[IB] Error fetching IB list:', err)
      console.error('[IB] Error details:', {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
        code: err?.code
      })
      setError(err?.message || 'Failed to fetch IB list')
      setIBList([])
    } finally {
      setIsLoading(false)
    }
  };

  const fetchIBMT5Accounts = async (email) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await brokerAPI.getIBMT5Accounts(email);
      const d = response?.data;
      
      if (d?.status === 'success') {
        const accounts = d?.data?.mt5_accounts || [];
        // Extract just the mt5_id (login numbers) from the accounts
        const mt5Ids = accounts.map(acc => acc.mt5_id);
        setIBMT5Accounts(mt5Ids);
      } else {
        setError(d?.message || 'Failed to fetch MT5 accounts');
        setIBMT5Accounts([]);
      }
    } catch (err) {
      console.error('Error fetching IB MT5 accounts:', err);
      setError(err.message || 'Failed to fetch MT5 accounts');
      setIBMT5Accounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const selectIB = (ib) => {
    setSelectedIB(ib);
    // Store in localStorage for persistence
    if (ib) {
      localStorage.setItem('selectedIB', JSON.stringify(ib));
    } else {
      localStorage.removeItem('selectedIB');
    }
  };

  const clearIBSelection = () => {
    setSelectedIB(null);
    setIBMT5Accounts([]);
    localStorage.removeItem('selectedIB');
  };

  // Filter items by active IB (works for any array with login field)
  const filterByActiveIB = useCallback((items, loginField = 'login') => {
    if (!selectedIB || !ibMT5Accounts || ibMT5Accounts.length === 0) {
      return items;
    }
    
    // Convert MT5 IDs to Set for faster lookup (they're already just numbers)
    const accountSet = new Set(ibMT5Accounts.map(id => Number(id)));
    
    return items.filter(item => {
      const itemLogin = Number(item[loginField]);
      return accountSet.has(itemLogin);
    });
  }, [selectedIB, ibMT5Accounts]);

  // Clear IB filter on page refresh
  useEffect(() => {
    localStorage.removeItem('selectedIB');
    setSelectedIB(null);
  }, []);

  const value = {
    selectedIB,
    ibList,
    ibMT5Accounts,
    isLoading,
    error,
    selectIB,
    clearIBSelection,
    filterByActiveIB,
    // Expose explicit prefetch for pages wanting to ensure readiness on navigation
    refreshIBList: fetchIBList,
  };

  return <IBContext.Provider value={value}>{children}</IBContext.Provider>;
};
