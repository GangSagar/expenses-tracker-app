const { checkSource } = require('../../scripts/check-import-boundaries');

describe('import boundaries', () => {
  it('rejects core imports from database and React Native', () => {
    const violations = checkSource(
      'src/core/example.ts',
      "import { getDatabase } from '../database/db';\nimport { Platform } from 'react-native';\nimport { open } from 'react-native-quick-sqlite';",
    );

    expect(violations).toHaveLength(3);
  });

  it('rejects database imports from services', () => {
    const violations = checkSource(
      'src/database/example.ts',
      "import { save } from '../services/transactions/transactionApplication';",
    );

    expect(violations).toHaveLength(1);
  });

  it('allows core-to-core and app composition adapter wiring', () => {
    expect(checkSource('src/core/example.ts', "import { classify } from './classifier';")).toEqual([]);
    expect(checkSource('src/app/composition/index.ts', "import { Repository } from '../../infrastructure/persistence/Repository';")).toEqual([]);
    expect(checkSource('src/services/example.ts', "import { repository } from '../app/composition';")).toEqual([]);
  });
});
