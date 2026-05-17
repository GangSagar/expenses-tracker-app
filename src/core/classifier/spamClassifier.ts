import { tokenize } from './bayesClassifier';
import { getSetting, setSetting } from '../../database/expenseRepo';

// The key used to store the spam classifier state in the settings table
const SETTING_KEY = 'spam_classifier_state';

interface SpamState {
  spamCount: number;
  hamCount: number;
  wordFrequencies: Record<string, { spam: number; ham: number }>;
}

let state: SpamState | null = null;

// Default initial state
const defaultState: SpamState = {
  spamCount: 0,
  hamCount: 0,
  wordFrequencies: {},
};

function loadState(): SpamState {
  if (state) return state;
  const raw = getSetting(SETTING_KEY, '');
  if (!raw) {
    state = JSON.parse(JSON.stringify(defaultState));
  } else {
    try {
      state = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse spam classifier state', e);
      state = JSON.parse(JSON.stringify(defaultState));
    }
  }
  return state!;
}

function saveState() {
  if (state) {
    setSetting(SETTING_KEY, JSON.stringify(state));
  }
}

/**
 * Trains the dynamic on-device spam classifier.
 * @param text The raw message body
 * @param isSpam True if the user marked it as spam, false if restored to active (ham)
 */
export function trainSpam(text: string, isSpam: boolean) {
  const currentState = loadState();
  const tokens = tokenize(text);

  // Prevent empty training
  if (tokens.length === 0) return;

  if (isSpam) {
    currentState.spamCount++;
  } else {
    currentState.hamCount++;
  }

  for (const token of tokens) {
    if (!currentState.wordFrequencies[token]) {
      currentState.wordFrequencies[token] = { spam: 0, ham: 0 };
    }

    if (isSpam) {
      currentState.wordFrequencies[token].spam++;
    } else {
      currentState.wordFrequencies[token].ham++;
    }
  }

  saveState();
  console.log(
    `[SpamClassifier] Trained. Now tracking ${
      Object.keys(currentState.wordFrequencies).length
    } words.`,
  );
}

/**
 * Classifies an SMS text as spam or not using Naive Bayes probability.
 * @param text The raw SMS message body
 * @returns boolean indicating if the message is highly likely to be spam
 */
export function isSpam(text: string): boolean {
  const currentState = loadState();

  // If we haven't been trained at all, we don't classify anything as spam
  if (currentState.spamCount === 0) {
    return false;
  }

  const tokens = tokenize(text);
  if (tokens.length === 0) return false;

  const totalDocs = currentState.spamCount + currentState.hamCount;

  // Prior probabilities (with Laplace smoothing just in case)
  const pSpam = currentState.spamCount / totalDocs;
  const pHam = currentState.hamCount / totalDocs;

  // We use log probabilities to avoid underflow with very small numbers
  let logPSpam = Math.log(pSpam);
  let logPHam = Math.log(pHam);

  for (const token of tokens) {
    const stats = currentState.wordFrequencies[token];

    // Laplace smoothing (add 1)
    const countSpam = stats ? stats.spam : 0;
    const countHam = stats ? stats.ham : 0;

    // Total words of that class in the training set
    // For simplicity, we just use the document counts as the denominator (Bernoulli-ish model)
    const probTokenGivenSpam = (countSpam + 1) / (currentState.spamCount + 2);
    const probTokenGivenHam = (countHam + 1) / (currentState.hamCount + 2);

    logPSpam += Math.log(probTokenGivenSpam);
    logPHam += Math.log(probTokenGivenHam);
  }

  // If the log probability of spam is greater than ham, it's spam
  const isSpamResult = logPSpam > logPHam;

  console.log(
    `[SpamClassifier] Evaluated "${text.substring(
      0,
      20,
    )}..." -> isSpam: ${isSpamResult} (Spam Score: ${logPSpam.toFixed(
      2,
    )}, Ham Score: ${logPHam.toFixed(2)})`,
  );

  return isSpamResult;
}
