import { useState, useEffect } from 'react';
import { profileApi } from '../services/profileApi';

/**
 * Custom React hook to manage budget limit, scratchpad notes state, and auto-saves.
 */
export function useProfileData() {
  const [note, setNote] = useState('');
  const [budget, setBudget] = useState('20000');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load initial values from settings DB
    setNote(profileApi.fetchScratchpadNote());
    setBudget(profileApi.fetchBudgetLimit());
  }, []);

  // Debounced auto-save effect for scratchpad notes
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (note !== profileApi.fetchScratchpadNote()) {
        setIsSaving(true);
        profileApi.saveScratchpadNote(note);
        setTimeout(() => setIsSaving(false), 500);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [note]);

  const handleBudgetChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setBudget(cleaned);
    profileApi.saveBudgetLimit(cleaned);
  };

  return {
    budget,
    handleBudgetChange,
    note,
    setNote,
    isSaving,
  };
}
