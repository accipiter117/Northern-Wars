// Loans from the Vivaldi bank (M21). The crown borrows a fixed sum and pays
// it back month by month with interest. A payment the treasury cannot meet
// is missed: the bank raises the rate, adds the payment to the end, and the
// lords take note of a crown that cannot pay its debts. What the crown may
// owe on loans is capped by its income.
import { nudge } from './meters.js';
import { addDispatch } from './realm.js';
import { ledgerNet, windfall } from './economy.js';
import { number } from './text.js';

const L = (world) => world.economy.loans;
const say = (state, text) => addDispatch(state, text, 'treasury');

export function monthlyPayment(principal, rate, months) {
  return (principal * (1 + rate * months)) / months;
}

// What the crown still owes on all its loans.
export function owedOnLoans(state) {
  return (state.loans ?? []).reduce((a, l) => a + l.payment * l.left, 0);
}

// The realm's monthly income, the mean of the last three months.
export function monthlyIncome(state, world) {
  const h = (state.ledger?.history ?? []).slice(-3);
  const mean = h.length ? h.reduce((a, x) => a + ledgerNet(x).in, 0) / h.length : 0;
  return Math.max(L(world)?.minIncome ?? 0, mean);
}

export function loanCap(state, world) {
  return Math.round(monthlyIncome(state, world) * L(world).capMonths);
}

export function loanTerms(state, world, sum) {
  const c = L(world);
  const payment = monthlyPayment(sum, c.rate, c.months);
  return { sum, months: c.months, payment: Math.round(payment), total: Math.round(payment * c.months), rate: c.rate };
}

export function canBorrow(state, world, sum) {
  const c = L(world);
  if (!c) return { ok: false, reason: 'No bank lends here.' };
  if (!c.sums.includes(sum)) return { ok: false, reason: 'The bank lends only set sums.' };
  const t = loanTerms(state, world, sum);
  const cap = loanCap(state, world);
  if (owedOnLoans(state) + t.total > cap) return { ok: false, reason: `The bank will not have us owe more than ${number(cap)} on loans (six months of our income).` };
  return { ok: true, terms: t };
}

export function borrow(state, world, sum) {
  const c = L(world);
  const t = loanTerms(state, world, sum);
  state.nextLoanId = (state.nextLoanId ?? 0) + 1;
  (state.loans ??= []).push({ id: state.nextLoanId, sum, payment: t.payment, left: c.months, rate: c.rate, missed: 0, day: state.day });
  windfall(state, 'borrowed', sum);
  say(state, `${c.lender[0].toUpperCase()}${c.lender.slice(1)} lends the crown ${number(sum)} crowns: ${c.months} payments of ${number(t.payment)}.`);
}

// Pay off a loan at once: what is left of the principal, and a month's
// interest for the trouble.
export function payOffCost(state, world, id) {
  const l = (state.loans ?? []).find((x) => x.id === id);
  if (!l) return null;
  const c = L(world);
  const principalLeft = (l.sum * l.left) / c.months;
  return Math.round(principalLeft * (1 + l.rate));
}

export function canPayOff(state, world, id) {
  const cost = payOffCost(state, world, id);
  if (cost === null) return { ok: false, reason: 'No such loan.' };
  if (state.treasury < cost) return { ok: false, reason: `It would take ${number(cost)} crowns.` };
  return { ok: true, cost };
}

export function payOff(state, world, id) {
  const cost = payOffCost(state, world, id);
  state.treasury -= cost;
  state.ledger.decrees = (state.ledger.decrees ?? 0) + cost;
  state.loans = state.loans.filter((x) => x.id !== id);
  say(state, `The crown pays off its loan: ${number(cost)} crowns, and the bank is satisfied.`);
}

// The month's payments, from the ledger. `available` is what the treasury
// will hold before them; a payment it cannot cover is missed.
export function loanLedger(state, world, expenses, available) {
  const c = L(world);
  if (!c || !state.loans?.length) return;
  expenses.loans = 0;
  let room = available;
  for (const l of state.loans) {
    if (room >= l.payment) {
      expenses.loans += l.payment;
      room -= l.payment;
      l.left -= 1;
      continue;
    }
    // Missed: dearer, longer, and the lords see it.
    l.missed += 1;
    l.rate += c.missedRate;
    const remaining = l.payment * l.left;
    l.left += 1;
    l.payment = Math.round((remaining * (1 + c.missedRate * l.left)) / l.left);
    nudge(state, world, 'love', -c.missedLove, 'A loan payment missed');
    say(state, `The crown misses a payment to ${c.lender}. The bank raises its rate, and the lords hear of it.`);
  }
  state.loans = state.loans.filter((l) => l.left > 0);
}
