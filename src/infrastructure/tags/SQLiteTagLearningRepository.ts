import { ITagLearningRepository, TagModelData } from '../../core/tags/contracts';
import { getDatabase } from '../../database/db';

const MODEL_KEY = 'tag_learning_model';

export class SQLiteTagLearningRepository implements ITagLearningRepository {
  public async load(): Promise<TagModelData | null> {
    try {
      const db = getDatabase();
      const results = db.execute(
        'SELECT model_json FROM classifier_state WHERE key = ?;',
        [MODEL_KEY],
      );
      if (results?.rows && results.rows.length > 0) {
        const row = results.rows.item(0);
        return JSON.parse(row.model_json) as TagModelData;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async save(data: TagModelData): Promise<void> {
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

export const sqliteTagLearningRepository = new SQLiteTagLearningRepository();

