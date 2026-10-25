import { SpamClassifier } from '../../core/classifier/spamClassifier';
import { LearningEngine } from '../../core/parser/learning/LearningEngine';
import { ParserOrchestrator } from '../../core/parser/orchestrator/ParserOrchestrator';
import { createSecurityService } from '../../services/security/securityService';
import { SettingsService } from '../../services/settings/settingsService';
import { ReactNativeDeviceAuthProvider } from '../../infrastructure/native/ReactNativeDeviceAuthProvider';
import { SQLiteLearningRepository } from '../../infrastructure/persistence/sqlite/SQLiteLearningRepository';
import { SQLiteSettingsRepository } from '../../infrastructure/persistence/sqlite/SQLiteSettingsRepository';
import { SQLiteSpamClassifierRepository } from '../../infrastructure/persistence/sqlite/SQLiteSpamClassifierRepository';
import { telemetry } from '../../infrastructure/observability/telemetryService';

const settingsRepository = new SQLiteSettingsRepository();

export const settingsService = new SettingsService(settingsRepository);
export const spamClassifier = new SpamClassifier(new SQLiteSpamClassifierRepository(settingsRepository));
export const learningEngine = new LearningEngine(new SQLiteLearningRepository());
export const parserOrchestrator = new ParserOrchestrator({ learningEngine });
export const securityService = createSecurityService(
  settingsRepository,
  new ReactNativeDeviceAuthProvider(),
);
export { telemetry };

export { transactionStorage } from './transactionDependencies';
