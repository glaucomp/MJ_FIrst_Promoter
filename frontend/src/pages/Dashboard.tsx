import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { StatCard } from '../components/StatCard';
import { Chart } from '../components/Chart';
import { QuickTaskCard } from '../components/QuickTaskCard';
import { mockApi } from '../services/api';
import type { DashboardStats, ChartData } from '../types';

export const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);

  useEffect(() => {
    if (user?.role === 'promoter') {
      setStats(mockApi.getPromoterStats());
    } else {
      setStats(mockApi.getDashboardStats());
    }
    setChartData(mockApi.getChartData());
  }, [user?.role]);

  if (!stats || !chartData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex flex-col gap-[20px]">
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[4px]">
            <h1 className="text-[28px] leading-[36px] font-semibold text-white font-primary">
              TeaseMe
            </h1>
            <div className="border border-[#ff0f5f] rounded-[100px] px-[16px] py-[4px] h-[44px] flex items-center justify-center">
              <span className="text-[28px] leading-[36px] font-tertiary text-[#ff0f5f]">
                HQ
              </span>
            </div>
          </div>
          <p className="text-[16px] leading-[1.4] text-[#9e9e9e] font-medium tracking-[0.2px]">
            Welcome back, {user?.name}…
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-[12px] gap-y-[8px]">
        {user?.role === 'promoter' ? (
          <>
            <StatCard
              label="Followers"
              value={stats.followers || 0}
              change={stats.followersChange}
              className="h-[129px]"
            />
            <StatCard
              label="Income"
              value={`$${stats.income.toFixed(2)}`}
              change={stats.incomeChange}
              className="h-[129px]"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Models"
              value={stats.models !== undefined && stats.models < 10 ? `0${stats.models}` : stats.models ?? 0}
              change={stats.modelsChange}
              className="h-[129px]"
            />
            <StatCard
              label="Income"
              value={`$${stats.income.toFixed(2)}`}
              change={stats.incomeChange}
              className="h-[129px]"
            />
          </>
        )}
      </div>
    </div>

    <div className="flex flex-col gap-[16px]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] leading-[1.4] text-[#9e9e9e] font-medium tracking-[0.2px]">
            Monthly Statistics
          </p>
          <button className="text-[14px] leading-[1.4] text-[#ff1f69] font-medium underline tracking-[0.2px]">
            View Details
          </button>
        </div>
        <Chart
          data={chartData}
          className="h-[157px]"
        />
      </div>

      <div className="flex flex-col gap-[16px]">
        <p className="text-[16px] leading-[1.4] text-[#9e9e9e] font-medium tracking-[0.2px]">Quick Tasks</p>
        <div className="grid grid-cols-1 gap-[12px]">
          {(user?.role === 'team_manager' || user?.role === 'account_manager') && (
            <>
              <QuickTaskCard
                icon="👥"
                title="View All Models"
                description="How model performance"
              />
              <QuickTaskCard
                icon="📊"
                title="View Engagement Reports"
                description="Analyze your sales data and trends"
              />
              <QuickTaskCard
                icon="✉️"
                title="Invite Models"
                description="Invite models to increase revenue"
              />
            </>
          )}
          {user?.role === 'promoter' && (
            <>
              <QuickTaskCard
                icon="📈"
                title="View Analytics"
                description="Track your follower growth"
              />
              <QuickTaskCard
                icon="💰"
                title="View Earnings"
                description="Check your revenue breakdown"
              />
              <QuickTaskCard
                icon="🎯"
                title="Marketing Tools"
                description="Boost your engagement"
              />
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <QuickTaskCard
                icon="👥"
                title="Manage Users"
                description="View and manage all users"
              />
              <QuickTaskCard
                icon="📊"
                title="System Reports"
                description="Overall platform analytics"
              />
              <QuickTaskCard
                icon="⚙️"
                title="System Settings"
                description="Configure platform settings"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
