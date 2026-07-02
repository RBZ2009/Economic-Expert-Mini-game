import { GoodType, HousingTier, InvestmentType, LoanType, PlayerProfession, ProductionGoodType, PolicyType } from '@/types/game';

export type MultiplayerGameAction =
  | { type: 'WORK'; payload: Record<string, never> }
  | { type: 'OVERTIME_WORK'; payload: Record<string, never> }
  | { type: 'WORKER_TRAINING'; payload: { cost: number } }
  | { type: 'NEGOTIATE_WAGE'; payload: Record<string, never> }
  | { type: 'SWITCH_JOB'; payload: Record<string, never> }
  | { type: 'SIDE_JOB'; payload: Record<string, never> }
  | { type: 'BUY_GOOD'; payload: { goodType: GoodType; quantity: number } }
  | { type: 'SELL_GOOD'; payload: { goodType: GoodType; quantity: number } }
  | { type: 'SELL_COMPANY_PRODUCT'; payload: { quantity: number; pricePerUnit: number; productType?: ProductionGoodType } }
  | { type: 'SET_PRODUCTION_TYPE'; payload: { productionType: 'daily_necessities' | 'food' | 'entertainment' | 'luxury' } }
  | { type: 'RENT_HOUSE'; payload: { tier: HousingTier } }
  | { type: 'BUY_HOUSE'; payload: { tier: HousingTier } }
  | { type: 'SELL_HOUSE'; payload: Record<string, never> }
  | { type: 'CANCEL_RENT'; payload: Record<string, never> }
  | { type: 'INVEST'; payload: { investmentType: InvestmentType; amount: number } }
  | { type: 'CASH_OUT_ALL_INVESTMENT'; payload: { type: InvestmentType } }
  | { type: 'TAKE_LOAN'; payload: { loanType: LoanType; amount: number } }
  | { type: 'REPAY_LOAN'; payload: { loanId: string; amount: number } }
  | { type: 'HIRE_EMPLOYEE'; payload: { count: number } }
  | { type: 'BUY_MACHINE'; payload: { machineType: 'basic' | 'advanced' | 'automated' } }
  | { type: 'BUY_MATERIALS'; payload: { quantity: number } }
  | { type: 'FIRE_EMPLOYEE'; payload: { count: number } }
  | { type: 'UPGRADE_MACHINE'; payload: Record<string, never> }
  | { type: 'ADVERTISE'; payload: { amount: number } }
  | { type: 'ADJUST_WAGES'; payload: { amount: number } }
  | { type: 'UPGRADE_QUALITY'; payload: { amount: number } }
  | { type: 'PRODUCE_GOODS'; payload: { quantity: number } }
  | { type: 'SET_TAX_RATE'; payload: { rate: number } }
  | { type: 'ENACT_POLICY'; payload: { policyType: PolicyType; explanation?: string } }
  | { type: 'RATE_GOVERNMENT'; payload: { governmentId: string; score: number } }
  | { type: 'ISSUE_SUBSIDY'; payload: { amount: number; target: 'all' | 'worker' | 'entrepreneur' } }
  | { type: 'STABILIZE_SOCIETY'; payload: { amount: number } }
  | { type: 'BUILD_PUBLIC_SERVICE'; payload: { amount: number } }
  | { type: 'INVESTMENT_STUDY'; payload: { cost: number } }
  | { type: 'END_TURN'; payload: Record<string, never> };

export type MultiplayerGameActionType = MultiplayerGameAction['type'];

const goodTypes = ['food', 'daily_necessities', 'housing', 'transportation', 'entertainment', 'luxury', 'education', 'healthcare'] as const;
const housingTiers = ['economy', 'standard', 'luxury'] as const;
const investmentTypes = ['stock', 'bond', 'gold', 'deposit'] as const;
const productionTypes = ['daily_necessities', 'food', 'entertainment', 'luxury'] as const;
const machineTypes = ['basic', 'advanced', 'automated'] as const;
const subsidyTargets = ['all', 'worker', 'entrepreneur'] as const;
const professions = ['worker', 'entrepreneur', 'investor', 'government'] as const;
const loanTypes = ['consumer', 'mortgage', 'business'] as const;
const policyTypes = ['tax_raise', 'tax_cut', 'subsidy_all', 'subsidy_poor', 'subsidy_business', 'infrastructure', 'wage_control', 'price_control', 'import_tariff', 'export_promotion'] as const;

type LiteralArray = readonly string[];

export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends LiteralArray>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value);
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function positiveInteger(value: unknown, max = 100000): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value <= 0 || value > max) return null;
  return value;
}

function emptyPayload(actionType: MultiplayerGameAction['type']): MultiplayerGameAction {
  return { type: actionType, payload: {} } as MultiplayerGameAction;
}

export function validatePlayerProfession(value: unknown): value is PlayerProfession {
  return isOneOf(value, professions);
}

export function validateGameAction(raw: unknown): ValidationResult<MultiplayerGameAction> {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return { success: false, error: '操作格式无效' };
  }

  const payload = isRecord(raw.payload) ? raw.payload : {};

  switch (raw.type) {
    case 'WORK':
    case 'OVERTIME_WORK':
    case 'NEGOTIATE_WAGE':
    case 'SWITCH_JOB':
    case 'SIDE_JOB':
    case 'SELL_HOUSE':
    case 'CANCEL_RENT':
    case 'UPGRADE_MACHINE':
    case 'END_TURN':
      return { success: true, value: emptyPayload(raw.type) };

    case 'BUY_GOOD':
    case 'SELL_GOOD': {
      if (!isOneOf(payload.goodType, goodTypes)) return { success: false, error: '商品类型无效' };
      const quantity = positiveInteger(payload.quantity, 999);
      if (quantity === null) return { success: false, error: '数量必须是正整数' };
      return { success: true, value: { type: raw.type, payload: { goodType: payload.goodType, quantity } } };
    }

    case 'SELL_COMPANY_PRODUCT': {
      const quantity = positiveInteger(payload.quantity, 100000);
      const pricePerUnit = numberInRange(payload.pricePerUnit, 1, 100000);
      if (quantity === null || pricePerUnit === null) return { success: false, error: '出售数量或单价无效' };
      const productType = payload.productType === undefined ? undefined : payload.productType;
      if (productType !== undefined && !isOneOf(productType, productionTypes)) return { success: false, error: '商品类型无效' };
      return { success: true, value: { type: raw.type, payload: { quantity, pricePerUnit, productType } } };
    }

    case 'SET_PRODUCTION_TYPE':
      if (!isOneOf(payload.productionType, productionTypes)) return { success: false, error: '生产类型无效' };
      return { success: true, value: { type: raw.type, payload: { productionType: payload.productionType } } };

    case 'RENT_HOUSE':
    case 'BUY_HOUSE':
      if (!isOneOf(payload.tier, housingTiers)) return { success: false, error: '住房类型无效' };
      return { success: true, value: { type: raw.type, payload: { tier: payload.tier } } };

    case 'INVEST': {
      if (!isOneOf(payload.investmentType, investmentTypes)) return { success: false, error: '投资类型无效' };
      const amount = numberInRange(payload.amount, 1, 1_000_000_000);
      if (amount === null) return { success: false, error: '投资金额无效' };
      return { success: true, value: { type: raw.type, payload: { investmentType: payload.investmentType, amount } } };
    }

    case 'CASH_OUT_ALL_INVESTMENT':
      if (!isOneOf(payload.type, investmentTypes)) return { success: false, error: '投资类型无效' };
      return { success: true, value: { type: raw.type, payload: { type: payload.type } } };

    case 'TAKE_LOAN': {
      if (!isOneOf(payload.loanType, loanTypes)) return { success: false, error: '贷款类型无效' };
      const amount = numberInRange(payload.amount, 1000, 5_000_000);
      if (amount === null) return { success: false, error: '贷款金额无效' };
      return { success: true, value: { type: raw.type, payload: { loanType: payload.loanType, amount } } };
    }

    case 'REPAY_LOAN': {
      if (typeof payload.loanId !== 'string' || payload.loanId.length === 0) return { success: false, error: '贷款编号无效' };
      const amount = numberInRange(payload.amount, 1, 5_000_000);
      if (amount === null) return { success: false, error: '还款金额无效' };
      return { success: true, value: { type: raw.type, payload: { loanId: payload.loanId, amount } } };
    }

    case 'HIRE_EMPLOYEE':
    case 'FIRE_EMPLOYEE':
    case 'BUY_MATERIALS':
    case 'PRODUCE_GOODS': {
      const quantity = positiveInteger(payload.count ?? payload.quantity, 100000);
      if (quantity === null) return { success: false, error: '数量必须是正整数' };
      if (raw.type === 'HIRE_EMPLOYEE' || raw.type === 'FIRE_EMPLOYEE') {
        return { success: true, value: { type: raw.type, payload: { count: quantity } } };
      }
      return { success: true, value: { type: raw.type, payload: { quantity } } };
    }

    case 'BUY_MACHINE':
      if (!isOneOf(payload.machineType, machineTypes)) return { success: false, error: '机器类型无效' };
      return { success: true, value: { type: raw.type, payload: { machineType: payload.machineType } } };

    case 'ADVERTISE':
    case 'ADJUST_WAGES':
    case 'UPGRADE_QUALITY':
    case 'STABILIZE_SOCIETY':
    case 'BUILD_PUBLIC_SERVICE':
    case 'WORKER_TRAINING':
    case 'INVESTMENT_STUDY': {
      const amount = numberInRange(payload.amount ?? payload.cost, 1, 1_000_000_000);
      if (amount === null) return { success: false, error: '金额无效' };
      if (raw.type === 'INVESTMENT_STUDY') {
        return { success: true, value: { type: raw.type, payload: { cost: amount } } };
      }
      if (raw.type === 'WORKER_TRAINING') {
        return { success: true, value: { type: raw.type, payload: { cost: amount } } };
      }
      return { success: true, value: { type: raw.type, payload: { amount } } };
    }

    case 'SET_TAX_RATE': {
      const rate = numberInRange(payload.rate, 0, 1);
      if (rate === null) return { success: false, error: '税率无效' };
      return { success: true, value: { type: raw.type, payload: { rate } } };
    }

    case 'ENACT_POLICY': {
      if (!isOneOf(payload.policyType, policyTypes)) return { success: false, error: '政策类型无效' };
      const explanation = typeof payload.explanation === 'string' ? payload.explanation.slice(0, 120) : undefined;
      return { success: true, value: { type: raw.type, payload: { policyType: payload.policyType, explanation } } };
    }

    case 'RATE_GOVERNMENT': {
      if (typeof payload.governmentId !== 'string' || payload.governmentId.length === 0) return { success: false, error: '政府玩家无效' };
      const score = numberInRange(payload.score, 1, 5);
      if (score === null) return { success: false, error: '评分必须在 1-5 之间' };
      return { success: true, value: { type: raw.type, payload: { governmentId: payload.governmentId, score } } };
    }

    case 'ISSUE_SUBSIDY': {
      const amount = numberInRange(payload.amount, 1, 1_000_000_000);
      if (amount === null) return { success: false, error: '补贴金额无效' };
      if (!isOneOf(payload.target, subsidyTargets)) return { success: false, error: '补贴对象无效' };
      return { success: true, value: { type: raw.type, payload: { amount, target: payload.target } } };
    }

    default:
      return { success: false, error: '未知操作' };
  }
}
