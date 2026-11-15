import { useState } from 'react';
import { AlertCircle, Cpu, X } from 'lucide-react';
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
  const {
    activePage,
    isLoggedOut,
    setIsLoggedOut,
    signInWithGoogle,
    signOutAccount,
    firebaseError,
    clearFirebaseError,
  } = useGis();
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
              Sign in with Google to sync village projects, vector polygons, and RoofNet-2D CNN
              results with Cloud Firestore, or resume in local preview mode.
            </p>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="w-full h-9 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] transition-colors"
            >
              Sign in with Google (Cloud Sync)
            </button>
            <button
              type="button"
              onClick={() => setIsLoggedOut(false)}
              className="w-full h-9 bg-white hover:bg-[#F7F7F2] text-[#252A27] border border-[#E4E6DF] text-xs font-medium rounded-[4px] transition-colors"
            >
              Continue in Local Preview
            </button>
          </div>
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
        {firebaseError && (
          <div className="px-4 lg:px-5 py-2 bg-[#FDF7F6] border-b border-[#E6C5C0] flex items-center justify-between gap-3 text-xs text-[#A64438] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={14} className="shrink-0" />
              <span className="truncate">{firebaseError}</span>
            </div>
            <button
              type="button"
              onClick={clearFirebaseError}
              className="p-1 hover:bg-[#F7E9E6] rounded-[3px] shrink-0"
              aria-label="Dismiss database notice"
            >
              <X size={13} />
            </button>
          </div>
        )}
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
        onConfirm={() => void signOutAccount()}
        title="Sign Out of SVAMITVA AI"
        message="You are about to sign out and lock your active GIS Analyst session."
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
