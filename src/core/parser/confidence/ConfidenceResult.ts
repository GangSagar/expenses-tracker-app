import { ConfidenceBreakdown } from '../models';

export interface ConfidenceEvaluation {
  overall: number;
  breakdown: ConfidenceBreakdown;
  requiresConfirmation: boolean;
}
