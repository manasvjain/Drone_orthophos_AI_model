import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronRight, Cloud, CloudOff, Menu, Search } from 'lucide-react';
import { ANALYST_AVATAR } from '../../data/mockGisData';
import { useGis } from '../../context/GisContext';
import { PageId } from '../../types/gis';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

const PAGE_BREADCRUMBS: Record<PageId, { group: string; title: string }> = {
  dashboard: { group: 'Overview', title: 'Dashboard' },
  projects: { group: 'Workspace', title: 'Village Projects' },
  processing: { group: 'Workspace', title: 'Processing Jobs' },
  explorer: { group: 'Workspace', title: 'GIS Explorer' },
  analytics: { group: 'Analytics', title: 'Village Analytics' },
  'model-lab': { group: 'Analytics', title: 'Model Laboratory' },
  reports: { group: 'Analytics', title: 'Reports & Exports' },
  registry: { group: 'System', title: 'Model Registry' },
  settings: { group: 'System', title: 'Settings' },
};

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const {
    activePage,
    setActivePage,
    projects,
    activeProjectId,
    setActiveProjectId,
    features,
    setSelectedFeatureId,
    globalSearch,
    setGlobalSearch,
    notifications,
    markAllNotificationsRead,
    authUser,
    dbSyncStatus,
    signInWithGoogle,
  } = useGis();

  const [notifOpen, setNotifOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const crumb = PAGE_BREADCRUMBS[activePage];

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const query = globalSearch.trim().toLowerCase();
  const matchedProjects = query
    ? projects
        .filter(
          (p) =>
            p.village.toLowerCase().includes(query) ||
            p.district.toLowerCase().includes(query) ||
            p.id.toLowerCase().includes(query)
        )
        .slice(0, 4)
    : [];

  const matchedFeatures = query
    ? features
        .filter(
          (f) =>
            f.id.toLowerCase().includes(query) ||
            f.ward.toLowerCase().includes(query) ||
            f.featureClass.toLowerCase().includes(query)
        )
        .slice(0, 5)
    : [];

  const analystName = authUser?.displayName || 'A. Kulkarni';
  const analystAvatar = authUser?.photoURL || ANALYST_AVATAR;

  return (
    <header className="h-14 bg-white border-b border-[#E4E6DF] px-4 lg:px-5 flex items-center justify-between gap-4 shrink-0">
      {/* Left: Mobile menu + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-1.5 rounded-[4px] border border-[#E4E6DF] text-[#252A27] hover:bg-[#F7F7F2]"
          aria-label="Open navigation menu"
        >
          <Menu size={16} strokeWidth={1.75} />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
          <span className="text-[#727A75] hidden sm:inline whitespace-nowrap">SVAMITVA AI</span>
          <ChevronRight size={13} className="text-[#9AA09C] hidden sm:inline shrink-0" />
          <span className="text-[#727A75] hidden md:inline whitespace-nowrap">{crumb.group}</span>
          <ChevronRight size={13} className="text-[#9AA09C] hidden md:inline shrink-0" />
          <span className="font-semibold text-[#252A27] truncate">{crumb.title}</span>
        </nav>
      </div>

      {/* Right: Project Selector, Search, Cloud Sync, Notifications, Profile */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Current Project Selector */}
        <div className="hidden sm:flex items-center gap-1.5">
          <label htmlFor="global-project-select" className="text-[11px] text-[#727A75] whitespace-nowrap">
            Active Project
          </label>
          <select
            id="global-project-select"
            value={activeProjectId}
            onChange={(e) => setActiveProjectId(e.target.value)}
            className="h-8 max-w-[190px] px-2.5 text-xs font-medium text-[#252A27] bg-[#F7F7F2] border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
          >
            {projects.length === 0 ? (
              <option value="">No projects</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.village} ({p.state.slice(0, 2).toUpperCase()})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Global Search */}
        <div ref={searchRef} className="relative hidden md:block">
          <div className="relative flex items-center">
            <Search
              size={13}
              strokeWidth={1.75}
              className="absolute left-2.5 text-[#727A75] pointer-events-none"
            />
            <input
              type="text"
              value={globalSearch}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setSearchFocused(true);
              }}
              placeholder="Search village or feature ID..."
              aria-label="Search villages or feature IDs"
              className="h-8 w-52 lg:w-60 pl-8 pr-3 text-xs text-[#252A27] placeholder-[#8C938E] bg-[#F7F7F2] border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:bg-white focus:border-[#496B54]"
            />
          </div>

          {searchFocused && query.length > 0 && (
            <div className="absolute right-0 mt-1.5 w-72 bg-white border border-[#E4E6DF] rounded-[4px] shadow-md z-50 overflow-hidden">
              {matchedProjects.length === 0 && matchedFeatures.length === 0 ? (
                <div className="p-3 text-xs text-[#727A75]">
                  No matching projects or vector features for "{globalSearch}".
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E6DF]">
                  {matchedProjects.length > 0 && (
                    <div className="p-1.5">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#727A75]">
                        Village Projects
                      </div>
                      {matchedProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActiveProjectId(p.id);
                            setActivePage('explorer');
                            setSearchFocused(false);
                          }}
                          className="w-full px-2 py-1.5 text-left rounded-[3px] hover:bg-[#F7F7F2] flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-medium text-[#252A27] truncate">
                            {p.village}, {p.district}
                          </span>
                          <span className="text-[11px] font-mono text-[#727A75] shrink-0">
                            {p.id}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {matchedFeatures.length > 0 && (
                    <div className="p-1.5">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#727A75]">
                        Extracted Features
                      </div>
                      {matchedFeatures.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setActiveProjectId(f.projectId);
                            setSelectedFeatureId(f.id);
                            setActivePage('explorer');
                            setSearchFocused(false);
                          }}
                          className="w-full px-2 py-1.5 text-left rounded-[3px] hover:bg-[#F7F7F2] flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-mono font-medium text-[#252A27] truncate">
                            {f.id}
                          </span>
                          <span className="text-[11px] text-[#727A75] capitalize shrink-0">
                            {f.featureClass}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cloud Firestore Auth / Sync */}
        {authUser ? (
          <button
            type="button"
            onClick={() => setActivePage('settings')}
            className="hidden lg:inline-flex h-8 px-2.5 items-center gap-1.5 rounded-[4px] border border-[#E4E6DF] bg-[#FAFBF8] hover:bg-[#F7F7F2] text-[11px] font-medium text-[#3C5C47] shrink-0 whitespace-nowrap"
            title={`Signed in as ${authUser.email ?? 'Google User'}`}
          >
            <Cloud size={13} strokeWidth={1.75} className="text-[#496B54]" />
            <span>
              {dbSyncStatus === 'syncing'
                ? 'Syncing'
                : dbSyncStatus === 'error'
                  ? 'Sync Alert'
                  : 'Firestore Synced'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-[4px] bg-[#496B54] hover:bg-[#3D5B47] text-white text-[11px] font-medium transition-colors shrink-0 whitespace-nowrap"
            title="Sign in with Google to save projects and extracted features to Cloud Firestore"
          >
            <CloudOff size={13} strokeWidth={1.75} />
            <span>Sign in to Sync</span>
          </button>
        )}

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative h-8 w-8 flex items-center justify-center rounded-[4px] border border-[#E4E6DF] bg-white text-[#4B524E] hover:bg-[#F7F7F2] transition-colors"
            aria-label="Notifications"
          >
            <Bell size={15} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 bg-[#B77B61] text-white text-[10px] font-mono font-semibold rounded-[2px] flex items-center justify-center tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-1.5 w-80 bg-white border border-[#E4E6DF] rounded-[4px] shadow-md z-50 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-[#E4E6DF] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#252A27]">Processing Alerts</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-[11px] font-medium text-[#496B54] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E6DF]">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-3.5 py-2.5 ${n.read ? 'bg-white' : 'bg-[#F7F7F2]/80'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#252A27] truncate">{n.title}</span>
                      <span className="text-[10px] font-mono text-[#727A75] shrink-0">
                        {n.timestamp}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#727A75] mt-1 leading-relaxed">{n.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile Avatar */}
        <button
          type="button"
          onClick={() => setActivePage('settings')}
          className="h-8 pl-1.5 pr-2.5 flex items-center gap-2 rounded-[4px] border border-[#E4E6DF] bg-white hover:bg-[#F7F7F2] transition-colors shrink-0"
          title="Analyst & Firestore account settings"
        >
          <img
            src={analystAvatar}
            alt={analystName}
            referrerPolicy="no-referrer"
            className="w-5 h-5 rounded-[2px] object-cover bg-[#E4E6DF]"
          />
          <span className="hidden xl:inline text-xs font-medium text-[#252A27] whitespace-nowrap max-w-[120px] truncate">
            {analystName}
          </span>
        </button>
      </div>
    </header>
  );
}
