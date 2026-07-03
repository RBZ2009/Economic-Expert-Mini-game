import { ECONOMY_BALANCE, IndustryType, Player } from '@/types/game';

export type JobPaymentType = 'monthly' | 'hourly';

export interface JobOffer {
  id: string;
  employerId: string;
  employerName: string;
  title: string;
  description: string;
  paymentType: JobPaymentType;
  wage: number;
  requiredSkill: number;
  requiredEducation: number;
  requiredExperience: number;
  maxWorkPerRound: number;
  healthCost: number;
  happinessCost: number;
  fatigueCost: number;
  overtimeAllowed: boolean;
  contractType: 'hourly' | 'monthly';
  hoursPerRound: number;
  benefits: number;
  promotionTrack: string;
  jobSecurity: number;
  industry: IndustryType;
}

export function getWorkerEducationLevel(worker: Player): number {
  return worker.workerAbilities?.educationLevel ?? Math.min(4, Math.floor((worker.goods.education ?? 0) / 2));
}

export function getWorkerExperience(worker: Player): number {
  return worker.workerAbilities?.experience ?? Math.floor((worker.workerAbilities?.sideJobRounds ?? 0) / 2);
}

export function getWorkerCurrentJob(worker: Player, allPlayers: Player[]): JobOffer {
  const offers = getJobOffers(allPlayers, worker, 70);
  return offers.find(offer => offer.id === worker.workerAbilities?.currentJobId)
    ?? offers.find(offer => offer.id === 'npc_service_hourly')
    ?? offers[0];
}

export function isQualifiedForJob(worker: Player, offer: JobOffer): boolean {
  const ability = worker.workerAbilities;
  const skill = ability?.skill ?? 30;
  return skill >= offer.requiredSkill
    && getWorkerEducationLevel(worker) >= offer.requiredEducation
    && getWorkerExperience(worker) >= offer.requiredExperience;
}

export function getJobOffers(players: Player[], worker: Player, marketEmploymentRate: number): JobOffer[] {
  const employmentMultiplier = marketEmploymentRate >= 70 ? 1.04 : marketEmploymentRate < 50 ? 0.94 : 1;
  const npcOffers: JobOffer[] = [
    {
      id: 'npc_service_hourly',
      employerId: 'npc_service',
      employerName: '社区服务站',
      title: '小时工服务员',
      description: '门槛低，按工时结算。可以一轮内多次工作，但单次收入较少。',
      paymentType: 'hourly',
      wage: Math.round(ECONOMY_BALANCE.worker.baseWage * 0.32 * employmentMultiplier),
      requiredSkill: 10,
      requiredEducation: 0,
      requiredExperience: 0,
      maxWorkPerRound: 3,
      healthCost: 0,
      happinessCost: 2,
      fatigueCost: 18,
      overtimeAllowed: false,
      contractType: 'hourly',
      hoursPerRound: 8,
      benefits: 0.08,
      promotionTrack: '服务业基础岗->门店主管',
      jobSecurity: 48,
      industry: 'public_service',
    },
    {
      id: 'npc_factory_monthly',
      employerId: 'npc_factory',
      employerName: 'NPC制造企业',
      title: '制造业正式工',
      description: '稳定月薪岗位，每轮自动发薪。不能重复手动工作，只能选择加班。',
      paymentType: 'monthly',
      wage: Math.round(ECONOMY_BALANCE.worker.baseWage * 1.05 * employmentMultiplier),
      requiredSkill: 35,
      requiredEducation: 1,
      requiredExperience: 1,
      maxWorkPerRound: 0,
      healthCost: 0,
      happinessCost: 3,
      fatigueCost: 22,
      overtimeAllowed: true,
      contractType: 'monthly',
      hoursPerRound: 10,
      benefits: 0.18,
      promotionTrack: '产线工人->班组长->车间主管',
      jobSecurity: 68,
      industry: 'daily_necessities',
    },
    {
      id: 'npc_tech_monthly',
      employerId: 'npc_tech',
      employerName: '成长科技公司',
      title: '技能型运营专员',
      description: '高技能月薪岗位，收入更高，但要求学历和经验。',
      paymentType: 'monthly',
      wage: Math.round(ECONOMY_BALANCE.worker.baseWage * 1.35 * employmentMultiplier),
      requiredSkill: 65,
      requiredEducation: 2,
      requiredExperience: 3,
      maxWorkPerRound: 0,
      healthCost: 0,
      happinessCost: 2,
      fatigueCost: 20,
      overtimeAllowed: true,
      contractType: 'monthly',
      hoursPerRound: 9,
      benefits: 0.22,
      promotionTrack: '运营专员->项目经理->业务负责人',
      jobSecurity: 72,
      industry: 'finance',
    },
  ];

  const entrepreneurOffers = players
    .filter(player => player.profession === 'entrepreneur' && player.company)
    .map((player): JobOffer => {
      const company = player.company!;
      const qualityPremium = Math.min(0.45, company.productQuality / 220);
      return {
        id: `company_${player.id}`,
        employerId: player.id,
        employerName: company.name,
        title: `${company.name} 正式员工`,
        description: '玩家企业提供的月薪岗位，工资和企业工资设置、声誉有关。',
        paymentType: 'monthly',
        wage: Math.round((company.productionCost || ECONOMY_BALANCE.company.wagePerEmployee) * (1 + qualityPremium)),
        requiredSkill: Math.round(Math.max(25, Math.min(85, 20 + company.productQuality * 0.45 + company.machines * 3))),
        requiredEducation: company.productQuality >= 70 ? 2 : 1,
        requiredExperience: Math.max(1, Math.min(5, company.machines)),
        maxWorkPerRound: 0,
        healthCost: 0,
        happinessCost: company.morale >= 70 ? 1 : 4,
        fatigueCost: company.morale >= 70 ? 18 : 26,
        overtimeAllowed: true,
        contractType: 'monthly',
        hoursPerRound: company.machines >= 2 ? 10 : 9,
        benefits: 0.16 + Math.min(0.1, company.reputation / 1000),
        promotionTrack: `${company.name} 初级岗->骨干->管理岗`,
        jobSecurity: Math.round(Math.max(42, Math.min(88, company.reputation * 0.8 + company.morale * 0.3))),
        industry: company.industry ?? company.productionType,
      };
    });

  return [...npcOffers, ...entrepreneurOffers].sort((a, b) => {
    if (a.paymentType !== b.paymentType) return a.paymentType === 'monthly' ? -1 : 1;
    return b.wage - a.wage;
  });
}
