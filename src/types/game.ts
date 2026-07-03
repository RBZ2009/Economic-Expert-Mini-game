// ============================================================
// 游戏核心类型定义 - 经济模拟游戏 v2.2
// ============================================================

// ------------------- 基础枚举 -------------------

export type GamePhase = 
  | 'setup'           // 游戏设置阶段
  | 'news'            // 回合开始新闻播报
  | 'player_turn'     // 玩家操作阶段
  | 'trade_pending'   // 等待交易确认
  | 'event'           // 随机事件阶段
  | 'settlement'      // 回合结算阶段
  | 'confirm_turn_end' // 确认回合结束
  | 'game_over';      // 游戏结束

// 职业（互斥）
export type PlayerProfession = 
  | 'worker'          // 员工
  | 'entrepreneur'    // 企业家
  | 'investor'        // 投资者
  | 'government';      // 政府官员

export type GameMode = 'simple' | 'professional';

// 身份属性
export type PlayerAttribute = 
  | 'consumer'         // 消费者（默认所有人都有）
  | 'investor'         // 投资者
  | 'landlord';        // 房东

// 商品类型
export type GoodType = 
  | 'food'            // 食品
  | 'daily_necessities' // 日用品
  | 'housing'         // 住房
  | 'transportation'  // 交通
  | 'entertainment'   // 娱乐
  | 'luxury'          // 奢侈品
  | 'education'       // 教育
  | 'healthcare';     // 医疗

// 住房档次
export type HousingTier = 'economy' | 'standard' | 'luxury';

// 住房状态
export type HousingStatus = 'none' | 'renting' | 'owned';

// 投资类型
export type InvestmentType =
  | 'stock'           // 股票
  | 'bond'            // 债券
  | 'gold'            // 黄金
  | 'deposit';        // 银行存款

export type LoanType =
  | 'consumer'
  | 'mortgage'
  | 'business';

export type IndustryType =
  | 'food'
  | 'daily_necessities'
  | 'entertainment'
  | 'luxury'
  | 'public_service'
  | 'finance';

// 经济周期（美林时钟）
export type EconomicCycle = 
  | 'overheating'     // 过热期 - 股票📈/债券📉/黄金📉/存款📉
  | 'growth'          // 繁荣期 - 股票📈/债券📈/黄金📈/存款📈
  | 'downturn'        // 衰退期 - 股票📉/债券📈/黄金📈/存款📈
  | 'contraction';     // 萧条期 - 股票📉/债券📉/黄金📈/存款📈

// 政府政策类型
export type PolicyType =
  | 'tax_raise'        // 提高税率
  | 'tax_cut'          // 减税
  | 'subsidy_all'      // 全民补贴
  | 'subsidy_poor'     // 扶贫补贴
  | 'subsidy_business' // 企业补贴
  | 'infrastructure'   // 基建投资
  | 'wage_control'     // 工资调控
  | 'price_control'    // 价格管控
  | 'import_tariff'    // 进口关税
  | 'export_promotion'; // 出口促进

// 事件类型
export type EventType = 
  | 'economic_crisis'   // 经济危机
  | 'tech_breakthrough' // 技术突破
  | 'natural_disaster'  // 自然灾害
  | 'policy_change'     // 政策变化
  | 'market_boom'       // 市场繁荣
  | 'inflation_surge'   // 通胀飙升
  | 'downturn'          // 经济衰退
  | 'growth';          // 政策刺激

// ------------------- 商品效果定义 -------------------

export interface GoodEffect {
  happiness: number;    // 幸福度变化
  health: number;       // 健康值变化
  socialStatus: number; // 社会地位变化
  incomeBonus: number;  // 收入加成（百分比）
}

export type GoodCategory = 'consumable' | 'durable' | 'housing';

// 商品详细配置
export interface GoodConfig {
  id: GoodType;
  name: string;
  icon: string;
  category: GoodCategory;
  
  // 基础价格
  basePrice: number;
  currentPrice: number;
  priceHistory: number[];
  elasticity: number;
  
  // 是否必需品
  essential: boolean;
  
  // 消耗品每轮消耗量
  consumptionRate: number;
  
  // 效果
  effect: GoodEffect;
  
  // 耐久度（耐用品）
  durability?: number;
  currentDurability?: number;
}

// 住房配置
export interface HousingConfig {
  tier: HousingTier;
  name: string;
  icon: string;
  purchasePrice: number;
  rentPrice: number;       // 月租
  effect: GoodEffect;
  description: string;
}

export const HOUSING_CONFIGS: Record<HousingTier, HousingConfig> = {
  economy: {
    tier: 'economy',
    name: '经济房',
    icon: '🏚️',
    purchasePrice: 50000,
    rentPrice: 2000,
    effect: { happiness: 5, health: 0, socialStatus: 0, incomeBonus: 0 },
    description: '基本住所，满足生活需求'
  },
  standard: {
    tier: 'standard',
    name: '标准房',
    icon: '🏠',
    purchasePrice: 150000,
    rentPrice: 5000,
    effect: { happiness: 10, health: 2, socialStatus: 5, incomeBonus: 0.05 },
    description: '舒适的居所，提升生活质量'
  },
  luxury: {
    tier: 'luxury',
    name: '豪华房',
    icon: '🏰',
    purchasePrice: 500000,
    rentPrice: 15000,
    effect: { happiness: 20, health: 5, socialStatus: 15, incomeBonus: 0.1 },
    description: '尊贵的身份象征，带来额外收入加成'
  }
};

// 经济周期对投资的影响系数
export const CYCLE_MULTIPLIERS: Record<EconomicCycle, Record<InvestmentType, number>> = {
  overheating: {   // 过热期：通胀高，股票好
    stock: 1.5,
    bond: 0.7,
    gold: 1.3,
    deposit: 0.8
  },
  growth: {        // 繁荣期：全面增长
    stock: 1.3,
    bond: 1.1,
    gold: 1.1,
    deposit: 1.0
  },
  downturn: {      // 衰退期：债券和存款防御性好
    stock: 0.6,
    bond: 1.4,
    gold: 1.2,
    deposit: 1.1
  },
  contraction: {   // 萧条期：黄金和存款最安全
    stock: 0.4,
    bond: 0.9,
    gold: 1.5,
    deposit: 1.2
  }
};

// 经济周期名称
export const CYCLE_NAMES: Record<EconomicCycle, { name: string; icon: string; description: string }> = {
  overheating: { name: '过热期', icon: '🔥', description: '经济过热，通胀上升，央行可能加息' },
  growth: { name: '繁荣期', icon: '📈', description: '经济强劲增长，企业盈利上升' },
  downturn: { name: '衰退期', icon: '📉', description: '经济增长放缓，股市动荡' },
  contraction: { name: '萧条期', icon: '❄️', description: '经济萎缩，需要政策刺激' }
};

// 投资配置
export const INVESTMENT_CONFIGS: Record<InvestmentType, {
  name: string;
  icon: string;
  baseReturn: number;
  volatility: number;
  riskWeight: number;
  description: string;
}> = {
  stock: {
    name: '股票',
    icon: '📊',
    baseReturn: 0.08,
    volatility: 0.25,
    riskWeight: 1.4,
    description: '高风险高收益，受市场影响大'
  },
  bond: {
    name: '债券',
    icon: '📜',
    baseReturn: 0.04,
    volatility: 0.05,
    riskWeight: 0.45,
    description: '稳定收益，风险较低'
  },
  gold: {
    name: '黄金',
    icon: '🥇',
    baseReturn: 0.02,
    volatility: 0.1,
    riskWeight: 0.8,
    description: '抗通胀，但无利息收益'
  },
  deposit: {
    name: '银行存款',
    icon: '🏦',
    baseReturn: 0.02,
    volatility: 0,
    riskWeight: 0.05,
    description: '最稳定，有固定利息'
  }
};

export const ECONOMY_BALANCE = {
  timeUnit: 'month',
  startingCash: {
    worker: 10000,
    entrepreneur: 50000,
    investor: 20000,
    government: 10000,
  } satisfies Record<PlayerProfession, number>,
  worker: {
    baseWage: 5000,
    overtimeMultiplier: 0.65,
    trainingCost: 2500,
    trainingSkillGain: 8,
    sideJobIncome: 1800,
    sideJobFatigue: 22,
    sideJobHappinessCost: 5,
    jobSwitchCost: 800,
    jobSwitchWageGain: 1.12,
    unemploymentBaseRisk: 0.04,
    unemploymentLowEmploymentRisk: 0.16,
  },
  company: {
    hiringCostPerEmployee: 1500,
    wagePerEmployee: 3000,
    employeeCapacity: 150,
    machineCapacity: 220,
    materialPrice: 12,
    processingCostPerUnit: 5,
    salesTaxRate: 0.1,
    qualityUpgradeCost: 4000,
    qualityUpgradeGain: 8,
    bankruptcyLimit: -20000,
  },
  bank: {
    baseRate: 0.006,
    depositRateSpread: -0.003,
    loanRiskSpread: {
      consumer: 0.012,
      mortgage: 0.004,
      business: 0.008,
    } satisfies Record<LoanType, number>,
    defaultGraceCash: -5000,
  },
  investment: {
    transactionFeeRate: 0.005,
    capitalGainsTaxRate: 0.12,
    informationErrorBaseChance: 0.24,
    informationErrorSkillReduction: 0.002,
  },
  events: {
    normalProbability: 0.35,
    majorProbability: 0.08,
  },
} as const;

// 政府政策配置
export const POLICY_CONFIGS: Record<PolicyType, {
  name: string;
  icon: string;
  description: string;
  cost: number;
  effect: {
    taxRate?: number;
    socialStability?: number;
    inflation?: number;
    employment?: number;
    happiness?: number;
  };
  cooldown: number;
}> = {
  tax_raise: {
    name: '提高税率',
    icon: '📋',
    description: '增加政府收入，但可能降低社会稳定',
    cost: 0,
    effect: { socialStability: -3 },
    cooldown: 2
  },
  tax_cut: {
    name: '减税政策',
    icon: '📄',
    description: '刺激经济增长，提高社会稳定',
    cost: 5000,
    effect: { socialStability: 5, inflation: 0.01 },
    cooldown: 3
  },
  subsidy_all: {
    name: '全民补贴',
    icon: '💵',
    description: '向所有公民发放补贴，提高幸福度',
    cost: 10000,
    effect: { happiness: 5, socialStability: 3, inflation: 0.02 },
    cooldown: 3
  },
  subsidy_poor: {
    name: '扶贫计划',
    icon: '🤝',
    description: '定向帮助低收入群体，缩小贫富差距',
    cost: 5000,
    effect: { happiness: 3, socialStability: 5 },
    cooldown: 2
  },
  subsidy_business: {
    name: '企业扶持',
    icon: '🏭',
    description: '补贴企业，促进就业',
    cost: 8000,
    effect: { employment: 5, socialStability: 2 },
    cooldown: 3
  },
  infrastructure: {
    name: '基建投资',
    icon: '🏗️',
    description: '大型基础设施建设，刺激经济',
    cost: 20000,
    effect: { employment: 8, socialStability: 5, inflation: 0.01 },
    cooldown: 5
  },
  wage_control: {
    name: '最低工资',
    icon: '⚖️',
    description: '提高最低工资标准，保障劳动者',
    cost: 0,
    effect: { happiness: 5, employment: -3 },
    cooldown: 4
  },
  price_control: {
    name: '价格管控',
    icon: '📐',
    description: '限制必需品价格上涨',
    cost: 3000,
    effect: { inflation: -0.03, socialStability: 3 },
    cooldown: 2
  },
  import_tariff: {
    name: '进口关税',
    icon: '🚢',
    description: '保护本国产业，可能影响就业',
    cost: 0,
    effect: { employment: 3, inflation: 0.02 },
    cooldown: 4
  },
  export_promotion: {
    name: '出口促进',
    icon: '✈️',
    description: '补贴出口企业，增加外汇收入',
    cost: 10000,
    effect: { employment: 5, inflation: -0.01 },
    cooldown: 3
  }
};

// ==================== 商品详细效果表 ====================

export const GOOD_EFFECTS_INFO: Record<GoodType, {
  name: string;
  icon: string;
  effect: GoodEffect;
  consumptionRate: number;
  essential: boolean;
  description: string;
  tips: string;
}> = {
  food: {
    name: '食品',
    icon: '🍎',
    effect: { happiness: 3, health: 5, socialStatus: 0, incomeBonus: 0 },
    consumptionRate: 2,
    essential: true,
    description: '维持生命必需，每轮消耗',
    tips: '必需品！不足会影响健康和幸福'
  },
  daily_necessities: {
    name: '日用品',
    icon: '🧴',
    effect: { happiness: 2, health: 1, socialStatus: 0, incomeBonus: 0 },
    consumptionRate: 1,
    essential: true,
    description: '日常生活所需，每轮消耗',
    tips: '必需品！包括洗漱用品、清洁用品等'
  },
  housing: {
    name: '住房',
    icon: '🏠',
    effect: { happiness: 5, health: 0, socialStatus: 5, incomeBonus: 0 },
    consumptionRate: 0,
    essential: true,
    description: '提供居住场所，租/买两种方式',
    tips: '无住房会降低幸福度！可租可买'
  },
  transportation: {
    name: '交通',
    icon: '🚗',
    effect: { happiness: 2, health: 0, socialStatus: 2, incomeBonus: 0.05 },
    consumptionRate: 0,
    essential: false,
    description: '提高出行便利，增加收入效率',
    tips: '可提升工作收入5%'
  },
  entertainment: {
    name: '娱乐',
    icon: '🎮',
    effect: { happiness: 10, health: 0, socialStatus: 0, incomeBonus: 0 },
    consumptionRate: 1,
    essential: false,
    description: '休闲娱乐，每轮消耗',
    tips: '提升幸福度，但非必需品'
  },
  luxury: {
    name: '奢侈品',
    icon: '💎',
    effect: { happiness: 15, health: 0, socialStatus: 20, incomeBonus: 0 },
    consumptionRate: 0,
    essential: false,
    description: '提升身份地位，一次性购买',
    tips: '大幅提升社会地位！'
  },
  education: {
    name: '教育',
    icon: '📚',
    effect: { happiness: 5, health: 0, socialStatus: 10, incomeBonus: 0.1 },
    consumptionRate: 0,
    essential: false,
    description: '提升社会地位，增加收入潜力',
    tips: '长期投资，永久提升收入10%'
  },
  healthcare: {
    name: '医疗',
    icon: '🏥',
    effect: { happiness: 5, health: 20, socialStatus: 0, incomeBonus: 0 },
    consumptionRate: 0,
    essential: false,
    description: '恢复健康，购买后立即生效',
    tips: '健康值低时购买效果最佳'
  }
};

// ------------------- 工作状态 -------------------

export interface WorkState {
  workCount: number;      // 本轮已工作次数
  fatigueLevel: number;   // 疲劳度 0-100
  lastWorkTime?: number;
  overtimeCount?: number;
  monthlySalaryPaidRound?: number;
  forcedRestRounds?: number;
}

// ------------------- 职业配置 -------------------

export interface ProfessionConfig {
  id: PlayerProfession;
  name: string;
  icon: string;
  description: string;
  baseIncome: number;
  incomeDescription: string;
  goals: string[];
  abilities: string[];
  specialAbilities: string[];
  workCooldown: number;
  maxWorkPerRound: number;
}

export const PROFESSION_CONFIGS: Record<PlayerProfession, ProfessionConfig> = {
  worker: {
    id: 'worker',
    name: '员工',
    icon: '👷',
    description: '通过劳动获取工资，养家糊口',
    baseIncome: 5000,
    incomeDescription: '月薪 ¥5,000/次',
    goals: ['提高幸福度', '保障基本生活', '积累财富'],
    abilities: ['工作赚钱', '购买必需品'],
    specialAbilities: [],
    workCooldown: 1,
    maxWorkPerRound: 1
  },
  entrepreneur: {
    id: 'entrepreneur',
    name: '企业家',
    icon: '🏢',
    description: '经营企业，追求利润最大化',
    baseIncome: 0,
    incomeDescription: '企业经营收入',
    goals: ['最大化企业利润', '扩大经营规模', '提升市场地位'],
    abilities: ['雇佣员工', '购买机器', '生产商品', '定价销售', '企业融资', '市场分析'],
    specialAbilities: ['企业经营管理'],
    workCooldown: 0,
    maxWorkPerRound: 3
  },
  investor: {
    id: 'investor',
    name: '投资者',
    icon: '📈',
    description: '通过投资获取收益',
    baseIncome: 0,
    incomeDescription: '投资收益',
    goals: ['资产增值', '多元化投资', '风险控制'],
    abilities: ['股票交易', '房产买卖', '债券投资', '黄金投资'],
    specialAbilities: ['投资分析', '市场洞察'],
    workCooldown: 1,
    maxWorkPerRound: 2
  },
  government: {
    id: 'government',
    name: '政府官员',
    icon: '🏛️',
    description: '调控经济，维护社会稳定',
    baseIncome: 15000,
    incomeDescription: '财政预算 ¥15,000/轮',
    goals: ['社会稳定', '公平分配', '经济稳健发展'],
    abilities: ['制定税率', '发放补贴', '起草政策', '经济调控'],
    specialAbilities: ['宏观调控', '政策制定'],
    workCooldown: 2,
    maxWorkPerRound: 2
  }
};

// ------------------- 企业系统 -------------------

export interface Company {
  id: string;
  ownerId: string;
  name: string;
  employees: number;
  machines: number;
  rawMaterials: number;
  inventory: number;           // 总库存数量（由分商品库存汇总，保留用于兼容旧界面）
  productInventory?: Record<ProductionGoodType, number>;
  priceDecisions?: Partial<Record<ProductionGoodType, {
    price: number;
    round: number;
  }>>;
  salesDecisions?: Partial<Record<ProductionGoodType, {
    round: number;
    price: number;
    requested: number;
    sold: number;
    grossRevenue: number;
    netRevenue: number;
  }>>;
  productionCapacity: number;
  productionCost: number;
  productQuality: number;
  revenue: number;
  costs: number;
  profit: number;
  marketShare: number;
  stockPrice: number;
  fixedCosts: number;
  depreciation: number;
  financingCosts: number;
  inventoryHoldingCost: number;
  industry: IndustryType;
  
  // 现金流记录（每月结算时更新）
  cashFlow: {
    initial: number;      // 期初现金
    income: number;        // 本期收入
    expenses: number;      // 本期支出
    final: number;         // 期末现金
    wages: number;         // 工资支出
    productionCosts: number; // 生产成本（包含原材料和加工费）
    otherCosts: number;    // 其他支出
  };
  balanceSheet: {
    cash: number;
    debt: number;
    equity: number;
    inventoryValue: number;
    retainedEarnings: number;
  };
  incomeStatement: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    operatingProfit: number;
    netProfit: number;
    taxes: number;
    interestExpense: number;
  };
  
  // 运营指标
  efficiency: number;      // 生产效率
  morale: number;          // 员工士气
  reputation: number;      // 企业声誉
  
  // 生产配置
  productionType: ProductionGoodType;  // 当前生产的商品类型
  
  // 自动生产设定
  autoProduction: {
    enabled: boolean;           // 是否启用自动生产
    monthlyTarget: number;     // 每月生产目标数量
  };
  
  // 企业运营统计
  stats: {
    totalProduced: number;       // 累计生产数量
    totalSold: number;          // 累计销售数量
    totalRevenue: number;        // 累计收入
    totalCosts: number;          // 累计成本
    monthlyProfit: number;       // 本月利润
  };

  // 本轮已生产数量（每轮重置）
  productionUsedThisRound: number;
}

// 企业生产商品配置
export interface ProductionConfig {
  id: ProductionGoodType;
  name: string;
  icon: string;
  description: string;
  baseProductionCost: number;   // 基础生产成本（不含原材料）
  baseMaterialCost: number;     // 基础原材料成本
  baseSellingPrice: number;     // 基础售价
  minSellingPrice: number;
  maxSellingPrice: number;
  materialConsumption: number;  // 每单位消耗原材料
  capacityCost: number;         // 每单位消耗产能点
  marketDemand: number;         // 市场需求系数（影响销量）
  demandElasticity: number;
}

export type ProductionGoodType = 'daily_necessities' | 'food' | 'entertainment' | 'luxury';

export const PRODUCTION_CONFIGS: Record<ProductionGoodType, ProductionConfig> = {
  daily_necessities: {
    id: 'daily_necessities',
    name: '日用品',
    icon: '🧴',
    description: '生活必需品，需求稳定',
    baseProductionCost: 3,
    baseMaterialCost: 8,
    baseSellingPrice: 36,
    minSellingPrice: 28,
    maxSellingPrice: 52,
    materialConsumption: 1,
    capacityCost: 1,
    marketDemand: 1.08,
    demandElasticity: 0.55,
  },
  food: {
    id: 'food',
    name: '食品',
    icon: '🍎',
    description: '食品类商品，消耗较快',
    baseProductionCost: 3,
    baseMaterialCost: 7,
    baseSellingPrice: 30,
    minSellingPrice: 22,
    maxSellingPrice: 42,
    materialConsumption: 0.9,
    capacityCost: 0.75,
    marketDemand: 1.28,
    demandElasticity: 0.35,
  },
  entertainment: {
    id: 'entertainment',
    name: '娱乐用品',
    icon: '🎮',
    description: '娱乐产品，需求波动大',
    baseProductionCost: 8,
    baseMaterialCost: 13,
    baseSellingPrice: 74,
    minSellingPrice: 48,
    maxSellingPrice: 108,
    materialConsumption: 1.4,
    capacityCost: 1.8,
    marketDemand: 0.95,
    demandElasticity: 0.95,
  },
  luxury: {
    id: 'luxury',
    name: '奢侈品',
    icon: '💎',
    description: '高端商品，利润高但需求低',
    baseProductionCost: 18,
    baseMaterialCost: 28,
    baseSellingPrice: 168,
    minSellingPrice: 110,
    maxSellingPrice: 225,
    materialConsumption: 2.6,
    capacityCost: 3.4,
    marketDemand: 0.62,
    demandElasticity: 1.3,
  },
};

export interface MachineConfig {
  id: string;
  name: string;
  price: number;
  efficiency: number;
  capacityGain: number;
  maintenanceCost: number;
  durability: number;
}

export const MACHINE_CONFIGS: Record<string, MachineConfig> = {
  basic: {
    id: 'basic',
    name: '基础机器',
    price: 20000,
    efficiency: 2,
    capacityGain: 30,
    maintenanceCost: 500,
    durability: 10
  },
  advanced: {
    id: 'advanced',
    name: '先进机器',
    price: 50000,
    efficiency: 5,
    capacityGain: 75,
    maintenanceCost: 1000,
    durability: 20
  },
  automated: {
    id: 'automated',
    name: '自动化设备',
    price: 100000,
    efficiency: 10,
    capacityGain: 150,
    maintenanceCost: 2000,
    durability: 30
  }
};

export interface Loan {
  id: string;
  type: LoanType;
  principal: number;
  remaining: number;
  monthlyRate: number;
  collateral?: string;
  createdRound: number;
}

// ------------------- 玩家系统 -------------------

export interface Player {
  id: string;
  name: string;
  color: string;
  
  profession: PlayerProfession;
  attributes: PlayerAttribute[];
  
  cash: number;
  assets: Asset[];
  
  // 商品库存（不包括住房）
  goods: Record<GoodType, number>;
  
  // 住房状态
  housingStatus: HousingStatus;
  housingTier: HousingTier | null;
  currentRent: number;
  rentPaid: boolean;
  
  // 状态
  happiness: number;
  health: number;
  socialStatus: number;
  
  // 永久加成（来自教育等）
  permanentBonuses: {
    incomeBonus: number;
    happinessBonus: number;
  };
  
  workState: WorkState;
  workerAbilities?: {
    skill: number;
    wageLevel: number;
    trainingSessions: number;
    unemployedRounds: number;
    negotiationPower: number;
    sideJobRounds?: number;
    lastNegotiationRound?: number;
    employerId?: string;
    jobTitle?: string;
    currentJobId?: string;
    paymentType?: 'monthly' | 'hourly';
    educationLevel?: number;
    experience?: number;
    lastNegotiationAsk?: number;
    lastNegotiationOutcome?: 'rejected' | 'small_raise' | 'normal_raise' | 'strong_raise';
    contractType?: 'hourly' | 'monthly';
    hoursPerRound?: number;
    benefits?: number;
    promotionTrack?: string;
    jobSecurity?: number;
    industry?: IndustryType;
  };
  
  company?: Company;
  loans?: Loan[];
  creditScore?: number;
  taxRate: number;
  subsidiesBudget: number;
  
  hasActedThisRound: boolean;
  isBankrupt: boolean;
  governmentRatings?: Record<string, number>;
  
  // 政策冷却（政府官员专用）
  policyCooldowns?: Record<PolicyType, number>;
  
  // 投资者专属能力
  investorAbilities?: {
    investmentSkill: number;        // 投资技能等级 (0-100)
    learningPoints: number;         // 学习点数（用于提升技能）
    totalLearningSessions: number;  // 累计学习次数
    canSeeEconomicTrends: boolean;   // 是否能查看经济形势
    lastMarketAnalysis: number;      // 上次市场分析时间（回合数）
    lastPortfolioRisk?: number;      // 最近一次组合风险
    lastMistakeRounds?: number;      // 最近误判次数
  };
  
  // 政府官员专属能力
  govAbilities?: {
    treasuryBalance: number;         // 国库余额
    publicFunds: number;             // 公共基金
    governanceExp: number;           // 执政经验
    decisionPower: number;           // 决策能力
    reputation: number;              // 政府声誉
    approvalRating: number;          // 支持率
    policyHistory: string[];         // 政策历史
  };
}

// 资产类型（包括非投资资产）
export type AssetType = InvestmentType | 'real_estate' | 'machine';

// 资产（改进：支持批次追踪）
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  batchId: string;         // 批次ID，同一批次共享涨跌幅
  purchasePrice: number;
  currentValue: number;
  rentalIncome?: number;
}

// 资产批次（用于统一涨跌幅）
export interface AssetBatch {
  batchId: string;
  type: InvestmentType;
  totalValue: number;
  units: number;
  purchaseTime: number;
}

// ------------------- 交易系统 -------------------

export type TradeType = 
  | 'goods_for_goods'
  | 'goods_for_cash'
  | 'cash_for_goods'
  | 'cash_transfer';

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  type: TradeType;
  offeredItems?: { goodType: GoodType; quantity: number; price: number }[];
  offeredCash?: number;
  requestedItems?: { goodType: GoodType; quantity: number; price: number }[];
  requestedCash?: number;
  description: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: number;
}

// ------------------- 市场系统 -------------------

export interface Market {
  goods: Record<GoodType, GoodConfig>;
  stockMarket: {
    index: number;
    volatility: number;
    trend: 'bull' | 'bear' | 'stable';
  };
  gdp: number;
  inflationRate: number;
  employmentRate: number;
  giniCoefficient: number;
  socialStability: number;
  policyStabilityModifier?: number;
  monthlyTaxRevenue?: number;
  productivityBonus?: number;
  timeUnit?: 'month' | 'year';
  bank?: {
    centralBankRate: number;
    depositRate: number;
    consumerLoanRate: number;
    mortgageRate: number;
    businessLoanRate: number;
    defaultedLoans: number;
  };
  laborMarket?: {
    baseWage: number;
    unemploymentRate: number;
    skillPremium: number;
    minimumWage: number;
  };
  households: HouseholdSegment[];
  npcFirms: NpcFirm[];
  creditConditions: CreditState;
  macroState: MacroState;
  priceAnchors: Record<GoodType, {
    referencePrice: number;
    lastClearingPrice: number;
    inventoryPressure: number;
    shortageIndex: number;
  }>;
  inventoryPressure: Record<GoodType, number>;
  shortageIndex: Record<GoodType, number>;
  supplyDemand: Record<GoodType, { supply: number; demand: number }>;
  
  // 经济周期
  economicCycle: EconomicCycle;
  cyclePhase: number;      // 周期内的阶段 0-4
  
  // 全局税率
  globalTaxRate: number;
}

// ------------------- 随机事件 -------------------

export interface RandomEvent {
  id: string;
  type: EventType;
  name: string;
  description: string;
  icon?: string;
  story?: string;
  explanation?: string;
  effects: {
    inflation?: number;
    employment?: number;
    socialStability?: number;
    specificGoodPrice?: { goodType: GoodType; multiplier: number };
    demandMultiplier?: Partial<Record<GoodType, number>>;
    allIncomes?: number;
    stockMarket?: { indexChange: number; volatilityChange: number };
    cycleShift?: EconomicCycle;
  };
  probability: number;
  duration?: number;
  remainingDuration?: number;
  warning?: string;
  transmissionChannels?: Array<'household_income' | 'enterprise_cost' | 'credit' | 'external_demand' | 'logistics' | 'policy_expectation'>;
}

export interface HouseholdSegment {
  id: string;
  label: string;
  populationShare: number;
  averageIncome: number;
  disposableIncome: number;
  savingsRate: number;
  confidence: number;
  essentialShare: number;
  discretionaryShare: number;
  demandBias: Partial<Record<GoodType, number>>;
}

export interface NpcFirm {
  id: string;
  industry: IndustryType;
  employees: number;
  capacity: number;
  wageOffer: number;
  financialHealth: number;
  plannedSupply: number;
  pricingPower: number;
}

export interface CreditState {
  householdCreditTightness: number;
  businessCreditTightness: number;
  defaultRate: number;
  lendingSentiment: number;
  mortgageApprovalRate: number;
}

export interface MacroState {
  consumerConfidence: number;
  businessConfidence: number;
  externalDemandIndex: number;
  fiscalPressure: number;
  unemploymentPressure: number;
  inflationExpectation: number;
  socialMobilityIndex: number;
}

export interface PendingPolicy {
  id: string;
  policyType: PolicyType;
  policyName: string;
  proposerId: string;
  explanation: string;
  effectiveRound: number;
}

export const RANDOM_EVENTS: RandomEvent[] = [
  {
    id: 'economic_crisis',
    type: 'economic_crisis',
    name: '经济危机',
    icon: '📉',
    description: '全球经济衰退，市场需求大幅下降，股市暴跌',
    story: '当很多企业卖不出商品，就会减少招聘和投资，经济活动会变慢。',
    explanation: '需求下降会降低就业和股市指数，社会稳定也会承压。',
    effects: {
      inflation: -0.03,
      employment: -15,
      socialStability: -10,
      stockMarket: { indexChange: -0.2, volatilityChange: 0.3 },
      cycleShift: 'downturn',
      demandMultiplier: {
        food: 0.78,
        daily_necessities: 0.82,
        entertainment: 0.45,
        luxury: 0.35,
      },
    },
    probability: 0.1,
    duration: 3,
    warning: '订单和就业可能连续走弱，企业应控制库存，员工应保留现金。'
  },
  {
    id: 'tech_breakthrough',
    type: 'tech_breakthrough',
    name: '技术突破',
    icon: '🚀',
    description: '新技术广泛应用，生产效率大幅提升',
    story: '技术让同样的劳动生产出更多商品，经济里的这个变化叫生产率提高。',
    explanation: '生产率提高通常会提升就业和股市预期，并降低部分价格压力。',
    effects: {
      inflation: -0.02,
      employment: 5,
      stockMarket: { indexChange: 0.1, volatilityChange: 0.1 },
      cycleShift: 'growth',
      demandMultiplier: {
        daily_necessities: 1.08,
        entertainment: 1.12,
        luxury: 1.08,
      },
    },
    probability: 0.15,
    warning: '生产率将改善，企业扩产和技术投入的边际回报更高。'
  },
  {
    id: 'natural_disaster',
    type: 'natural_disaster',
    name: '自然灾害',
    icon: '🌪️',
    description: '自然灾害导致供应链中断，食品和必需品价格上涨',
    story: '供应链中断会让商品更难运输到市场，货架上的商品变少。',
    explanation: '供给减少会推高食品价格，并降低社会稳定。',
    effects: {
      inflation: 0.08,
      socialStability: -8,
      employment: -5,
      specificGoodPrice: { goodType: 'food', multiplier: 1.5 },
      demandMultiplier: { food: 1.25, daily_necessities: 0.9 },
    },
    probability: 0.08,
    duration: 2,
    warning: '食品供给短缺可能延续，提前储备必需品能降低生活质量损失。'
  },
  {
    id: 'market_boom',
    type: 'market_boom',
    name: '市场繁荣',
    icon: '📈',
    description: '消费信心高涨，市场需求旺盛，股市上涨',
    story: '当大家更愿意消费，企业更容易卖货，也更愿意招聘和扩产。',
    explanation: '需求增强会提高就业和股市，但也可能推高通胀。',
    effects: {
      inflation: 0.05,
      employment: 10,
      socialStability: 5,
      stockMarket: { indexChange: 0.15, volatilityChange: 0.2 },
      cycleShift: 'overheating',
      demandMultiplier: {
        food: 1.1,
        daily_necessities: 1.15,
        entertainment: 1.45,
        luxury: 1.35,
      },
    },
    probability: 0.12,
    warning: '需求强劲但通胀压力上升，企业可提价，投资者需警惕过热。'
  },
  {
    id: 'inflation_surge',
    type: 'inflation_surge',
    name: '通胀飙升',
    icon: '💹',
    description: '货币超发导致通货膨胀加剧，生活成本上升',
    story: '通胀表示同样的钱能买到的东西变少了，生活成本会上升。',
    explanation: '通胀上升会压缩家庭预算，并可能降低社会稳定。',
    effects: {
      inflation: 0.1,
      socialStability: -5,
      demandMultiplier: {
        entertainment: 0.72,
        luxury: 0.62,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '生活成本可能继续抬升，现金流紧张者应减少非必需消费。'
  },
  {
    id: 'policy_reform',
    type: 'policy_change',
    name: '政策改革',
    icon: '📜',
    description: '政府出台新政策，影响市场经济',
    story: '政策会改变企业和家庭的预期，比如税收、补贴和公共服务都会影响决策。',
    explanation: '有效政策能改善就业和社会稳定。',
    effects: {
      socialStability: 8,
      employment: 3
    },
    probability: 0.1,
    warning: '政策影响会逐步传导，政府需观察稳定度和就业的后续变化。'
  },
  {
    id: 'recession',
    type: 'downturn',
    name: '经济衰退',
    icon: '📉',
    description: '经济增速放缓，企业裁员，失业率上升',
    story: '衰退时企业订单减少，招聘变少，家庭收入也会更不稳定。',
    explanation: '就业下降会降低消费，股市波动加大，社会稳定承压。',
    effects: {
      inflation: -0.02,
      employment: -10,
      socialStability: -5,
      stockMarket: { indexChange: -0.1, volatilityChange: 0.15 },
      cycleShift: 'downturn',
      demandMultiplier: {
        food: 0.86,
        daily_necessities: 0.9,
        entertainment: 0.55,
        luxury: 0.42,
      },
    },
    probability: 0.1,
    duration: 2,
    warning: '失业风险升高，员工跳槽成功率下降，企业应谨慎扩招。'
  },
  {
    id: 'stimulus',
    type: 'growth',
    name: '政策刺激',
    icon: '🏛️',
    description: '政府推出刺激政策，经济活力增强',
    story: '政府可以通过补贴、投资和公共服务让经济重新活跃。',
    explanation: '刺激政策会提升就业和稳定度，但需求增加也可能带来通胀。',
    effects: {
      inflation: 0.03,
      employment: 8,
      socialStability: 5,
      stockMarket: { indexChange: 0.08, volatilityChange: 0.05 },
      demandMultiplier: {
        food: 1.08,
        daily_necessities: 1.12,
        entertainment: 1.25,
        luxury: 1.18,
      },
    },
    probability: 0.12
  }
];

// ------------------- 游戏状态 -------------------

export interface GameState {
  phase: GamePhase;
  gameMode: GameMode;
  currentRound: number;
  // 多终端统一轮次管理
  roundCompletedPlayers: string[];  // 已完成当前回合操作的玩家ID列表
  currentPlayerIndex: number;  // 保留但用于显示谁在操作
  players: Player[];
  market: Market;
  tradeOffers: TradeOffer[];
  pendingTrade: TradeOffer | null;
  recentEvent: RandomEvent | null;
  currentNews: RandomEvent | null;
  tutorialPrompt: TutorialPrompt | null;
  pendingPolicies: PendingPolicy[];
  activeEvents: RandomEvent[];
  eventHistory: RandomEvent[];
  gameLog: GameLogEntry[];
  winner: Player | null;
  victoryScores?: Record<string, {
    score: number;
    goal: string;
    details: string;
  }>;
  
  // 资产批次记录（用于统一涨跌幅）
  assetBatches: AssetBatch[];
}

export interface TutorialPrompt {
  id: string;
  title: string;
  body: string;
  tips: string[];
  severity: 'info' | 'warning';
}

export interface GameLogEntry {
  id: string;
  round: number;
  timestamp: number;
  type: 'trade' | 'action' | 'event' | 'system' | 'policy';
  message: string;
  playerId?: string;
}

// ------------------- 初始化数据 -------------------

const createInitialGoodConfig = (id: GoodType): GoodConfig => {
  const info = GOOD_EFFECTS_INFO[id];
  return {
    id,
    name: info.name,
    icon: info.icon,
    category: id === 'housing' ? 'housing' : 
              info.consumptionRate > 0 ? 'consumable' : 'durable',
    basePrice: id === 'food' ? 50 : 
                id === 'daily_necessities' ? 30 :
                id === 'healthcare' ? 200 :
                id === 'transportation' ? 10000 :
                id === 'education' ? 30000 :
                id === 'entertainment' ? 100 :
                id === 'luxury' ? 100000 : 100,
    currentPrice: id === 'food' ? 50 : 
                  id === 'daily_necessities' ? 30 :
                  id === 'healthcare' ? 200 :
                  id === 'transportation' ? 10000 :
                  id === 'education' ? 30000 :
                  id === 'entertainment' ? 100 :
                  id === 'luxury' ? 100000 : 100,
    priceHistory: [],
    elasticity: 0.5,
    essential: info.essential,
    consumptionRate: info.consumptionRate,
    effect: info.effect,
  };
};

export const INITIAL_GOODS: Record<GoodType, GoodConfig> = {
  food: createInitialGoodConfig('food'),
  daily_necessities: createInitialGoodConfig('daily_necessities'),
  housing: createInitialGoodConfig('housing'),
  transportation: createInitialGoodConfig('transportation'),
  entertainment: createInitialGoodConfig('entertainment'),
  luxury: createInitialGoodConfig('luxury'),
  education: createInitialGoodConfig('education'),
  healthcare: createInitialGoodConfig('healthcare'),
};

export const PLAYER_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6366F1', '#06B6D4',
];

// ==================== 工具函数 ====================

// 格式化货币显示（最多两位小数）
export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

// 格式化百分比显示（最多两位小数，用于通胀率等）
export function formatPercent(value: number, decimals: number = 2): string {
  return (value * 100).toFixed(decimals);
}

// 格式化整数显示
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

// 计算社会稳定度（基于玩家参数）
export function calculateSocialStability(players: Player[]): number {
  if (players.length === 0) return 50;
  
  let totalStability = 0;
  
  players.forEach(player => {
    let stability = 50; // 基础值
    
    // 健康状况
    stability += (player.health - 50) * 0.1;
    
    // 幸福度
    stability += (player.happiness - 50) * 0.15;
    
    // 社会地位
    stability += (player.socialStatus - 50) * 0.1;
    
    // 住房状况
    if (player.housingStatus === 'owned') {
      stability += 5;
    } else if (player.housingStatus === 'renting') {
      stability += 2;
    } else {
      stability -= 5;
    }
    
    // 财务状况
    if (player.cash > 10000) {
      stability += 5;
    } else if (player.cash < 0) {
      stability -= 10;
    }
    
    // 资产状况
    const assetValue = player.assets.reduce((sum, a) => sum + a.currentValue, 0);
    if (assetValue > 50000) {
      stability += 3;
    }
    
    // 疲劳度惩罚
    stability -= player.workState.fatigueLevel * 0.1;
    
    // 银行家惩罚
    if (player.isBankrupt) {
      stability -= 20;
    }
    
    totalStability += Math.max(0, Math.min(100, stability));
  });
  
  const avgStability = totalStability / players.length;
  
  // 基尼系数影响（贫富差距大，社会稳定下降）
  const incomes = players.map(p => p.cash + p.assets.reduce((sum, a) => sum + a.currentValue, 0)).sort((a, b) => a - b);
  const mean = incomes.reduce((a, b) => a + b, 0) / incomes.length;
  const variance = incomes.reduce((sum, i) => sum + Math.pow(Math.max(0, i - mean), 2), 0) / incomes.length;
  const gini = Math.sqrt(variance) / Math.max(1, mean);
  
  const inequalityPenalty = gini * 20;
  
  return Math.max(0, Math.min(100, avgStability - inequalityPenalty));
}
