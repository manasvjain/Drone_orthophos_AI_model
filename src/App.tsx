import { useState } from 'react';
import { Cpu } from 'lucide-react';
import { GisProvider, useGis } from './context/GisContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsProcessingPage } from './pages/ProjectsProcessingPage';
import { GisExplorerPage } from './pages/GisExplorerPage';
import { AnalyticsLabPage } from './pages/AnalyticsLabPage';
import { ModelRegistryPage, SettingsPage } from './pages/SystemPages';
import { ConfirmDialog } from './components/ui/Modal';

function AppShell() {
  const { activePage, isLoggedOut, setIsLoggedOut } = useGis();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  if (isLoggedOut) {
    return (
      <div className="min-h-screen bg-[#F7F7F2] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-[#E4E6DF] rounded-[4px] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[4px] bg-[#496B54] flex items-center justify-center text-white">
              <Cpu size={16} strokeWidth={1.85} />
            </div>
            <div>
              <div className="text-sm font-bold text-[#252A27]">SVAMITVA AI</div>
              <div className="text-[11px] text-[#727A75]">Geospatial Intelligence Platform</div>
            </div>
          </div>
          <div className="border-t border-[#E4E6DF] pt-4">
            <h1 className="text-base font-semibold text-[#252A27]">Session Signed Out</h1>
            <p className="text-xs text-[#727A75] mt-1 leading-relaxed">
              Your GIS analyst session has been locked. Sign back in to resume village orthophoto
              inspection and model analysis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsLoggedOut(false)}
            className="w-full h-9 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] transition-colors"
          >
            Resume Analyst Session
          </button>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'projects':
        return <ProjectsProcessingPage key="projects" initialFocus="projects" />;
      case 'processing':
        return <ProjectsProcessingPage key="processing" initialFocus="processing" />;
      case 'explorer':
        return <GisExplorerPage />;
      case 'analytics':
      case 'model-lab':
      case 'reports':
        return <AnalyticsLabPage />;
      case 'registry':
        return <ModelRegistryPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F7F7F2] text-[#252A27] flex">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onRequestLogout={() => setLogoutConfirmOpen(true)}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <Header onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
        <main
          className={`flex-1 min-h-0 ${
            activePage === 'explorer' ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          {renderPage()}
        </main>
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => setIsLoggedOut(true)}
        title="Sign Out of SVAMITVA AI"
        message="You are about to lock your active GIS Analyst session. Any running local jobs will remain in the session state."
        confirmLabel="Sign Out"
      />
    </div>
  );
}

export default function App() {
  return (
    <GisProvider>
      <AppShell />
    </GisProvider>
  );
}
