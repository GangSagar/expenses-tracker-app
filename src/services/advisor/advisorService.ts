import { Expense } from '../../types/expense';

export interface BudgetInsight {
  status: 'good' | 'warning' | 'danger';
  headline: string;
  message: string;
  projectedExpense: number;
  savingsEstimate: number;
  dailyBurnRate: number;
}

/**
 * On-Device Smart Budget Advisor Engine
 * Calculates linear daily spending velocity (burn-rate), forecasts month-end
 * final expenditures, and compiles highly customized mathematical micro-advisories.
 */

interface AdvisorCache {
  key: string;
  result: BudgetInsight;
}

let _cache: AdvisorCache | null = null;

export function generateBudgetInsights(
  expenses: Expense[],
  monthlyBudget: number,
  telemetryTracer?: { traceSync: <T>(name: string, attrs: Record<string, any>, fn: () => T) => T },
): BudgetInsight {
  const compute = () => {
    const now = new Date();
    const cacheKey = `${now.getFullYear()}-${now.getMonth()}-${
      expenses.length
    }-${monthlyBudget}`;
    if (_cache && _cache.key === cacheKey) {
      return _cache.result;
    }
    const result = _computeBudgetInsights(expenses, monthlyBudget);
    _cache = { key: cacheKey, result };
    return result;
  };

  if (telemetryTracer) {
    return telemetryTracer.traceSync(
      'advisor.generateBudgetInsights',
      { expensesCount: expenses.length, monthlyBudget },
      compute,
    );
  }
  return compute();
}

function _computeBudgetInsights(
  expenses: Expense[],
  monthlyBudget: number,
): BudgetInsight {
  // 1. If no budget limit has been configured by the user yet
  if (!monthlyBudget || monthlyBudget <= 0) {
    return {
      status: 'good',
      headline: 'Set a Budget Limit 🎯',
      message:
        'Configure your monthly budget cap in the Settings tab to unlock real-time predictive spending insights and custom savings projections!',
      projectedExpense: 0,
      savingsEstimate: 0,
      dailyBurnRate: 0,
    };
  }

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  const currentDay = today.getDate();

  // Get total days in the current month
  const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // 2. Filter active debit expenses of the current month
  const startOfMonthTs = new Date(currentYear, currentMonth, 1).getTime();
  const currentMonthDebits = expenses.filter(e => {
    return (
      !e.isInvalid &&
      e.transactionType === 'debit' &&
      e.timestamp >= startOfMonthTs &&
      e.timestamp <= today.getTime()
    );
  });

  const totalSpent = currentMonthDebits.reduce(
    (sum, e) => sum + (e.amount || 0),
    0,
  );

  // 3. If zero expenses have been made this month
  if (totalSpent === 0) {
    return {
      status: 'good',
      headline: 'Perfect Ledger State 💸',
      message:
        'No expenses recorded this month yet! Your monthly budget is completely untouched and primed for amazing savings.',
      projectedExpense: 0,
      savingsEstimate: monthlyBudget,
      dailyBurnRate: 0,
    };
  }

  // 4. Calculate burn rates & forecast projections
  const dailyBurnRate = currentDay > 0 ? totalSpent / currentDay : totalSpent;
  const projectedExpense = Math.round(dailyBurnRate * totalDaysInMonth);
  const budgetRatio = projectedExpense / monthlyBudget;

  let status: 'good' | 'warning' | 'danger' = 'good';
  let headline = 'Superb Budget Pace! 🌟';
  let message = '';
  let savingsEstimate = 0;

  // Determine status classification based on trajectory
  if (totalSpent > monthlyBudget) {
    status = 'danger';
    headline = 'Budget Cap Exceeded! 🚨';
    message = `You have spent ₹${totalSpent.toLocaleString(
      'en-IN',
    )} out of your ₹${monthlyBudget.toLocaleString(
      'en-IN',
    )} limit. Freeze all non-essential shopping and food spending immediately to stop the overshoot!`;
  } else if (budgetRatio > 1.1) {
    status = 'danger';
    headline = 'High Spending Trajectory! ⚠️';

    // Calculate the expected exhaustion day
    const expectedExhaustionDay = Math.floor(monthlyBudget / dailyBurnRate);
    const dayLabel =
      expectedExhaustionDay > 0 && expectedExhaustionDay <= totalDaysInMonth
        ? `around day ${expectedExhaustionDay} of the month`
        : 'before the month ends';

    message = `You are burning ₹${Math.round(dailyBurnRate).toLocaleString(
      'en-IN',
    )}/day. At this rate, you will exceed your cap by ₹${(
      projectedExpense - monthlyBudget
    ).toLocaleString('en-IN')} and run out of budget ${dayLabel}.`;
  } else if (budgetRatio > 0.9) {
    status = 'warning';
    headline = 'Close to the Line! 🔔';
    message = `You are on pace to spend ₹${projectedExpense.toLocaleString(
      'en-IN',
    )}, which is extremely close to your ₹${monthlyBudget.toLocaleString(
      'en-IN',
    )} cap. Squeezing back slightly on Dining out and Entertainment will keep you safe!`;
  } else {
    status = 'good';
    headline = 'Excellent Budget Pace! 🌟';
    savingsEstimate = monthlyBudget - projectedExpense;
    message = `Splendid! You are on pace to spend only ₹${projectedExpense.toLocaleString(
      'en-IN',
    )} this month. This sets you up to save an estimated ₹${savingsEstimate.toLocaleString(
      'en-IN',
    )} by month-end!`;
  }

  // 5. Append dynamic, category-specific micro-advice tips
  const categorySpentMap: Record<string, number> = {};
  currentMonthDebits.forEach(e => {
    const cat = e.category || 'Other';
    categorySpentMap[cat] = (categorySpentMap[cat] || 0) + (e.amount || 0);
  });

  let topCategory = '';
  let maxCatSpent = 0;
  Object.entries(categorySpentMap).forEach(([cat, amt]) => {
    if (amt > maxCatSpent) {
      maxCatSpent = amt;
      topCategory = cat;
    }
  });

  if (topCategory && maxCatSpent > 0 && totalSpent > 0) {
    const pct = Math.round((maxCatSpent / totalSpent) * 100);
    if (pct >= 30) {
      let adviceTip = '';
      switch (topCategory) {
        case 'Food & Dining':
          adviceTip =
            ' Cooking at home more often could dramatically boost your monthly wallet health! 🍳';
          break;
        case 'Travel':
          adviceTip =
            ' Considering public transport or ridesharing could help bring this down! 🚇';
          break;
        case 'Shopping':
          adviceTip =
            ' Splitting purchases or waiting 48 hours before buying items can stop impulse spending! 🛍️';
          break;
        default:
          adviceTip =
            ' Reviewing transactions in this category might reveal easy places to optimize! 💡';
      }
      message += `\n\n💡 Tip: ${topCategory} is your largest expense, accounting for ${pct}% of your total spend.${adviceTip}`;
    }
  }

  return {
    status,
    headline,
    message,
    projectedExpense,
    savingsEstimate: savingsEstimate > 0 ? savingsEstimate : 0,
    dailyBurnRate: Math.round(dailyBurnRate),
  };
}
