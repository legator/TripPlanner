'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TripPlan } from '@/lib/types';
import {
  CurrencyCode,
  SUPPORTED_CURRENCIES,
  convertCurrency,
  formatCurrency,
} from '@/lib/currency';
import {
  ExpenseItem,
  ExpenseCategory,
  EXPENSE_CATEGORIES,
  loadTripLedger,
  saveTripLedger,
  generateExpensesFromPlan,
  calculateDebtSettlements,
  downloadExpensesCSV,
} from '@/lib/tripLedger';

interface TripLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripPlan?: TripPlan | null;
}

export default function TripLedgerModal({
  isOpen,
  onClose,
  tripPlan,
}: TripLedgerModalProps) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [travelers, setTravelers] = useState<string[]>(['You']);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('EUR');
  const [newTravelerName, setNewTravelerName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | 'all'>('all');

  // New expense form state
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('food');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<CurrencyCode>('EUR');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formPaidBy, setFormPaidBy] = useState('You');
  const [formSplitBetween, setFormSplitBetween] = useState<string[]>(['You']);
  const [formNotes, setFormNotes] = useState('');

  // Load ledger on mount or open
  useEffect(() => {
    if (isOpen) {
      const data = loadTripLedger(['You']);
      setExpenses(data.expenses);
      setTravelers(data.travelers);
      setBaseCurrency(data.baseCurrency);
      setFormPaidBy(data.travelers[0] || 'You');
      setFormSplitBetween([...data.travelers]);
    }
  }, [isOpen]);

  // Persist ledger whenever expenses, travelers, or baseCurrency change
  const persist = useCallback((newExp: ExpenseItem[], newTrav: string[], newCur: CurrencyCode) => {
    saveTripLedger({
      expenses: newExp,
      travelers: newTrav,
      baseCurrency: newCur,
    });
  }, []);

  const handleBaseCurrencyChange = (cur: CurrencyCode) => {
    setBaseCurrency(cur);
    persist(expenses, travelers, cur);
  };

  const handleAddTraveler = () => {
    const trimmed = newTravelerName.trim();
    if (!trimmed || travelers.includes(trimmed)) return;
    const nextTrav = [...travelers, trimmed];
    setTravelers(nextTrav);
    setNewTravelerName('');
    persist(expenses, nextTrav, baseCurrency);
  };

  const handleRemoveTraveler = (name: string) => {
    if (travelers.length <= 1) return;
    const nextTrav = travelers.filter((t) => t !== name);
    setTravelers(nextTrav);
    persist(expenses, nextTrav, baseCurrency);
  };

  const handlePrepopulate = () => {
    if (!tripPlan) return;
    const pre = generateExpensesFromPlan(tripPlan, travelers[0] || 'You', travelers);
    const merged = [...expenses, ...pre];
    setExpenses(merged);
    persist(merged, travelers, baseCurrency);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formAmount);
    if (!formTitle.trim() || isNaN(amountNum) || amountNum <= 0) return;

    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: formTitle.trim(),
      category: formCategory,
      amount: amountNum,
      currency: formCurrency,
      date: formDate,
      paidBy: formPaidBy,
      splitBetween: formSplitBetween.length > 0 ? formSplitBetween : [...travelers],
      notes: formNotes.trim() || undefined,
    };

    const nextExp = [newExpense, ...expenses];
    setExpenses(nextExp);
    persist(nextExp, travelers, baseCurrency);

    // Reset form
    setFormTitle('');
    setFormAmount('');
    setFormNotes('');
    setShowAddForm(false);
  };

  const handleDeleteExpense = (id: string) => {
    const nextExp = expenses.filter((e) => e.id !== id);
    setExpenses(nextExp);
    persist(nextExp, travelers, baseCurrency);
  };

  const handleExportCSV = () => {
    downloadExpensesCSV(expenses, 'TripPlanner', baseCurrency);
  };

  // Calculations
  const totalSpentInBase = useMemo(() => {
    return expenses.reduce((sum, exp) => {
      return sum + convertCurrency(exp.amount, exp.currency, baseCurrency);
    }, 0);
  }, [expenses, baseCurrency]);

  const categoryTotals = useMemo(() => {
    const totals: Record<ExpenseCategory, number> = {
      fuel: 0,
      charging: 0,
      tolls: 0,
      lodging: 0,
      food: 0,
      attractions: 0,
      parking: 0,
      misc: 0,
    };
    for (const exp of expenses) {
      const amt = convertCurrency(exp.amount, exp.currency, baseCurrency);
      totals[exp.category] = (totals[exp.category] || 0) + amt;
    }
    return totals;
  }, [expenses, baseCurrency]);

  const settlements = useMemo(() => {
    return calculateDebtSettlements(expenses, travelers, baseCurrency);
  }, [expenses, travelers, baseCurrency]);

  const filteredExpenses = useMemo(() => {
    if (filterCategory === 'all') return expenses;
    return expenses.filter((e) => e.category === filterCategory);
  }, [expenses, filterCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                Trip Ledger & Cost Splitter
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Track 8 expense categories, multiple currencies, and settle debts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Currency selector */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
              <span className="text-gray-400 font-medium">Base:</span>
              <select
                value={baseCurrency}
                onChange={(e) => handleBaseCurrencyChange(e.target.value as CurrencyCode)}
                className="font-bold text-gray-800 dark:text-white bg-transparent outline-none cursor-pointer"
              >
                {Object.keys(SUPPORTED_CURRENCIES).map((cur) => (
                  <option key={cur} value={cur} className="text-gray-800 dark:text-white dark:bg-gray-900">
                    {cur} ({SUPPORTED_CURRENCIES[cur as CurrencyCode].symbol})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Top Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-3.5 rounded-xl">
              <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Total Trip Expenses</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-0.5">
                {formatCurrency(totalSpentInBase, baseCurrency)}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                {expenses.length} transaction{expenses.length !== 1 ? 's' : ''} logged
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 p-3.5 rounded-xl">
              <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">Per-Traveler Average</p>
              <p className="text-xl sm:text-2xl font-black text-blue-900 dark:text-blue-100 mt-0.5">
                {formatCurrency(travelers.length > 0 ? totalSpentInBase / travelers.length : 0, baseCurrency)}
              </p>
              <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-1">
                Split across {travelers.length} traveler{travelers.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 p-3.5 rounded-xl flex flex-col justify-between">
              <div>
                <p className="text-xs text-purple-800 dark:text-purple-300 font-medium">Quick Actions</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    + Add Expense
                  </button>
                  {tripPlan && (
                    <button
                      type="button"
                      onClick={handlePrepopulate}
                      className="px-2.5 py-1 text-xs bg-white dark:bg-gray-800 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 font-medium rounded-lg transition-colors"
                      title="Load estimated fuel, EV charging, hotel & meals from current plan"
                    >
                      ⚡ Pre-populate Plan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={expenses.length === 0}
                    className="px-2.5 py-1 text-xs bg-white dark:bg-gray-800 hover:bg-gray-100 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 font-medium rounded-lg disabled:opacity-40 transition-colors"
                  >
                    ⬇ CSV
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Category Pills Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Category Breakdown
              </span>
              {filterCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((cat) => {
                const meta = EXPENSE_CATEGORIES[cat];
                const catTotal = categoryTotals[cat];
                const isSelected = filterCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(isSelected ? 'all' : cat)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900'
                        : 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <span className="font-bold opacity-80">
                      {formatCurrency(catTotal, baseCurrency, 0)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Travelers & Debt Settlement Card */}
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                  👥 Travelers ({travelers.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {travelers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-medium"
                    >
                      {t}
                      {travelers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTraveler(t)}
                          className="text-gray-400 hover:text-red-500 text-[10px]"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Add traveler input */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="New traveler name"
                  value={newTravelerName}
                  onChange={(e) => setNewTravelerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTraveler()}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-white outline-none w-32"
                />
                <button
                  type="button"
                  onClick={handleAddTraveler}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-800 dark:text-white font-medium rounded-lg"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Debt Settlement results */}
            {travelers.length > 1 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700/60">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                  Debt Settlement (Who owes whom)
                </p>
                {settlements.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    ✨ All balances are fully settled! No payments required.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {settlements.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800/80 border border-amber-200 dark:border-amber-800/50 text-xs"
                      >
                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                          {s.from} <span className="text-gray-400 font-normal">owes</span> {s.to}
                        </span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(s.amount, s.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add Expense Form Modal / Inline */}
          {showAddForm && (
            <form
              onSubmit={handleAddExpense}
              className="p-4 rounded-xl border-2 border-primary-500/40 bg-primary-50/20 dark:bg-primary-950/20 space-y-3 animate-fadeIn"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-primary-900 dark:text-primary-200 uppercase tracking-wide">
                  New Expense Entry
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Expense Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Highway Gas, Dinner at Trattoria, Museum tickets"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {EXPENSE_CATEGORIES[cat].icon} {EXPENSE_CATEGORIES[cat].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Currency
                  </label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value as CurrencyCode)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {Object.keys(SUPPORTED_CURRENCIES).map((cur) => (
                      <option key={cur} value={cur}>
                        {cur} ({SUPPORTED_CURRENCIES[cur as CurrencyCode].symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                    Paid By
                  </label>
                  <select
                    value={formPaidBy}
                    onChange={(e) => setFormPaidBy(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {travelers.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Split checkboxes */}
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Split Cost Between:
                </label>
                <div className="flex flex-wrap gap-2">
                  {travelers.map((t) => {
                    const isChecked = formSplitBetween.includes(t);
                    return (
                      <label key={t} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormSplitBetween([...formSplitBetween, t]);
                            } else {
                              setFormSplitBetween(formSplitBetween.filter((x) => x !== t));
                            }
                          }}
                          className="rounded text-primary-600"
                        />
                        <span>{t}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <input
                  type="text"
                  placeholder="Optional receipt notes or location"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg shadow transition-colors"
                >
                  Save Expense
                </button>
              </div>
            </form>
          )}

          {/* Expense List Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Transactions ({filteredExpenses.length})
              </h3>
              {expenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Clear all logged expenses?')) {
                      setExpenses([]);
                      persist([], travelers, baseCurrency);
                    }
                  }}
                  className="text-[11px] text-rose-500 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No expenses recorded yet
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Click &ldquo;+ Add Expense&rdquo; or &ldquo;⚡ Pre-populate Plan&rdquo; to begin tracking
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredExpenses.map((exp) => {
                  const cat = EXPENSE_CATEGORIES[exp.category] || EXPENSE_CATEGORIES.misc;
                  const converted = convertCurrency(exp.amount, exp.currency, baseCurrency);
                  const isConverted = exp.currency !== baseCurrency;

                  return (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                          {cat.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {exp.title}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                            <span>{exp.date}</span>
                            <span>•</span>
                            <span className="text-gray-600 dark:text-gray-300 font-medium">
                              Paid by {exp.paidBy}
                            </span>
                            <span>•</span>
                            <span>Split: {exp.splitBetween?.join(', ') || 'All'}</span>
                            {exp.notes && (
                              <>
                                <span>•</span>
                                <span className="italic truncate max-w-[150px]">{exp.notes}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        <div className="text-right">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">
                            {formatCurrency(exp.amount, exp.currency)}
                          </p>
                          {isConverted && (
                            <p className="text-[10px] text-gray-400">
                              ≈ {formatCurrency(converted, baseCurrency)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="text-gray-300 hover:text-rose-500 p-1 transition-colors"
                          title="Delete expense"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            {expenses.length} transaction{expenses.length !== 1 ? 's' : ''} • Base currency: {baseCurrency}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
