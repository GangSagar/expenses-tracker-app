import { getSetting, setSetting } from '../../../database/expenseRepo';

/**
 * Service to interface with settings database storage.
 */
export const profileApi = {
  fetchBudgetLimit: () => {
    return getSetting('monthly_budget_limit', '20000');
  },
  saveBudgetLimit: (value) => {
    setSetting('monthly_budget_limit', value);
  },
  fetchScratchpadNote: () => {
    return getSetting('future_updates_note', '');
  },
  saveScratchpadNote: (value) => {
    setSetting('future_updates_note', value);
  }
};
