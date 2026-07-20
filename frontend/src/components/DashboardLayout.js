import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Package, 
  DollarSign, 
  LogOut, 
  Bell,
  Menu,
  X,
  ChevronRight,
  Download,
  Route,
  Navigation,
  BookOpen,
  MessageCircle,
  AlertTriangle,
  Activity,
  RotateCw,
  Users,
  Webhook,
  Tag
} from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import NotificationsPanel from './NotificationsPanel';
import OrderDetailOverlay from './OrderDetailOverlay';
import { setupInstallPrompt, promptInstall } from '../serviceWorkerRegistration';
import axios from 'axios';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_os-management-hub-1/artifacts/usi8ly9o_image.png';

const menuItems = [
  { 
    path: '/service-orders', 
    label: 'Ordens de Serviço', 
    icon: ClipboardList,
    adminOnly: true,
  },
  { 
    path: '/routes', 
    label: 'Roteiros', 
    icon: Route 
  },
  { 
    path: '/inventory', 
    label: 'Estoque', 
    icon: Package,
    adminOnly: true,
  },
  { 
    path: '/financial', 
    label: 'Financeiro', 
    icon: DollarSign,
    adminOnly: true,
  },
  { 
    path: '/manuais', 
    label: 'Manuais', 
    icon: BookOpen 
  },
  { 
    path: '/whatsapp', 
    label: 'WhatsApp API', 
    icon: MessageCircle,
    adminOnly: true,
  },
  {
    path: '/users',
    label: 'Usuários',
    icon: Users,
    adminOnly: true,
  },
  {
    path: '/admin/webhooks',
    label: 'Webhooks',
    icon: Webhook,
    adminOnly: true,
  },
  {
    path: '/admin/labels',
    label: 'Adesivos',
    icon: Tag,
    adminOnly: true,
  },
];

const DashboardLayout = ({ children, unreadCount = 0 }) => {
  const { logout, user, token, isAdmin, isInvisacook } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [canInstallPWA, setCanInstallPWA] = useState(false);
  const [overdueData, setOverdueData] = useState({ count: 0, orders: [] });
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [overdueSearch, setOverdueSearch] = useState('');
  const [overdueStatusFilter, setOverdueStatusFilter] = useState('all');
  const [quickViewOS, setQuickViewOS] = useState(null);
  const [newOSAlert, setNewOSAlert] = useState(null);
  const [scraperHealth, setScraperHealth] = useState({ overall: 'ok', scrapers: {} });
  const lastExtCountRef = React.useRef(null);
  const audioRef = React.useRef(null);

  const API = process.env.REACT_APP_BACKEND_URL;
  const getAuth = useCallback(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  useEffect(() => {
    setupInstallPrompt(
      () => setCanInstallPWA(true),
      () => setCanInstallPWA(false)
    );
    // Preload notification audio
    audioRef.current = new Audio('/assets/new-os-notification.mp3');
    audioRef.current.volume = 0.8;
  }, []);

  // Dynamic branding: title + favicon reflect the logged-in role. Invisacook
  // gets a fully white-labeled tab so partners never see "Mastermaq" chrome.
  useEffect(() => {
    const link = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']");
    if (isInvisacook) {
      document.title = 'Invisacook | Portal de OSs';
      if (link) link.href = '/assets/invisacook-logo.webp';
    } else {
      document.title = 'Mastermaq | Sistema de Gestão';
      if (link) link.href = '/favicon.ico';
    }
  }, [isInvisacook]);

  useEffect(() => {
    if (token && isAdmin) {
      axios.get(`${API}/api/service-orders/overdue-at`, getAuth())
        .then(res => setOverdueData(res.data))
        .catch(() => {});
    }
  }, [token, API, getAuth, isAdmin]);

  // Poll for new external OS every 15 seconds — admin only (not invisacook)
  useEffect(() => {
    if (!token || !isAdmin || isInvisacook) return;
    const getAckedSet = () => {
      try { return new Set(JSON.parse(localStorage.getItem('ackedExtOS') || '[]')); }
      catch { return new Set(); }
    };
    const poll = async () => {
      try {
        const res = await axios.get(`${API}/api/new-external-os`, getAuth());
        const data = res.data;
        if (data.new_os && lastExtCountRef.current !== null && data.count > lastExtCountRef.current) {
          const latestOS = data.latest?.os_number;
          const acked = getAckedSet();
          // Only alert if this OS hasn't been acknowledged yet
          if (latestOS && !acked.has(String(latestOS))) {
            try { audioRef.current?.play(); } catch(e) { /* autoplay blocked */ }
            setNewOSAlert(data.latest);
            setTimeout(() => setNewOSAlert(null), 10000);
          }
        }
        // Keep the count reference in sync with the server's real value so
        // cache-misses never look like a new alert.
        if (typeof data.count === 'number') {
          lastExtCountRef.current = data.count;
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [token, API, getAuth, isAdmin, isInvisacook]);

  // Poll scraper health every 60s
  useEffect(() => {
    if (!token) return;
    const fetchHealth = async () => {
      try {
        const res = await axios.get(`${API}/api/scrapers/health`, getAuth());
        setScraperHealth(res.data || { overall: 'ok', scrapers: {} });
      } catch { /* ignore */ }
    };
    fetchHealth();
    const i = setInterval(fetchHealth, 60000);
    return () => clearInterval(i);
  }, [token, API, getAuth]);

  const handleResync = useCallback(async (source) => {
    try {
      await axios.post(`${API}/api/scrapers/${source}/resync?days=60`, {}, getAuth());
      toast.success(`Resync ${source.toUpperCase()} agendado (últimos 60 dias)`);
    } catch (e) {
      toast.error(`Falha ao agendar resync: ${e?.response?.data?.detail || e.message}`);
    }
  }, [API, getAuth]);

  const acknowledgeOSAlert = useCallback((osNumber) => {
    if (!osNumber) return;
    try {
      const existing = JSON.parse(localStorage.getItem('ackedExtOS') || '[]');
      if (!existing.includes(String(osNumber))) {
        existing.push(String(osNumber));
        // Keep only last 200 acks
        const trimmed = existing.slice(-200);
        localStorage.setItem('ackedExtOS', JSON.stringify(trimmed));
      }
    } catch { /* ignore */ }
    setNewOSAlert(null);
  }, []);

  const handleInstallPWA = async () => {
    const accepted = await promptInstall();
    if (accepted) setCanInstallPWA(false);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-white flex" data-testid="dashboard-layout">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo — Invisacook logo for invisacook role, Mastermaq otherwise */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
            <img 
              src={isInvisacook ? '/assets/invisacook-logo.webp' : LOGO_URL} 
              alt={isInvisacook ? 'Invisacook' : 'Mastermaq'} 
              className="h-10 w-auto"
              data-testid="sidebar-logo"
            />
            <button 
              className="lg:hidden text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-3 space-y-1">
              {menuItems
                .filter(item => isAdmin || !item.adminOnly)
                // Invisacook role only sees Ordens de Serviço — everything
                // else is hidden even if it's not adminOnly.
                .filter(item => !isInvisacook || item.path === '/service-orders')
                .map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-gray-900 text-white' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                    data-testid={`nav-${item.path.replace('/', '')}`}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span>{item.label}</span>
                    {isActive && <ChevronRight size={16} className="ml-auto" />}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          {/* PWA Install Button */}
          {canInstallPWA && (
            <div className="px-4 pb-2">
              <Button
                variant="outline"
                className={
                  isInvisacook
                    ? "w-full border-2 border-black text-black hover:opacity-90 transition-opacity"
                    : "w-full border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                }
                style={isInvisacook ? { backgroundColor: '#E8551F' } : undefined}
                onClick={handleInstallPWA}
                data-testid="pwa-install-button"
              >
                <Download size={16} className="mr-2" />
                Instalar App
              </Button>
            </div>
          )}

          {/* User section */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-600">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700"
                data-testid="logout-button"
              >
                <LogOut size={18} />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        {/* Header */}
        <header
          className={`h-16 border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30 ${isInvisacook ? '' : 'bg-white'}`}
          style={isInvisacook ? { backgroundColor: '#F7F5F2' } : undefined}
        >
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}
              data-testid="mobile-menu-button"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {menuItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
            </h1>
            {user?.name && !isInvisacook && (
              <span className="hidden md:inline text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100" data-testid="user-role-badge">
                {user.role === 'admin' ? 'Admin' : 'Técnico'} • {user.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Scraper Health Badge - shows when at least one scraper has a failure */}
            {/* Scraper health badge — admin only */}
            {isAdmin && scraperHealth.overall !== 'ok' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`relative gap-1.5 px-2 ${scraperHealth.overall === 'down' ? 'text-red-600 hover:bg-red-50' : 'text-amber-600 hover:bg-amber-50'}`}
                    data-testid="scraper-health-badge"
                    title="Status do scraper Telecontrol"
                  >
                    <Activity size={16} className={scraperHealth.overall === 'down' ? 'animate-pulse' : ''} />
                    <span className="text-xs font-medium hidden sm:inline">
                      {scraperHealth.overall === 'down' ? 'Scraper OFF' : 'Scraper instável'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-0" data-testid="scraper-health-panel">
                  <div className="p-3 border-b">
                    <h3 className="font-semibold text-sm">Saúde do Scraper Telecontrol</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Falhas após 2 ciclos consecutivos.</p>
                  </div>
                  {Object.entries(scraperHealth.scrapers || {}).map(([src, h]) => {
                    const dotColor = h.consecutive_failures >= 2 ? 'bg-red-500' : h.consecutive_failures >= 1 ? 'bg-amber-500' : 'bg-green-500';
                    const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
                    return (
                      <div key={src} className="p-3 border-b last:border-0" data-testid={`scraper-health-${src}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${dotColor}`}></span>
                            <span className="text-sm font-medium uppercase">{src}</span>
                            {h.consecutive_failures > 0 && (
                              <Badge variant="outline" className="text-[10px] py-0">
                                {h.consecutive_failures} falha{h.consecutive_failures > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleResync(src)} data-testid={`scraper-resync-${src}`}>
                            <RotateCw size={12} className="mr-1" />Resync
                          </Button>
                        </div>
                        <div className="text-[11px] text-gray-500 space-y-0.5">
                          <div>Último sucesso: <span className="font-mono">{fmtTime(h.last_success)}</span></div>
                          <div>Última falha: <span className="font-mono">{fmtTime(h.last_failure)}</span></div>
                          {h.last_error && <div className="text-red-600 truncate" title={h.last_error}>Erro: {h.last_error}</div>}
                        </div>
                      </div>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Overdue OS badge — admin only (hidden for invisacook) */}
            {isAdmin && !isInvisacook && overdueData.count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="relative text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5 px-2"
                onClick={() => setShowOverdueModal(true)}
                data-testid="overdue-at-badge"
              >
                <AlertTriangle size={16} />
                <span className="text-xs font-medium hidden sm:inline">OS Atrasadas</span>
                <Badge className="h-5 min-w-5 flex items-center justify-center p-0 text-[10px] bg-red-600 hover:bg-red-600">
                  {overdueData.count}
                </Badge>
              </Button>
            )}

            {/* Notifications — admin only (hidden for invisacook) */}
            {isAdmin && !isInvisacook && (
            <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="relative"
                  data-testid="notifications-button"
                >
                  <Bell size={20} className="text-gray-600" />
                  {unreadCount > 0 && (
                    <Badge 
                      className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs bg-red-500 hover:bg-red-500"
                      data-testid="notifications-badge"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0">
                <NotificationsPanel onClose={() => setNotificationsOpen(false)} />
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </header>

        {/* Page content */}
        {/* New external OS alert banner */}
        {/* New external OS alert banner — admin only */}
        {isAdmin && newOSAlert && (
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between animate-in slide-in-from-top duration-300 shadow-lg" data-testid="new-os-alert">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 animate-pulse" />
              <span className="text-sm font-medium">
                Nova OS {newOSAlert.os_number} chegou no sistema - {newOSAlert.customer_name}
                {newOSAlert.reported_defect ? ` - ${newOSAlert.reported_defect}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { acknowledgeOSAlert(newOSAlert.os_number); setQuickViewOS(newOSAlert.os_number); }}
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-medium"
                data-testid="new-os-alert-view-btn"
              >
                Ver OS
              </button>
              <button
                onClick={() => { acknowledgeOSAlert(newOSAlert.os_number); navigate('/service-orders'); }}
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded font-medium"
                data-testid="new-os-alert-list-btn"
              >
                Ir para Lista
              </button>
              <button
                onClick={() => acknowledgeOSAlert(newOSAlert.os_number)}
                className="text-xs bg-green-500/80 hover:bg-green-500 px-3 py-1 rounded font-semibold"
                data-testid="new-os-alert-ok-btn"
              >
                OK
              </button>
              <button onClick={() => setNewOSAlert(null)} className="text-white/70 hover:text-white" data-testid="new-os-alert-close-btn" title="Dispensar (voltará se a mesma OS ainda não foi reconhecida)">
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 lg:p-8 bg-gray-50">
          {children}
        </main>
      </div>

      {/* Overdue OS Modal */}
      {showOverdueModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowOverdueModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()} data-testid="overdue-at-modal">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="font-semibold text-sm">OS Atrasadas &gt; 10 dias</h2>
                <Badge className="bg-red-100 text-red-700 text-xs">{overdueData.count}</Badge>
              </div>
              <button onClick={() => setShowOverdueModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-3 pt-3 space-y-2">
              <input
                type="text"
                placeholder="Buscar OS, cliente, bairro, cidade..."
                value={overdueSearch}
                onChange={e => setOverdueSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                data-testid="overdue-search-input"
              />
              <div className="flex gap-1.5 flex-wrap">
                {['all', 'Aguardando Analise A.T', 'Aguardando Peças', 'Aguardando Conserto'].map(s => (
                  <button
                    key={s}
                    onClick={() => setOverdueStatusFilter(s)}
                    className={`px-2 py-1 text-[11px] rounded-full border transition-colors ${
                      overdueStatusFilter === s
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                    }`}
                    data-testid={`overdue-filter-${s}`}
                  >
                    {s === 'all' ? 'Todos' : s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {overdueData.orders
                  .filter(o => {
                    if (overdueStatusFilter !== 'all' && o.status !== overdueStatusFilter) return false;
                    if (!overdueSearch.trim()) return true;
                    const q = overdueSearch.toLowerCase();
                    return (
                      (o.os_number || '').toLowerCase().includes(q) ||
                      (o.customer_name || '').toLowerCase().includes(q) ||
                      (o.neighborhood || '').toLowerCase().includes(q) ||
                      (o.city || '').toLowerCase().includes(q) ||
                      (o.brand || '').toLowerCase().includes(q) ||
                      (o.model || '').toLowerCase().includes(q)
                    );
                  })
                  .map(o => (
                  <div key={o.os_number} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50" data-testid={`overdue-os-${o.os_number}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">OS {o.os_number}</span>
                        <Badge variant="outline" className="text-[10px] text-red-600 border-red-200 bg-red-50">{o.days_waiting} dias</Badge>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{o.status}</span>
                      </div>
                      <div className="text-xs text-gray-600 truncate">{o.customer_name}</div>
                      <div className="text-xs text-gray-400 truncate">{o.brand} {o.model} - {o.neighborhood}, {o.city}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 ml-2 text-xs"
                      onClick={() => setQuickViewOS(o.os_number)}
                      data-testid={`overdue-view-${o.os_number}`}
                    >
                      Ver OS
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <OrderDetailOverlay open={!!quickViewOS} onClose={() => setQuickViewOS(null)} osNumber={quickViewOS} />
    </div>
  );
};

export default DashboardLayout;
