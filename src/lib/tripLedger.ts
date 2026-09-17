import { TripPlan } from './types';
import { CurrencyCode, convertCurrency } from './currency';

export type ExpenseCategory =
  | 'fuel'
  | 'charging'
  | 'tolls'
  | 'lodging'
  | 'food'
  | 'attractions'
  | 'parking'
  | 'misc';

export interface ExpenseCategoryMeta {
  id: ExpenseCategory;
  label: string;
  icon: string;
  color: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, ExpenseCategoryMeta> = {
  fuel: { id: 'fuel', label: 'Fuel', icon: '⛽', color: '#f59e0b' },
  charging: { id: 'charging', label: 'EV Charging', icon: '⚡', color: '#10b981' },
  tolls: { id: 'tolls', label: 'Tolls & Vignettes', icon: '🛣️', color: '#6366f1' },
  lodging: { id: 'lodging', label: 'Lodging & Hotels', icon: '🏨', color: '#3b82f6' },
  food: { id: 'food', label: 'Food & Dining', icon: '🍽️', color: '#ec4899' },
  attractions: { id: 'attractions', label: 'Attractions & Tours', icon: '🎟️', color: '#8b5cf6' },
  parking: { id: 'parking', label: 'Parking', icon: '🅿️', color: '#64748b' },
  misc: { id: 'misc', label: 'Miscellaneous', icon: '📦', color: '#94a3b8' },
};

export interface ExpenseItem {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  date: string;
  dayNumber?: number;
  paidBy: string;
  splitBetween: string[];
  notes?: string;
}

export interface DebtSettlement {
  from: string;
  to: string;
  amount: number;
  currency: CurrencyCode;
}

export interface TripLedgerData {
  expenses: ExpenseItem[];
  travelers: string[];
  baseCurrency: CurrencyCode;
}

const STORAGE_KEY = 'tripplanner_active_trip_ledger';

export function loadTripLedger(defaultTravelers: string[] = ['You']): TripLedgerData {
  if (typeof window === 'undefined') {
    return { expenses: [], travelers: defaultTravelers, baseCurrency: 'EUR' };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { expenses: [], travelers: defaultTravelers, baseCurrency: 'EUR' };
    const parsed = JSON.parse(raw);
    return {
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      travelers: Array.isArray(parsed.travelers) && parsed.travelers.length > 0 ? parsed.travelers : defaultTravelers,
      baseCurrency: parsed.baseCurrency || 'EUR',
    };
  } catch {
    return { expenses: [], travelers: defaultTravelers, baseCurrency: 'EUR' };
  }
}

export function saveTripLedger(data: TripLedgerData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save trip ledger to localStorage:', e);
  }
}

/**
 * Pre-populates estimated expenses from a generated TripPlan.
 */
export function generateExpensesFromPlan(
  plan: TripPlan,
  primaryTraveler: string = 'You',
  allTravelers: string[] = ['You']
): ExpenseItem[] {
  const generated: ExpenseItem[] = [];

  for (const day of plan.days) {
    // 1) Fuel
    if (day.estimatedFuelCost && day.estimatedFuelCost > 0) {
      generated.push({
        id: `gen-fuel-d${day.dayNumber}`,
        title: `Estimated Fuel (Day ${day.dayNumber})`,
        category: 'fuel',
        amount: day.estimatedFuelCost,
        currency: 'EUR',
        date: day.date,
        dayNumber: day.dayNumber,
        paidBy: primaryTraveler,
        splitBetween: [...allTravelers],
        notes: `Estimated for ${day.distanceKm} km driving`,
      });
    }

    // 2) EV Charging
    if (day.estimatedChargingCost && day.estimatedChargingCost > 0) {
      generated.push({
        id: `gen-ev-d${day.dayNumber}`,
        title: `EV Charging (Day ${day.dayNumber})`,
        category: 'charging',
        amount: day.estimatedChargingCost,
        currency: 'EUR',
        date: day.date,
        dayNumber: day.dayNumber,
        paidBy: primaryTraveler,
        splitBetween: [...allTravelers],
        notes: `Charging stop(s) along Day ${day.dayNumber}`,
      });
    }

    // 3) Lodging
    if (!day.isRestDay && day.hotelSuggestions && day.hotelSuggestions.length > 0) {
      const topHotel = day.hotelSuggestions[0];
      generated.push({
        id: `gen-hotel-d${day.dayNumber}`,
        title: `Hotel: ${topHotel.name.split(',')[0]}`,
        category: 'lodging',
        amount: 110,
        currency: 'EUR',
        date: day.date,
        dayNumber: day.dayNumber,
        paidBy: primaryTraveler,
        splitBetween: [...allTravelers],
        notes: `Stay in ${day.endLocation.name.split(',')[0]}`,
      });
    }

    // 4) Food estimate
    generated.push({
      id: `gen-food-d${day.dayNumber}`,
      title: `Dining & Meals (Day ${day.dayNumber})`,
      category: 'food',
      amount: 40 * allTravelers.length,
      currency: 'EUR',
      date: day.date,
      dayNumber: day.dayNumber,
      paidBy: primaryTraveler,
      splitBetween: [...allTravelers],
      notes: `Lunch and dinner estimate`,
    });
  }

  return generated;
}

/**
 * Calculates debt settlements ("Who owes whom") across all travelers in the chosen base currency.
 */
export function calculateDebtSettlements(
  expenses: ExpenseItem[],
  travelers: string[],
  baseCurrency: CurrencyCode = 'EUR'
): DebtSettlement[] {
  if (travelers.length <= 1 || expenses.length === 0) return [];

  // Map of traveler -> net balance in base currency (+ is owed money, - owes money)
  const balances: Record<string, number> = {};
  for (const t of travelers) {
    balances[t] = 0;
  }

  for (const exp of expenses) {
    const amountInBase = convertCurrency(exp.amount, exp.currency, baseCurrency);
    const splitList = (exp.splitBetween && exp.splitBetween.length > 0)
      ? exp.splitBetween.filter((t) => travelers.includes(t))
      : travelers;

    if (splitList.length === 0) continue;

    const perPersonShare = amountInBase / splitList.length;

    // The payer is credited
    if (balances[exp.paidBy] !== undefined) {
      balances[exp.paidBy] += amountInBase;
    } else {
      balances[exp.paidBy] = amountInBase;
    }

    // Each participant owes their share
    for (const participant of splitList) {
      balances[participant] = (balances[participant] || 0) - perPersonShare;
    }
  }

  // Separate into debtors (negative balance) and creditors (positive balance)
  const debtors: { person: string; owes: number }[] = [];
  const creditors: { person: string; owed: number }[] = [];

  for (const [person, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ person, owes: -rounded });
    } else if (rounded > 0.01) {
      creditors.push({ person, owed: rounded });
    }
  }

  // Sort descending by magnitude
  debtors.sort((a, b) => b.owes - a.owes);
  creditors.sort((a, b) => b.owed - a.owed);

  const settlements: DebtSettlement[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const amount = Math.min(debtor.owes, creditor.owed);
    if (amount > 0.01) {
      settlements.push({
        from: debtor.person,
        to: creditor.person,
        amount: Math.round(amount * 100) / 100,
        currency: baseCurrency,
      });
    }

    debtor.owes -= amount;
    creditor.owed -= amount;

    if (debtor.owes <= 0.01) dIdx++;
    if (creditor.owed <= 0.01) cIdx++;
  }

  return settlements;
}

/**
 * Exports expenses to a CSV string.
 */
export function exportExpensesToCSV(
  expenses: ExpenseItem[],
  baseCurrency: CurrencyCode = 'EUR'
): string {
  const headers = [
    'Date',
    'Day',
    'Title',
    'Category',
    'Amount',
    'Currency',
    `Converted (${baseCurrency})`,
    'Paid By',
    'Split Between',
    'Notes',
  ];

  const escapeCSV = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = expenses.map((exp) => {
    const converted = convertCurrency(exp.amount, exp.currency, baseCurrency);
    return [
      escapeCSV(exp.date),
      escapeCSV(exp.dayNumber ? `Day ${exp.dayNumber}` : ''),
      escapeCSV(exp.title),
      escapeCSV(EXPENSE_CATEGORIES[exp.category]?.label || exp.category),
      escapeCSV(exp.amount.toFixed(2)),
      escapeCSV(exp.currency),
      escapeCSV(converted.toFixed(2)),
      escapeCSV(exp.paidBy),
      escapeCSV((exp.splitBetween || []).join(', ')),
      escapeCSV(exp.notes || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Triggers a browser download for the CSV file.
 */
export function downloadExpensesCSV(
  expenses: ExpenseItem[],
  tripTitle: string = 'Trip',
  baseCurrency: CurrencyCode = 'EUR'
): void {
  const csvContent = exportExpensesToCSV(expenses, baseCurrency);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `${tripTitle.replace(/\s+/g, '_')}_expenses_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
