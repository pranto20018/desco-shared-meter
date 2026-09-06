export interface MainMeter {
  id: number;
  name: string;
  meter_label: string;
  created_at: string;
}

export interface UserMeter {
  id: number;
  main_meter_id: number;
  submitter: string;
  user_name: string;
  meter_number: string;
  passcode: string;
  color_index: number;
  created_at: string;
}

/** Same as UserMeter minus the passcode — safe to send to any signed-in viewer. */
export type PublicUserMeter = Omit<UserMeter, "passcode">;

export interface Recharge {
  id: number;
  main_meter_id: number;
  payer_id: number;
  recharged_at: string;
  month_year: string;
  amount: number;
  note: string;
  created_at: string;
}

/** A recharge with its payer's label resolved, for listings. */
export interface RechargeWithPayer extends Recharge {
  payer_submitter: string;
  payer_user_name: string;
  payer_color_index: number;
}

export interface MeterReading {
  id: number;
  main_meter_id: number;
  user_id: number;
  month_year: string;
  reading: number;
  updated_at: string;
}

export interface MainMeterReading {
  id: number;
  main_meter_id: number;
  month_year: string;
  reading: number;
  updated_at: string;
}

export interface Settlement {
  id: number;
  main_meter_id: number;
  from_user_id: number;
  to_user_id: number;
  settled_at: string;
  month_year: string;
  amount: number;
  note: string;
  created_at: string;
}

export interface SettlementWithNames extends Settlement {
  from_submitter: string;
  from_user_name: string;
  to_submitter: string;
  to_user_name: string;
}

/** One person's position within a single month. */
export interface CyclePerson {
  user_id: number;
  submitter: string;
  user_name: string;
  color_index: number;
  /** Closing reading for this month, null when it was never entered. */
  reading: number | null;
  previous_reading: number | null;
  units: number;
  /** units × rate — what this person's consumption cost. */
  cost: number;
  /** Total they recharged during the month. */
  paid: number;
  /**
   * Settlements handed over minus settlements received, within the month.
   * Carries the opposite sign to the balance it clears: paying someone raises
   * your balance, being paid lowers it.
   */
  settled: number;
  /** paid + settled − cost. Positive: owed money. Negative: owes money. */
  balance: number;
}

/** One month of the ledger for a single main meter. */
export interface Cycle {
  month_year: string;
  /** True once every sub-meter has both an opening and a closing reading. */
  complete: boolean;
  total_units: number;
  recharge_total: number;
  recharge_count: number;
  /** recharge_total ÷ total_units, or 0 when nothing was consumed. */
  rate: number;
  /** Main-meter units for the month, when both readings exist. */
  main_units: number | null;
  /** main_units − total_units. Positive means unaccounted consumption. */
  main_diff: number | null;
  people: CyclePerson[];
}

/** Everything the dashboards read, computed once per main meter. */
export interface LedgerView {
  meter: MainMeter;
  people: PublicUserMeter[];
  cycles: Cycle[];
  /** Newest first. */
  recharges: RechargeWithPayer[];
  settlements: SettlementWithNames[];
  /** Running totals across every complete cycle, per person. */
  totals: Array<{
    user_id: number;
    submitter: string;
    user_name: string;
    color_index: number;
    units: number;
    cost: number;
    paid: number;
    settled: number;
    balance: number;
  }>;
  /** Recharges made after the newest month that has a reading. */
  pending: {
    total: number;
    since_month: string | null;
    per_user: Array<{ user_id: number; amount: number }>;
  };
  months: string[];
}

export type Session =
  | { role: "admin" }
  | {
      role: "user";
      userId: number;
      mainMeterId: number;
      submitter: string;
      userName: string;
    };
