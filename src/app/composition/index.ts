import { Platform } from 'react-native';
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
import { ModelArtifactManager } from '../../infrastructure/ai/ModelArtifactManager';
import { LOCAL_MODEL_CATALOG } from '../../infrastructure/ai/localModelCatalog';
import { ModelLibraryService } from '../../services/ai/modelLibraryService';
import { ModelRuntimeSelector } from '../../services/ai/modelRuntimeSelector';

const settingsRepository = new SQLiteSettingsRepository();

export const settingsService = new SettingsService(settingsRepository);
export const modelArtifactManager = new ModelArtifactManager(new Set(['huggingface.co']));
export const modelLibraryService = new ModelLibraryService(
  LOCAL_MODEL_CATALOG,
  modelArtifactManager,
  settingsService,
);
export const modelRuntimeSelector = new ModelRuntimeSelector(
  settingsService,
  [],
  Platform.OS === 'ios' ? 'ios' : 'android',
);
export const spamClassifier = new SpamClassifier(new SQLiteSpamClassifierRepository(settingsRepository));
export const learningEngine = new LearningEngine(new SQLiteLearningRepository());
export const parserOrchestrator = new ParserOrchestrator({
  learningEngine,
  aiExtractionEngine: modelRuntimeSelector,
  isLocalAIEnabled: () => Object.values(settingsService.getModelLibraryPreferences().assignments)
    .some(assignment => assignment !== null),
});
export const securityService = createSecurityService(
  settingsRepository,
  new ReactNativeDeviceAuthProvider(),
);
export { telemetry };

export { transactionStorage } from './transactionDependencies';
