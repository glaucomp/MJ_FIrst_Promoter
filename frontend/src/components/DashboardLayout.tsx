import type { ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  if (isDesktop) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
        <TopBar />
        <main className="flex-1 pb-[100px] flex justify-center px-[20px]" style={{ paddingTop: '100px' }}>
          <div className="w-full max-w-[754px]">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center items-start" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="relative w-full  h-screen overflow-hidden">
        <Sidebar />
        <div className="absolute top-0 left-16 right-0 h-screen overflow-y-auto overflow-x-hidden pt-[64px] px-[16px]" style={{ scrollbarWidth: 'none' }}>
          <div style={{ width: '100%', paddingBottom: '40px' }}>{children}</div>
        </div>
      </div>
    </div>
  );
};
