import {
  BarChart3,
  Cpu,
  Database,
  FileDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Settings,
  SlidersHorizontal,
  Workflow,
  X,
} from 'lucide-react';
import { ANALYST_AVATAR } from '../../data/mockGisData';
import { useGis } from '../../context/GisContext';
import { PageId } from '../../types/gis';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onRequestLogout: () => void;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  onSelectExtra?: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile, onRequestLogout }: SidebarProps) {
  const { activePage, setActivePage, setAnalyticsTab, authUser } = useGis();

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Overview',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      title: 'Workspace',
      items: [
        { id: 'projects', label: 'Projects', icon: FolderKanban },
        { id: 'processing', label: 'Processing Jobs', icon: Workflow },
        { id: 'explorer', label: 'GIS Explorer', icon: MapIcon },
      ],
    },
    {
      title: 'Analytics',
      items: [
        {
          id: 'analytics',
          label: 'Village Analytics',
          icon: BarChart3,
          onSelectExtra: () => setAnalyticsTab('village'),
        },
        {
          id: 'model-lab',
          label: 'Model Laboratory',
          icon: SlidersHorizontal,
          onSelectExtra: () => setAnalyticsTab('comparison'),
        },
        {
          id: 'reports',
          label: 'Reports & Exports',
          icon: FileDown,
          onSelectExtra: () => setAnalyticsTab('exports'),
        },
      ],
    },
    {
      title: 'System',
      items: [
        { id: 'registry', label: 'Model Registry', icon: Database },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const handleNavClick = (item: NavItem) => {
    setActivePage(item.id);
    item.onSelectExtra?.();
    onCloseMobile();
  };

  const sidebarContent = (
    <aside className="w-[240px] h-full bg-white border-r border-[#E4E6DF] flex flex-col justify-between select-none shrink-0">
      <div>
        {/* Brand Block */}
        <div className="h-14 px-4 border-b border-[#E4E6DF] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-[4px] bg-[#496B54] flex items-center justify-center text-white shrink-0">
              <Cpu size={15} strokeWidth={1.85} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold tracking-tight text-[#252A27] leading-none truncate">
                SVAMITVA AI
              </div>
              <div className="text-[11px] text-[#727A75] mt-1 leading-none truncate">
                Geospatial Intelligence Platform
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1 text-[#727A75] hover:text-[#252A27]"
            aria-label="Close navigation menu"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="px-3 py-4 space-y-5 overflow-y-auto" aria-label="Primary Navigation">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wider text-[#727A75] uppercase">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(item)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[4px] text-[13px] transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-[#EEF2EE] text-[#2F4A38] font-semibold'
                            : 'text-[#4B524E] hover:bg-[#F7F7F2] hover:text-[#252A27] font-medium'
                        }`}
                      >
                        <Icon
                          size={15}
                          strokeWidth={1.75}
                          className={isActive ? 'text-[#496B54] shrink-0' : 'text-[#727A75] shrink-0'}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Analyst Footer */}
      <div className="p-3 border-t border-[#E4E6DF] bg-[#FAFBF8]">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={authUser?.photoURL || ANALYST_AVATAR}
            alt={authUser?.displayName || 'Arjun Kulkarni'}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-[4px] object-cover border border-[#E4E6DF] shrink-0 bg-[#E4E6DF]"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#252A27] truncate">
              {authUser?.displayName || 'Arjun Kulkarni'}
            </div>
            <div className="text-[11px] text-[#727A75] truncate">
              {authUser ? 'GIS Analyst · Cloud Sync' : 'GIS Analyst · Local Mode'}
            </div>
          </div>
          <button
            type="button"
            onClick={onRequestLogout}
            className="p-1.5 rounded-[4px] text-[#727A75] hover:text-[#A64438] hover:bg-[#FDF7F6] transition-colors shrink-0"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <div className="hidden lg:block h-full shrink-0">{sidebarContent}</div>

      {/* Tablet / Mobile Overlay Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#252A27]/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
