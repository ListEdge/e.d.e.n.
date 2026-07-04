"use client";

export interface DashboardItem {
  title: string;
  detail?: string;
  url?: string;
}

export interface DashboardData {
  title: string;
  summary?: string;
  items?: DashboardItem[];
}

export interface DashboardEntry {
  id: number;
  data: DashboardData;
}

function DashboardCard({
  data,
  variant,
  onDismiss,
}: {
  data: DashboardData;
  variant: "current" | "previous";
  onDismiss: () => void;
}) {
  const isPrevious = variant === "previous";

  return (
    <div
      className={`hud-panel pointer-events-auto w-full max-w-xl overflow-hidden px-5 transition-all duration-500 ease-out ${
        isPrevious ? "scale-[0.92] py-2.5 opacity-55" :
