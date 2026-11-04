import {
  CategoryModelData,
  ICategoryLearningRepository,
} from '../../core/learning/categories/contracts';
import { getDatabase } from '../../database/db';

const MODEL_KEY = 'category_learning_model';

export class SQLiteCategoryLearningRepository implements ICategoryLearningRepository {
  public async load(): Promise<CategoryModelData | null> {
    try {
      const db = getDatabase();
      const results = db.execute(
        'SELECT model_json FROM classifier_state WHERE key = ?;',
        [MODEL_KEY],
      );
      if (results?.rows && results.rows.length > 0) {
        const row = results.rows.item(0);
        return JSON.parse(row.model_json) as CategoryModelData;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async save(data: CategoryModelData): Promise<void> {
    try {
      const db = getDatabase();
      const json = JSON.stringify(data);
      db.execute(
        'INSERT OR REPLACE INTO classifier_state (key, model_json) VALUES (?, ?);',
        [MODEL_KEY, json],
      );
    } catch {
      // Best-effort cache write
    }
  }
}

export const sqliteCategoryLearningRepository = new SQLiteCategoryLearningRepository();

