import { NativeModules, Platform } from 'react-native';

/**
 * Triggers native Android AlarmManager scheduling for Daily, Weekly, and Monthly reports.
 */
export function syncReportSchedule(): void {
  if (Platform.OS !== 'android') return;
  try {
    const { MessageModule } = NativeModules;
    if (typeof MessageModule?.scheduleFinancialReports === 'function') {
      MessageModule.scheduleFinancialReports();
    }
  } catch (error) {
    console.warn('Failed to sync financial report schedule:', error);
  }
}

