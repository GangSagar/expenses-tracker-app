import { ILearningRepository, LearnedMapping } from '../../../core/parser/learning/ILearningRepository';
import { InMemoryLearningRepository } from '../../../core/parser/learning/InMemoryLearningRepository';
import { Category } from '../../../types/expense';

export class SQLiteLearningRepository implements ILearningRepository {
  private inMemoryFallback: InMemoryLearningRepository = new InMemoryLearningRepository();

  public save(mapping: LearnedMapping): void {
    this.inMemoryFallback.save(mapping);

    try {
      // Lazy load database to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getDatabase } = require('../../../database/db');
      const db = getDatabase();
      if (db) {
        db.execute(
          `INSERT OR REPLACE INTO merchant_categories (merchant, category, display_name) VALUES (?, ?, ?)`,
          [mapping.merchant.trim(), mapping.category, mapping.displayName.trim()]
        );
      }
    } catch {
      // Running in environment without React Native SQLite, fallback holds the data
    }
  }

  public get(rawMerchant: string): LearnedMapping | null {
    if (!rawMerchant) return null;

    // Check memory cache first
    const cached = this.inMemoryFallback.get(rawMerchant);
    if (cached) return cached;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getDatabase } = require('../../../database/db');
      const db = getDatabase();
      if (db) {
        const result = db.execute(
          `SELECT merchant, category, display_name FROM merchant_categories WHERE UPPER(merchant) = ?`,
          [rawMerchant.toUpperCase().trim()]
        );

        if (result?.rows && result.rows.length > 0) {
          const row = result.rows.item(0);
          const mapping: LearnedMapping = {
            merchant: row.merchant,
            category: row.category as Category,
            displayName: row.display_name || row.merchant,
          };
          this.inMemoryFallback.save(mapping);
          return mapping;
        }
      }
    } catch {
      // SQLite not active
    }

    return null;
  }

  public getAll(): LearnedMapping[] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getDatabase } = require('../../../database/db');
      const db = getDatabase();
      if (db) {
        const result = db.execute(`SELECT merchant, category, display_name FROM merchant_categories`);
        if (result?.rows) {
          const mappings: LearnedMapping[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            mappings.push({
              merchant: row.merchant,
              category: row.category as Category,
              displayName: row.display_name || row.merchant,
            });
          }
          return mappings;
        }
      }
    } catch {
      // fallback
    }

    return this.inMemoryFallback.getAll();
  }
}
