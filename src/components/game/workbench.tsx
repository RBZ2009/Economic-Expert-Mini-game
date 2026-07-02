'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { GameState, Player } from '@/types/game';

export interface ActionAdapter {
  mode: 'single' | 'multi';
  player: Player;
  gameState: GameState;
  isTurnLocked: boolean;
  send: (type: string, payload: Record<string, unknown>) => void;
  endTurn: () => void;
}

export function GameWorkbench({
  top,
  left,
  main,
  right,
  bottom,
}: {
  top: React.ReactNode;
  left: React.ReactNode;
  main: React.ReactNode;
  right: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background p-3 md:p-4 xl:p-5">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:gap-4">
        <div>{top}</div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)] xl:grid-cols-[300px_minmax(520px,1fr)_330px] xl:items-start xl:gap-4">
          <aside className="order-2 grid gap-3 md:grid-cols-2 xl:order-1 xl:grid-cols-1">
            {left}
          </aside>
          <main className="order-1 min-w-0 xl:order-2">
            {main}
          </main>
          <aside className="order-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {right}
          </aside>
        </div>
        {bottom && <div>{bottom}</div>}
      </div>
    </div>
  );
}

export function CompactCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`gap-3 rounded-lg p-3 shadow-xs ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }>;
}) {
  const toneClass = {
    default: 'text-foreground',
    good: 'text-green-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-md border bg-muted/30 px-2 py-1.5">
          <div className="truncate text-[11px] text-muted-foreground">{item.label}</div>
          <div className={`truncate text-sm font-semibold ${toneClass[item.tone ?? 'default']}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ActionWorkspace({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: string[];
}) {
  return (
    <Card className="gap-3 rounded-lg border-2 p-3 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">操作工作台</h2>
          <p className="truncate text-xs text-muted-foreground">按任务分组展开，先处理本轮关键事项</p>
        </div>
      </div>
      <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
        {children}
      </Accordion>
    </Card>
  );
}

export function ActionSection({
  value,
  title,
  icon,
  summary,
  badge,
  children,
}: {
  value: string;
  title: string;
  icon?: string;
  summary?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="rounded-lg border bg-card px-3">
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="shrink-0 text-sm font-semibold">{title}</span>
          {summary && <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{summary}</span>}
          {badge && <span className="ml-auto shrink-0">{badge}</span>}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        <div className="space-y-3">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function StatusBadge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const variant = tone === 'bad' ? 'destructive' : 'outline';
  const className = tone === 'good'
    ? 'border-green-500 text-green-700 dark:text-green-400'
    : tone === 'warn'
      ? 'border-amber-500 text-amber-700 dark:text-amber-400'
      : '';
  return (
    <Badge variant={variant} className={`text-xs ${className}`}>
      {children}
    </Badge>
  );
}
