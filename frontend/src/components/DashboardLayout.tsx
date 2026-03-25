import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (isDesktop) {
    return (
      <div className="min-h-screen bg-[#212121] flex flex-col">
        <TopBar />
        <main className="flex-1 pb-[100px] flex justify-center px-[20px]" style={{ paddingTop: '100px' }}>
          <div className="w-full max-w-[754px]">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#212121] flex justify-center items-start">
      <div className="relative w-full min-w-[380px] max-w-[402px] h-screen overflow-hidden">
        <Sidebar onToggle={setIsSidebarOpen} />
        <div className="absolute top-0 left-[80px] right-0 h-screen overflow-y-auto overflow-x-hidden pb-[100px] pt-[64px] px-[20px]">
          <div className="w-full">{children}</div>
        </div>
      </div>
    </div>
  );
};
