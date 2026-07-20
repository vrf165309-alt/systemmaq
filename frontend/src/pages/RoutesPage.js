import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import OrderDetailOverlay from '../components/OrderDetailOverlay';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Slider } from '../components/ui/slider';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import {
  Plus, Search, MapPin, Loader2, Trash2, Copy, Printer, Route, ArrowUpDown,
  ChevronDown, ChevronUp, Phone, Navigation, Clock, X, Pencil, MessageCircle, Map as MapIcon, ExternalLink, AlertTriangle, Square, RefreshCw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

// Static libraries array outside component to prevent Google Maps reload warning
const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry'];

const ROUTE_STATUSES = ['Pendente', 'Em andamento', 'Concluído', 'Cancelado'];

// OS Statuses matching ServiceOrdersPage (excluding Finalizada for route creation)
// Status filter exclusions (these should not appear as filter options)
const EXCLUDED_STATUSES = ['Finalizada'];
// Statuses that are NEVER eligible for a route — Finalizada (done) and
// Cancelada (canceled). Everything else (Aguardando A.T, Aguardando Peças,
// Aguardando Conserto, Em Andamento, Concluida, …) IS eligible.
const ROUTE_EXCLUDED_STATUSES = ['Finalizada', 'Cancelada'];

// Searchable collapsible multi-select component
const SearchableMultiSelect = ({ label, options, selected, onChange, testId }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = search ? options.filter(o => o.toLowerCase().includes(search.toLowerCase())) : options;
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  return (
    <div ref={ref} className="relative" data-testid={testId}>
      <Label className="text-xs">{label} {selected.length > 0 && <span className="text-blue-600 font-medium">({selected.length})</span>}</Label>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 mt-1">
        <span className="truncate text-left">{selected.length > 0 ? selected.slice(0, 2).join(', ') + (selected.length > 2 ? ` +${selected.length - 2}` : '') : `Selecionar ${label.toLowerCase()}...`}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="h-8 text-sm" autoFocus />
          </div>
          <div className="max-h-[180px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 p-2 text-center">Nenhum resultado</p>
            ) : filtered.map(o => (
              <label key={o} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} />
                <span className="truncate">{o}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => onChange([])}>Limpar seleção</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Normalize city/neighborhood: "BELO HORIZONTE" and "Belo Horizonte" → "Belo Horizonte"
// Also strips accents for consistent matching
const stripAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizePlace = (name) => {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

// Group values by normalized form (accent-insensitive), pick the most common original form as display name
const deduplicatePlaces = (values) => {
  const map = {};
  values.forEach(v => {
    if (!v) return;
    const key = stripAccents(v.trim().toLowerCase());
    if (!map[key]) map[key] = {};
    const display = normalizePlace(v);
    map[key][display] = (map[key][display] || 0) + 1;
  });
  return Object.values(map).map(counts => {
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }).sort();
};

// Check if a value matches any of the selected (case and accent insensitive)
const matchesNormalized = (value, selectedList) => {
  if (!selectedList || selectedList.length === 0) return true;
  const norm = stripAccents((value || '').trim().toLowerCase());
  return selectedList.some(s => stripAccents(s.trim().toLowerCase()) === norm);
};


// === MOTORCYCLE ICON — uses a real moto photo from /assets, rotated by heading. No surrounding circle. ===
const MOTO_IMG_URL = '/assets/moto-mastermaq.png';

// Preload the moto PNG and convert to a base64 data URI so it can be safely
// embedded inside an <image> element of an SVG data URI (used by Google Maps
// markers). Without this, browsers often block cross-context image loads.
let _motoBase64Cache = null;
let _motoBase64Promise = null;
const loadMotoBase64 = () => {
  if (_motoBase64Cache) return Promise.resolve(_motoBase64Cache);
  if (_motoBase64Promise) return _motoBase64Promise;
  _motoBase64Promise = fetch(MOTO_IMG_URL)
    .then(r => r.blob())
    .then(b => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { _motoBase64Cache = fr.result; res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(b);
    }))
    .catch(() => MOTO_IMG_URL);
  return _motoBase64Promise;
};
// Kick off preload at module load
if (typeof window !== 'undefined') loadMotoBase64();

const _motoImage = (heading, src) =>
  `<g transform="translate(28,28) rotate(${heading}) translate(-28,-28)"><image href="${src}" x="0" y="0" width="56" height="56" preserveAspectRatio="xMidYMid meet"/></g>`;

const buildMotoSVG = (heading = 0, src = MOTO_IMG_URL) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56">${_motoImage(heading, src)}</svg>`;

// Builds a composite SVG (label "[ Nome ]" pill above the moto) when a technician name is provided.
const buildTechIconSVG = (heading, techName = '', src = MOTO_IMG_URL) => {
  if (!techName) return buildMotoSVG(heading, src);
  const safeName = String(techName).replace(/[<>&"']/g, ' ').slice(0, 24);
  const textWidth = Math.max(60, safeName.length * 7.2 + 22);
  const canvasW = Math.max(textWidth, 56);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasW} 86" width="${canvasW}" height="86">
    <g transform="translate(${(canvasW - textWidth) / 2}, 2)">
      <rect x="0" y="0" rx="9" ry="9" width="${textWidth}" height="22" fill="#111827" stroke="#fff" stroke-width="2"/>
      <text x="${textWidth / 2}" y="15" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">[ ${safeName} ]</text>
    </g>
    <g transform="translate(${(canvasW - 56) / 2}, 28)">${_motoImage(heading, src)}</g>
  </svg>`;
};

// === TECHNICIAN COMBOBOX (shared by Create/Edit/View modals) ===
const TechnicianCombobox = ({ value, onChange, technicians, testId }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = technicians.filter(t => !search || t.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Nome do técnico"
        data-testid={testId}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto">
          {filtered.map(t => (
            <button
              key={t}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 ${t === value ? 'bg-gray-50 font-medium' : ''}`}
              onClick={() => { onChange(t); setOpen(false); setSearch(''); }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// === SHARED ADDRESS NORMALIZATION (module-level, accessible by all components) ===
const normalizeAddressForMaps = (order, includeBairro = false) => {
  let addr = (order.address || '').replace(/\s+/g, ' ').trim();
  addr = addr.replace(/\s*[Nn][ºo°.]\s*/g, ' ').trim();
  addr = addr.replace(/\s*[Nn][Uuú][Mm][Ee][Rr][Oo]\s*/gi, ' ').trim();
  addr = addr.replace(/\s*(APT|APTO|APART|APARTAMENTO|SALA|BL|BLOCO|COMP|COMPL|COMPLEMENTO|LOTE|LT|QUADRA|QD)\s*[.:]*\s*\S*/gi, '').trim();
  addr = addr.replace(/\d{2}\.?\d{3}-?\d{3}/g, '').trim();
  addr = addr.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, m => m.toLowerCase());
  const rawNum = (order.number || '').replace(/\s*[Nn][ºo°.]\s*/g, '').replace(/\s*[Nn][Uuú][Mm][Ee][Rr][Oo]\s*/gi, '').trim();
  const num = rawNum.replace(/[^\d]/g, '').trim();
  const addrHasNum = num && addr.includes(num);
  const street = addrHasNum ? addr : `${addr} ${num}`;
  const city = (order.city || 'Belo Horizonte').trim();
  const state = (order.state || 'MG').trim();
  if (includeBairro) {
    const bairro = (order.neighborhood || '').trim();
    return `${street}, ${bairro}, ${city}, ${state}`.replace(/\s+/g, ' ').replace(/, ,/g, ',').replace(/,\s*,/g, ',').trim();
  }
  return `${street}, ${city}, ${state}`.replace(/\s+/g, ' ').replace(/, ,/g, ',').replace(/,\s*,/g, ',').trim();
};

// === ROUTE MAP DIALOG (split view: map + stops + live location) ===
const BASE_ADDR = 'Rua Descalvado, 636A, Renascença, Belo Horizonte, MG';
const BASE_LAT = -19.8881334;
const BASE_LNG = -43.9420748;

// Haversine distance in meters
const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Voice navigation helper
const speakInstruction = (text, enabled) => {
  if (!enabled || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'pt-BR';
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  window.speechSynthesis.speak(utter);
};

const RouteMapDialog = ({ open, onClose, orders, routeName, token, routeId, userRole = 'admin', userName = '' }) => {
  const isTechnician = userRole === 'technician';
  const mapRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [legInfos, setLegInfos] = useState([]);
  const [locationActive, setLocationActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stopStatuses, setStopStatuses] = useState({});
  const [photoStatusByOS, setPhotoStatusByOS] = useState({}); // {os_number: {count, all_done}}
  const [quickViewOS, setQuickViewOS] = useState(null);
  // New navigation states
  const [followMode, setFollowMode] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [nextInstruction, setNextInstruction] = useState('');
  const [mapCenter, setMapCenter] = useState({ lat: BASE_LAT, lng: BASE_LNG });
  const polylineRef = useRef([]);
  const markersRef = useRef([]);
  const locationMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const channelRef = useRef(null);
  const prevPosRef = useRef(null);
  const animFrameRef = useRef(null);
  const infoWindowRef = useRef(null);
  const allStepsRef = useRef([]);
  const lastSpokenRef = useRef(-1);
  const followModeRef = useRef(true);
  const voiceEnabledRef = useRef(false);
  const navPolylineRef = useRef(null); // Dynamic nav line from tech to next stop
  const navPulseRef = useRef(null); // Pulsing dot at tech position
  const navSegmentsRef = useRef([]); // Per-traffic-segment polylines (Google Maps style)
  const directionsServiceRef = useRef(null);
  // Stores the most recently computed nav route as an array of LatLng for off-route detection.
  const currentNavPathRef = useRef([]);
  // Tracks the next stop os_number for current nav line; cleared when stop changes.
  const currentNavTargetRef = useRef(null);
  // Admin-mirror: marker for the technician's live position when admin views the map.
  const adminLiveMarkerRef = useRef(null);
  const adminLivePollRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  // ─── Restore persistent navigation session on dialog open (technician) + admin live polling ─
  useEffect(() => {
    if (!open || !routeId) return;
    const headers = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

    if (isTechnician) {
      // Try to resume any active session for this route
      axios.get(`${API}/tracking/session/current`, headers).then(res => {
        const ses = res.data?.session;
        if (ses && ses.route_id === routeId) {
          if (ses.stop_statuses && Object.keys(ses.stop_statuses).length) {
            setStopStatuses(ses.stop_statuses);
          }
          // Auto-resume geolocation watch if it was active
          // (we set the flag here; user can press button to stop)
          if (ses.active && !watchIdRef.current) {
            // Small delay so map is loaded
            setTimeout(() => { if (!watchIdRef.current) { try { toggleLocation(); } catch(_){} } }, 600);
          }
        }
      }).catch(() => {});
    } else {
      // ADMIN mirror — poll live position every 5s and render moto marker +
      // tech→customer polyline + sync stop_statuses (so admin sees current
      // OS, in_progress, completed as the technician changes them).
      const adminLineRef = { current: null };
      const pollLive = async () => {
        try {
          const res = await axios.get(`${API}/tracking/live/${routeId}`, headers);
          const live = res.data;
          if (!live || !live.lat || !live.lng || live.active === false) return;
          if (!mapRef.current || !window.google) return;
          const motoSrc = _motoBase64Cache || MOTO_IMG_URL;
          const svg = buildTechIconSVG(live.heading || 0, live.technician || '', motoSrc);
          const iw = live.technician ? Math.max(60, String(live.technician).length * 7.2 + 22) : 56;
          const ih = live.technician ? 86 : 56;
          const icon = {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
            scaledSize: new window.google.maps.Size(iw, ih),
            anchor: new window.google.maps.Point(iw / 2, (live.technician ? 28 : 0) + 28),
          };
          if (!adminLiveMarkerRef.current) {
            adminLiveMarkerRef.current = new window.google.maps.Marker({
              position: { lat: live.lat, lng: live.lng }, map: mapRef.current,
              icon, title: live.technician || 'Técnico em rota', zIndex: 300,
            });
          } else {
            adminLiveMarkerRef.current.setPosition({ lat: live.lat, lng: live.lng });
            adminLiveMarkerRef.current.setIcon(icon);
          }
          // Sync per-OS statuses → so the admin's sidebar shows the same
          // "Iniciado/Concluído/Em rota" badges as the technician's view.
          if (live.stop_statuses && typeof live.stop_statuses === 'object') {
            setStopStatuses(prev => {
              // Only update if there's actually a difference (avoid rerenders)
              const next = { ...prev, ...live.stop_statuses };
              const changed = Object.keys(next).some(k => prev[k] !== next[k]) ||
                              Object.keys(prev).some(k => next[k] !== prev[k]);
              return changed ? next : prev;
            });
          }
          // Draw the REAL road-following polyline from technician's
          // DirectionsService result (sent via /tracking/gps). Falls back
          // to a straight tech→OS line if path not yet available.
          const navPath = (live.nav_path && Array.isArray(live.nav_path) && live.nav_path.length > 1)
            ? live.nav_path
            : null;
          const trafficKey = live.nav_traffic_color || 'normal';
          const colorMap = { lightblue: '#1ec3ff', normal: '#4285F4', yellow: '#f59e0b', red: '#dc2626' };
          const lineColor = colorMap[trafficKey] || '#4285F4';
          let path = navPath;
          if (!path && live.active_os && orders && orders.length) {
            const tgt = orders.find(o => String(o.os_number) === String(live.active_os));
            if (tgt && tgt.lat && tgt.lng) {
              path = [{ lat: live.lat, lng: live.lng }, { lat: tgt.lat, lng: tgt.lng }];
            }
          }
          if (path) {
            if (!adminLineRef.current) {
              adminLineRef.current = new window.google.maps.Polyline({
                map: mapRef.current, path,
                strokeColor: lineColor,
                strokeOpacity: 0.9,
                strokeWeight: 5,
              });
            } else {
              adminLineRef.current.setPath(path);
              adminLineRef.current.setOptions({ strokeColor: lineColor });
            }
          }
        } catch (_) { /* 404 expected when tech not started yet */ }
      };
      pollLive();
      adminLivePollRef.current = setInterval(pollLive, 5000);
      // Capture the polyline ref into outer cleanup
      adminLiveMarkerRef.current = adminLiveMarkerRef.current; // no-op
      // Save for cleanup
      const teardown = () => {
        if (adminLineRef.current) { adminLineRef.current.setMap(null); adminLineRef.current = null; }
      };
      return () => {
        if (adminLivePollRef.current) { clearInterval(adminLivePollRef.current); adminLivePollRef.current = null; }
        if (adminLiveMarkerRef.current) { adminLiveMarkerRef.current.setMap(null); adminLiveMarkerRef.current = null; }
        teardown();
      };
    }
    // IMPORTANT: do NOT depend on `orders` — its reference changes on every
    // parent poll, which would tear down GPS/admin polling and trigger the
    // auto-resume → cycling locationActive on/off. The admin pollLive accesses
    // `orders` via closure only as a fallback when nav_path is missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, routeId, token, isTechnician]);

  // Persist stop_statuses on backend (debounced 800ms) so they survive reload
  const stopStatusesPersistRef = useRef(null);
  useEffect(() => {
    if (!isTechnician || !routeId || !open) return;
    if (Object.keys(stopStatuses).length === 0) return;
    if (stopStatusesPersistRef.current) clearTimeout(stopStatusesPersistRef.current);
    stopStatusesPersistRef.current = setTimeout(() => {
      axios.post(`${API}/tracking/session/stop-statuses`, {
        route_id: routeId, stop_statuses: stopStatuses
      }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
    }, 800);
    return () => { if (stopStatusesPersistRef.current) clearTimeout(stopStatusesPersistRef.current); };
  }, [stopStatuses, isTechnician, routeId, open, token]);

  const cleanup = () => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylineRef.current.forEach(p => p.setMap(null));
    polylineRef.current = [];
    if (navPolylineRef.current) { navPolylineRef.current.setMap(null); navPolylineRef.current = null; }
    if (navPulseRef.current) { navPulseRef.current.setMap(null); navPulseRef.current = null; }
    navSegmentsRef.current.forEach(p => p.setMap(null));
    navSegmentsRef.current = [];
    if (locationMarkerRef.current) { locationMarkerRef.current.setMap(null); locationMarkerRef.current = null; }
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (channelRef.current && supabase) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null; }
    window.speechSynthesis?.cancel();
    prevPosRef.current = null;
    allStepsRef.current = [];
    lastSpokenRef.current = -1;
    setLocationActive(false);
    setFollowMode(true);
    setNextInstruction('');
    currentNavPathRef.current = [];
    currentNavTargetRef.current = null;
  };

  const buildWaypoint = (order) => {
    if (order.lat && order.lng) return { lat: order.lat, lng: order.lng };
    return { address: normalizeAddressForMaps(order) };
  };

  const parseDuration = (durStr) => parseInt((durStr || '0').replace('s', ''), 10) || 0;

  const buildNavUrl = useCallback((sorted) => {
    const baseCoord = `${BASE_LAT},${BASE_LNG}`;
    const points = [baseCoord, ...sorted.map(o => {
      if (o.lat && o.lng) return `${o.lat},${o.lng}`;
      return normalizeAddressForMaps(o);
    }), baseCoord];
    return `https://www.google.com/maps/dir/${points.map(p => encodeURIComponent(p)).join('/')}`;
  }, []);

  const buildStopNavUrl = (order) => {
    if (order.lat && order.lng) return `https://www.google.com/maps/search/?api=1&query=${order.lat},${order.lng}`;
    const full = normalizeAddressForMaps(order);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
  };

  // Returns the minimum distance (meters) from a point to a polyline path (array of {lat,lng}).
  // Approximates each segment with point-to-segment haversine on the closer endpoint;
  // good enough for off-route detection (50-150m thresholds).
  const distanceToPath = (lat, lng, path) => {
    if (!path || path.length === 0) return Infinity;
    let min = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversine(lat, lng, path[i].lat, path[i].lng);
      if (d < min) min = d;
    }
    return min;
  };

  // Draw dynamic navigation line from technician to next uncompleted stop.
  // Uses our backend `/api/routes/nav-leg` (Routes API v2 with TRAFFIC_ON_POLYLINE)
  // so we can render colored segments per traffic level — just like Google Maps.
  const updateNavLine = useCallback(async (techLat, techLng) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) { return; }
    if (!routeData?.sorted) { return; }

    const nextStop = routeData.sorted.find(o => {
      const status = stopStatuses[o.os_number];
      return !status || status === 'pending' || status === 'arrived' || status === 'in_transit';
    });
    if (!nextStop || !nextStop.lat || !nextStop.lng) {
      if (navPolylineRef.current) { navPolylineRef.current.setMap(null); navPolylineRef.current = null; }
      if (navPulseRef.current) { navPulseRef.current.setMap(null); navPulseRef.current = null; }
      navSegmentsRef.current.forEach(p => p.setMap(null));
      navSegmentsRef.current = [];
      return;
    }

    const clearLines = () => {
      if (navPolylineRef.current) { navPolylineRef.current.setMap(null); navPolylineRef.current = null; }
      if (navPulseRef.current) { navPulseRef.current.setMap(null); navPulseRef.current = null; }
      navSegmentsRef.current.forEach(p => p.setMap(null));
      navSegmentsRef.current = [];
    };

    // Helper: straight-line fallback so the user sees a line immediately
    const renderStraightFallback = () => {
      const path = [{ lat: techLat, lng: techLng }, { lat: nextStop.lat, lng: nextStop.lng }];
      // Keep the straight fallback ONLY if no real line is drawn yet.
      if (navPolylineRef.current || navSegmentsRef.current.length > 0) return;
      navPulseRef.current = new window.google.maps.Polyline({
        path, strokeColor: '#4285F4', strokeOpacity: 0.25, strokeWeight: 14, map, zIndex: 5,
      });
      navPolylineRef.current = new window.google.maps.Polyline({
        path, strokeColor: '#4285F4', strokeOpacity: 1, strokeWeight: 6, map, zIndex: 6,
      });
    };

    renderStraightFallback();

    try {
      const res = await axios.post(`${API}/routes/nav-leg`, {
        origin_lat: techLat, origin_lng: techLng,
        dest_lat: nextStop.lat, dest_lng: nextStop.lng,
      }, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

      const data = res.data || {};
      const encoded = data.encoded_polyline;
      if (!encoded || !window.google.maps.geometry?.encoding) {
        return; // straight fallback already drawn
      }
      const fullPath = window.google.maps.geometry.encoding.decodePath(encoded)
        .map(p => ({ lat: p.lat(), lng: p.lng() }));
      if (fullPath.length < 2) return;

      currentNavPathRef.current = fullPath;
      currentNavTargetRef.current = nextStop.os_number;

      // Remove fallback / old segments
      clearLines();

      // Glow under the entire route
      navPulseRef.current = new window.google.maps.Polyline({
        path: fullPath, strokeColor: '#1a73e8', strokeOpacity: 0.18, strokeWeight: 14, map, zIndex: 5,
      });

      // Build per-segment polylines from speedReadingIntervals.
      // Google Maps colors: NORMAL=#4285F4 (blue), SLOW=#f59e0b (amber), TRAFFIC_JAM=#dc2626 (red).
      const SPEED_COLOR = { NORMAL: '#4285F4', SLOW: '#f59e0b', TRAFFIC_JAM: '#dc2626' };
      const intervals = Array.isArray(data.speed_reading_intervals) ? data.speed_reading_intervals : [];

      const segments = [];
      if (intervals.length > 0) {
        intervals.forEach(iv => {
          const start = Math.max(0, iv.startPolylinePointIndex || 0);
          const end = Math.min(fullPath.length - 1, iv.endPolylinePointIndex ?? (fullPath.length - 1));
          if (end <= start) return;
          const segPath = fullPath.slice(start, end + 1);
          const color = SPEED_COLOR[iv.speed] || '#4285F4';
          segments.push({ path: segPath, color });
        });
      }
      if (segments.length === 0) {
        // No traffic data — single blue polyline
        segments.push({ path: fullPath, color: '#4285F4' });
      }

      segments.forEach((seg, idx) => {
        const isLast = idx === segments.length - 1;
        const pl = new window.google.maps.Polyline({
          path: seg.path,
          geodesic: true,
          strokeColor: seg.color,
          strokeOpacity: 1,
          strokeWeight: 6,
          map,
          zIndex: 6,
          icons: isLast ? [{
            icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: '#fff', fillOpacity: 0.9, strokeWeight: 0 },
            offset: '100%',
          }] : [],
        });
        navSegmentsRef.current.push(pl);
      });

      // Aggregate ETA based on duration_in_traffic
      const distM = data.distance_meters || 0;
      const durSec = data.duration_seconds || 0;
      const distText = distM > 1000 ? `${(distM / 1000).toFixed(1)} km` : `${Math.round(distM)} m`;
      const durMin = Math.max(1, Math.round(durSec / 60));
      setNextInstruction(`${nextStop.customer_name} - ${distText}, ${durMin} min`);

      // Publish nav data to backend so admin/public viewers see the same route
      if (routeId && isTechnician) {
        axios.post(`${API}/tracking/gps`, {
          route_id: routeId,
          lat: techLat, lng: techLng,
          heading: 0, speed: 0,
          technician: userName || '',
          active_os: nextStop.os_number,
          active_status: stopStatuses[nextStop.os_number] || 'in_transit',
          nav_path: fullPath,
          nav_distance_meters: distM,
          nav_duration_seconds: durSec,
          nav_duration_in_traffic_seconds: durSec,
          nav_traffic_color: 'segmented',
          nav_destination_lat: nextStop.lat,
          nav_destination_lng: nextStop.lng,
        }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
      }
    } catch (e) {
      console.warn('[NavLine] /nav-leg failed — keeping straight fallback', e?.response?.status);
    }
  }, [routeData, stopStatuses, routeId, isTechnician, token, userName]);

  // Animate marker smoothly between positions
  const animateMarker = useCallback((marker, fromLat, fromLng, toLat, toLng, heading) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const duration = 2000;
    const startTime = performance.now();
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = fromLat + (toLat - fromLat) * ease;
      const lng = fromLng + (toLng - fromLng) * ease;
      marker.setPosition({ lat, lng });
      if (t < 1) animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Check voice navigation progress
  const checkVoiceNavigation = useCallback((lat, lng) => {
    const steps = allStepsRef.current;
    if (!steps.length) return;

    // Find closest upcoming step
    for (let i = 0; i < steps.length; i++) {
      if (i <= lastSpokenRef.current) continue;
      const step = steps[i];
      if (!step.startLat || !step.startLng) continue;
      const dist = haversine(lat, lng, step.startLat, step.startLng);

      // Within 80m of step start → announce
      if (dist < 80) {
        lastSpokenRef.current = i;
        const instr = step.instruction;
        if (instr) {
          setNextInstruction(instr);
          speakInstruction(instr, voiceEnabledRef.current);
        }
        break;
      }
      // Within 200m → show preview
      if (dist < 200 && i > lastSpokenRef.current) {
        setNextInstruction(step.instruction || '');
        break;
      }
    }

    // Check if near any stop (within 50m)
    const sorted = routeData?.sorted || [];
    for (let i = 0; i < sorted.length; i++) {
      const o = sorted[i];
      if (!o.lat || !o.lng) continue;
      const dist = haversine(lat, lng, parseFloat(o.lat), parseFloat(o.lng));
      if (dist < 50) {
        const msg = `Você chegou na parada ${i + 1}. OS ${o.os_number}. ${o.customer_name || ''}`;
        if (lastSpokenRef.current !== -(i + 100)) {
          lastSpokenRef.current = -(i + 100);
          setNextInstruction(msg);
          speakInstruction(msg, voiceEnabledRef.current);
        }
        break;
      }
    }
  }, [routeData]);

  // Start/stop real-time location tracking
  const toggleLocation = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      if (locationMarkerRef.current) { locationMarkerRef.current.setMap(null); locationMarkerRef.current = null; }
      if (channelRef.current && supabase) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
      window.speechSynthesis?.cancel();
      prevPosRef.current = null;
      lastSpokenRef.current = -1;
      setLocationActive(false);
      setFollowMode(true);
      setNextInstruction('');
      if (routeId) {
        axios.post(`${API}/tracking/end`, { route_id: routeId, technician: '' }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
        // Mark persistent session as ended (idempotent)
        axios.post(`${API}/tracking/session/stop`, { route_id: routeId }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
      }
      return;
    }

    if (!navigator.geolocation) { toast.error('Geolocalização não suportada neste navegador'); return; }

    // Setup Supabase Realtime channel (best-effort, non-blocking)
    if (routeId && supabase) {
      // Subscribe in background so the GPS callback starts immediately.
      // Without this delay, the first geolocation tick can be held up by
      // the realtime handshake — making "Iniciar Navegação" feel laggy.
      setTimeout(() => {
        try {
          const channel = supabase.channel(`tracking-${routeId}`);
          channel.subscribe();
          channelRef.current = channel;
        } catch (_) { /* ignore */ }
      }, 0);
      axios.post(`${API}/tracking/start`, { route_id: routeId, technician: '' }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
      // Persist active session so we can auto-resume after reload / modal close.
      axios.post(`${API}/tracking/session/start`, { route_id: routeId, technician_name: userName || '' }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
    }

    setFollowMode(true);
    followModeRef.current = true;

    const map = mapRef.current;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const heading = pos.coords.heading || 0;
        const speed = (pos.coords.speed || 0) * 3.6;

        const motoSrc = _motoBase64Cache || MOTO_IMG_URL;
        const svgIcon = buildTechIconSVG(heading, isTechnician ? userName : '', motoSrc);
        // Anchor: y depends on whether label is present (label adds ~28px above the moto)
        const labelOffset = isTechnician && userName ? 28 : 0;
        const iconWidth = isTechnician && userName ? Math.max(60, String(userName).length * 7.2 + 22) : 56;
        const iconHeight = isTechnician && userName ? 86 : 56;
        const iconData = {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgIcon)}`,
          scaledSize: new window.google.maps.Size(iconWidth, iconHeight),
          anchor: new window.google.maps.Point(iconWidth / 2, labelOffset + 28),
        };

        if (!locationMarkerRef.current) {
          locationMarkerRef.current = new window.google.maps.Marker({
            position: { lat: newLat, lng: newLng }, map,
            icon: iconData, title: 'Sua localização', zIndex: 200,
          });
          prevPosRef.current = { lat: newLat, lng: newLng };
          setLocationActive(true);
          setMapCenter({ lat: newLat, lng: newLng });
          // Initial zoom to navigation level
          map.setZoom(17);
          map.panTo({ lat: newLat, lng: newLng });
        } else {
          const prev = prevPosRef.current || { lat: newLat, lng: newLng };
          locationMarkerRef.current.setIcon(iconData);
          animateMarker(locationMarkerRef.current, prev.lat, prev.lng, newLat, newLng, heading);
          prevPosRef.current = { lat: newLat, lng: newLng };
        }

        // Auto-follow: center map on technician (offset to lower third)
        if (followModeRef.current) {
          const currentZoom = map.getZoom();
          const navZoom = currentZoom < 15 ? 17 : currentZoom;
          if (currentZoom < 15) map.setZoom(navZoom);
          // Offset center so moto appears in lower third
          const offsetLat = 0.0008 * Math.pow(2, 17 - navZoom);
          map.panTo({ lat: newLat + offsetLat, lng: newLng });
        }

        // Broadcast via Supabase Realtime
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast', event: 'gps',
            payload: { lat: newLat, lng: newLng, heading, speed, timestamp: Date.now() },
          });
        }

        // Save breadcrumb to backend (every 10 seconds via throttle)
        if (routeId && Date.now() - (prevPosRef.current?._lastBreadcrumb || 0) > 10000) {
          prevPosRef.current._lastBreadcrumb = Date.now();
          axios.post(`${API}/tracking/breadcrumb`, {
            route_id: routeId, lat: newLat, lng: newLng, heading, speed
          }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});

          // Also upsert live position (for admin live-mirror & public tracking pages).
          // Find which OS is currently being attended or transit-targeted.
          const activeOSEntry = sorted.find(s => ['in_progress','in_transit'].includes(stopStatuses[s.os_number]));
          axios.post(`${API}/tracking/gps`, {
            route_id: routeId, lat: newLat, lng: newLng, heading, speed,
            technician: userName || '',
            active_os: activeOSEntry?.os_number || null,
            active_status: activeOSEntry ? stopStatuses[activeOSEntry.os_number] : null,
          }, token ? { headers: { Authorization: `Bearer ${token}` } } : {}).catch(() => {});
        }

        // Voice navigation check
        checkVoiceNavigation(newLat, newLng);

        // Update navigation line with STABLE recalc logic — only recalculate
        // when truly necessary so the route doesn't flicker / restart.
        //  - First GPS tick (no path yet)                                → recalculate
        //  - Target stop changed (admin/tech moved to next OS)           → recalculate
        //  - Off-route detected: ≥3 consecutive readings >120m off path  → recalculate
        // We DELIBERATELY do NOT recalc on a fixed interval — the line stays
        // drawn until it actually becomes invalid.
        const now = Date.now();
        const lastNav = prevPosRef.current?._lastNavUpdate || 0;
        const path = currentNavPathRef.current;
        const offRouteDist = distanceToPath(newLat, newLng, path);
        const OFF_ROUTE_THRESHOLD_M = 120; // accounts for typical urban GPS drift
        const isOffRoute = path.length > 0 && offRouteDist > OFF_ROUTE_THRESHOLD_M;
        // Hysteresis: require consecutive off-route readings to avoid spurious recalcs
        const streak = (prevPosRef.current?._offRouteStreak || 0) + (isOffRoute ? 1 : 0);
        if (prevPosRef.current) prevPosRef.current._offRouteStreak = isOffRoute ? streak : 0;
        const upcoming = routeData?.sorted?.find(o => {
          const status = stopStatuses[o.os_number];
          return !status || status === 'pending' || status === 'arrived' || status === 'in_transit';
        });
        const targetChanged = upcoming && upcoming.os_number !== currentNavTargetRef.current;
        const noLineYet = !navPolylineRef.current && navSegmentsRef.current.length === 0;
        const elapsed = now - lastNav;

        if (noLineYet || targetChanged || (streak >= 3 && elapsed > 3000)) {
          if (prevPosRef.current) {
            prevPosRef.current._lastNavUpdate = now;
            prevPosRef.current._offRouteStreak = 0;
          }
          if (streak >= 3) setNextInstruction('Recalculando rota...');
          updateNavLine(newLat, newLng);
        }

        // Geofencing: auto-detect arrival at stops (within 100m)
        if (routeData?.sorted) {
          routeData.sorted.forEach((os) => {
            if (os.lat && os.lng) {
              const dist = haversine(newLat, newLng, os.lat, os.lng);
              if (dist < 100) {
                setStopStatuses(prev => {
                  if (!prev[os.os_number] || prev[os.os_number] === 'pending') {
                    speakInstruction(`Você chegou na OS ${os.os_number}, ${os.customer_name}`, voiceEnabledRef.current);
                    return { ...prev, [os.os_number]: 'arrived' };
                  }
                  return prev;
                });
              }
            }
          });
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        if (err.code === 1) toast.error('Permissão de localização negada');
        else toast.error('Erro ao obter localização');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    // Announce start
    speakInstruction('Navegação iniciada', true);
  }, [routeId, token, animateMarker, checkVoiceNavigation, routeData, updateNavLine, isTechnician, userName]);

  // Photos status checker (technician completion gate)
  const refreshPhotoStatus = useCallback(async (osNumber) => {
    try {
      const res = await axios.get(`${API}/service-orders/${osNumber}/photos-status`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      setPhotoStatusByOS(prev => ({ ...prev, [osNumber]: res.data }));
      return res.data;
    } catch {
      return null;
    }
  }, [token]);

  // Share current GPS via WhatsApp (admin variant)
  const shareLocationViaWA = useCallback(() => {
    if (!navigator.geolocation) { toast.error('Geolocalização não suportada'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        const text = encodeURIComponent(`Localização atual: ${url}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
      },
      () => toast.error('Não foi possível obter sua localização')
    );
  }, []);

  // Detect manual pan → disable follow
  useEffect(() => {
    if (!mapRef.current || !locationActive) return;
    const map = mapRef.current;
    const listener = map.addListener('dragstart', () => {
      setFollowMode(false);
      followModeRef.current = false;
    });
    return () => window.google?.maps?.event?.removeListener(listener);
  }, [locationActive]);

  const recenterOnTech = useCallback(() => {
    if (!mapRef.current || !prevPosRef.current) return;
    setFollowMode(true);
    followModeRef.current = true;
    mapRef.current.setZoom(17);
    const offsetLat = 0.0008;
    mapRef.current.panTo({ lat: prevPosRef.current.lat + offsetLat, lng: prevPosRef.current.lng });
  }, []);

  const drawRouteOnMap = useCallback((map, route, sorted) => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    polylineRef.current.forEach(p => p.setMap(null));
    polylineRef.current = [];
    if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null; }

    const path = window.google.maps.geometry.encoding.decodePath(route.polyline.encodedPolyline);

    // Shadow polyline (route overview - lighter when navigating)
    polylineRef.current.push(new window.google.maps.Polyline({
      path, geodesic: true, strokeColor: '#9CA3AF', strokeOpacity: 0.2, strokeWeight: 8, map, zIndex: 1,
    }));
    // Main polyline (route overview - dashed gray to show planned route)
    polylineRef.current.push(new window.google.maps.Polyline({
      path, geodesic: true, strokeColor: '#9CA3AF', strokeOpacity: 0.5, strokeWeight: 3, map, zIndex: 2,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.5, scale: 3 }, offset: '0', repeat: '15px' }],
    }));

    const bounds = new window.google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });

    const legs = route.legs || [];
    const infos = [];

    // Create shared InfoWindow
    const iw = new window.google.maps.InfoWindow();
    infoWindowRef.current = iw;

    // Origin marker (green)
    if (legs.length > 0) {
      const sl = legs[0].startLocation?.latLng;
      if (sl) {
        const marker = new window.google.maps.Marker({
          position: { lat: sl.latitude, lng: sl.longitude }, map,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#10B981', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
          title: 'Base (Saída)', zIndex: 100,
        });
        marker.addListener('click', () => {
          iw.setContent('<div style="font-family:system-ui;padding:4px 2px"><strong style="color:#10B981">Base (Saída)</strong><br/><span style="font-size:12px;color:#666">Rua Descalvado, 636A<br/>Renascença, BH</span></div>');
          iw.open(map, marker);
        });
        markersRef.current.push(marker);
      }
    }

    // Numbered stop markers with InfoWindows
    for (let i = 0; i < legs.length - 1; i++) {
      const el = legs[i].endLocation?.latLng;
      if (!el) continue;
      const os = sorted[i];
      const marker = new window.google.maps.Marker({
        position: { lat: el.latitude, lng: el.longitude }, map,
        label: { text: String(i + 1), color: '#fff', fontSize: '12px', fontWeight: 'bold' },
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 16, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        title: `${i + 1}. OS ${os?.os_number || ''}`,
        zIndex: 50 + i,
      });

      // InfoWindow content for this stop
      const addr = os ? `${os.address || ''} ${os.number || ''}, ${os.neighborhood || ''}`.trim().replace(/, $/, '') : '';
      const obs = os?.route_observations || os?.observations || '';
      const iwContent = `<div style="font-family:system-ui;padding:4px 2px;max-width:260px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="background:#4285F4;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0">${i + 1}</span>
          <strong style="font-size:13px">OS ${os?.os_number || ''}</strong>
        </div>
        <div style="font-size:12px;color:#333;margin-bottom:2px">${os?.customer_name || ''}</div>
        <div style="font-size:11px;color:#888;margin-bottom:2px">${addr}${os?.city ? `, ${os.city}` : ''}</div>
        ${obs ? `<div style="font-size:11px;color:#2563eb;background:#eff6ff;padding:4px 6px;border-radius:4px;margin-top:4px"><strong>Obs:</strong> ${obs}</div>` : ''}
        ${legInfos[i] ? `<div style="font-size:10px;color:#999;margin-top:4px">${legInfos[i].dist?.toFixed(1) || '?'} km &bull; ${legInfos[i].dur || '?'} min</div>` : ''}
      </div>`;

      marker.addListener('click', () => {
        iw.setContent(iwContent);
        iw.open(map, marker);
      });
      markersRef.current.push(marker);

      infos.push({ dist: (legs[i].distanceMeters || 0) / 1000, dur: Math.round(parseDuration(legs[i].duration) / 60) });
    }

    // Return marker (red)
    if (legs.length > 0) {
      const ll = legs[legs.length - 1].endLocation?.latLng;
      if (ll) {
        const marker = new window.google.maps.Marker({
          position: { lat: ll.latitude, lng: ll.longitude }, map,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#EF4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
          title: 'Retorno Base', zIndex: 99,
        });
        marker.addListener('click', () => {
          iw.setContent('<div style="font-family:system-ui;padding:4px 2px"><strong style="color:#EF4444">Retorno Base</strong><br/><span style="font-size:12px;color:#666">Rua Descalvado, 636A</span></div>');
          iw.open(map, marker);
        });
        markersRef.current.push(marker);
      }
      infos.push({ dist: (legs[legs.length - 1].distanceMeters || 0) / 1000, dur: Math.round(parseDuration(legs[legs.length - 1].duration) / 60) });
    }

    // Extract all navigation steps for voice
    const navSteps = [];
    for (const leg of legs) {
      for (const step of (leg.steps || [])) {
        const instr = step.navigationInstruction?.instructions || '';
        const maneuver = step.navigationInstruction?.maneuver || '';
        const sl = step.startLocation?.latLng;
        if (instr && sl) {
          navSteps.push({
            instruction: instr,
            maneuver,
            startLat: sl.latitude,
            startLng: sl.longitude,
            distanceMeters: step.distanceMeters || 0,
          });
        }
      }
    }
    allStepsRef.current = navSteps;

    setLegInfos(infos);
    const totalDist = legs.reduce((s, l) => s + (l.distanceMeters || 0), 0);
    const totalDur = legs.reduce((s, l) => s + parseDuration(l.duration), 0);
    const mins = Math.round(totalDur / 60);
    setRouteInfo({
      distance: `${(totalDist / 1000).toFixed(1)} km`,
      duration: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins}min`,
      stops: sorted.length,
    });
  }, []);

  // Fetch route data — depend on a stable signature so that polling
  // refreshes that don't actually change positions DON'T tear down
  // navigation (which would oscillate locationActive on/off).
  const ordersSignature = React.useMemo(() => {
    if (!orders) return '';
    return orders
      .slice()
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      .map(o => `${o.os_number}|${o.lat || ''}|${o.lng || ''}|${o.sequence || 0}`)
      .join('::');
  }, [orders]);

  useEffect(() => {
    if (!open || !orders || orders.length < 2) return;
    setLoading(true);
    setError(null);
    setRouteInfo(null);
    setLegInfos([]);

    const sorted = [...orders].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    // Set initial map center to first order with coords, or base
    const firstWithCoords = sorted.find(o => o.lat && o.lng);
    if (firstWithCoords) {
      setMapCenter({ lat: firstWithCoords.lat, lng: firstWithCoords.lng });
    } else {
      setMapCenter({ lat: BASE_LAT, lng: BASE_LNG });
    }
    const fetchRoute = async () => {
      try {
        const BASE_WP = { lat: BASE_LAT, lng: BASE_LNG };
        const res = await axios.post(`${API}/routes/compute-route`, {
          origin: BASE_WP, destination: BASE_WP,
          intermediates: sorted.map(buildWaypoint),
          optimize_waypoint_order: false,
        }, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
        const route = res.data.routes?.[0];
        if (!route) throw new Error('Nenhuma rota encontrada');
        setRouteData({ route, sorted });
        if (mapRef.current) drawRouteOnMap(mapRef.current, route, sorted);
      } catch (err) {
        console.error('RouteMapDialog error:', err);
        setError(err.response?.data?.detail || err.message || 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };
    fetchRoute();
    return () => { cleanup(); setRouteData(null); };
  // IMPORTANT: do NOT depend on `orders` directly — its reference changes on
  // every parent refresh (polling), which would tear down GPS tracking. We
  // only re-fetch when the actual OS list/coords/sequence changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ordersSignature, token, drawRouteOnMap]);

  const handleMapLoad = useCallback((map) => {
    mapRef.current = map;
    if (routeData) drawRouteOnMap(map, routeData.route, routeData.sorted);
  }, [routeData, drawRouteOnMap]);

  const sorted = routeData?.sorted || [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cleanup(); onClose(v); }}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden" data-testid="route-map-dialog">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-white z-10 relative">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <MapIcon className="h-4 w-4" /> {routeName || 'Rota'}
          </DialogTitle>
          <div className="flex items-center gap-3">
            {routeInfo && (
              <div className="hidden sm:flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Navigation className="h-3 w-3" />{routeInfo.distance}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{routeInfo.duration}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{routeInfo.stops} paradas</span>
              </div>
            )}
            <button onClick={() => { cleanup(); onClose(false); }} className="rounded-full p-1 hover:bg-gray-100 transition-colors" data-testid="close-map-btn">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Voice instruction banner */}
        {locationActive && nextInstruction && (
          <div className="px-4 py-2.5 bg-gray-900 text-white flex items-center gap-3 animate-in slide-in-from-top duration-300" data-testid="voice-instruction-banner">
            <Navigation className="h-5 w-5 text-blue-400 shrink-0" />
            <span className="text-sm font-medium flex-1 truncate">{nextInstruction}</span>
          </div>
        )}

        {/* Navigation progress bar */}
        {locationActive && routeInfo && (
          <div className="px-4 py-1.5 bg-blue-600 text-white flex items-center justify-between text-xs" data-testid="nav-progress-bar">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{Object.values(stopStatuses).filter(s => s === 'completed').length}/{sorted.length} concluídas</span>
              <span className="flex items-center gap-1"><Navigation className="h-3 w-3" />{routeInfo.distance}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />ETA {routeInfo.duration}</span>
            </div>
            {!followMode && (
              <button onClick={recenterOnTech} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[10px] font-medium">
                Recentralizar
              </button>
            )}
          </div>
        )}

        {/* Split view: sidebar + map */}
        <div className="flex flex-1 overflow-hidden" style={{ height: locationActive && nextInstruction ? 'calc(85vh - 92px)' : 'calc(85vh - 52px)' }}>
          {/* Sidebar */}
          <div className={`border-r bg-gray-50 flex flex-col shrink-0 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {/* Base */}
                <div className="flex items-start gap-2 px-2 py-2 rounded-lg bg-green-50 border border-green-200">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">A</div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-green-800">Base (Saída)</div>
                    <div className="text-[10px] text-green-600 truncate">Rua Descalvado, 636A</div>
                  </div>
                </div>

                {sorted.map((o, i) => {
                  const status = stopStatuses[o.os_number] || 'pending';
                  const statusColors = {
                    pending: 'bg-gray-100 border-gray-200',
                    arrived: 'bg-amber-50 border-amber-300',
                    in_progress: 'bg-blue-50 border-blue-300',
                    in_transit: 'bg-indigo-50 border-indigo-300',
                    completed: 'bg-green-50 border-green-300',
                  };
                  const dotColors = {
                    pending: 'bg-blue-500',
                    arrived: 'bg-amber-500',
                    in_progress: 'bg-blue-600 animate-pulse',
                    in_transit: 'bg-indigo-600 animate-pulse',
                    completed: 'bg-green-500',
                  };
                  const ps = photoStatusByOS[o.os_number];
                  const photosDone = !!ps?.all_done;
                  const photosCount = ps?.count ?? 0;

                  // Global gate: is there any active OS (in_progress) WITHOUT 8 photos?
                  // If yes → block starting/completing OTHER OS until photos are uploaded.
                  const activeOS = sorted.find(s => (stopStatuses[s.os_number] === 'in_progress'));
                  const activeOSPhotos = activeOS ? photoStatusByOS[activeOS.os_number] : null;
                  const blockedByOther = isTechnician && activeOS && activeOS.os_number !== o.os_number && !(activeOSPhotos?.all_done);

                  return (
                  <div key={o.os_number} className={`flex items-start gap-2 px-2 py-2 rounded-lg border transition-colors group ${statusColors[status]}`} data-testid={`map-stop-${o.os_number}`}>
                    <div className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${dotColors[status]}`}>
                      {status === 'completed' ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">
                        OS {o.os_number}
                        {o.priority && <span className="ml-1 text-[9px] text-red-600 font-bold">PRIORIDADE</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">{o.customer_name}</div>
                      <div className="text-[10px] text-gray-400 truncate">{o.neighborhood} - {o.city}</div>
                      {legInfos[i] && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{legInfos[i].dist.toFixed(1)} km - {legInfos[i].dur} min</div>
                      )}
                      {/* Photos status badge — visible for technicians once in_progress */}
                      {isTechnician && status === 'in_progress' && (
                        <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${photosDone ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          Fotos: {photosCount}/8 {photosDone ? '✓' : ''}
                        </div>
                      )}
                      {/* In-transit badge */}
                      {status === 'in_transit' && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          Em rota para esta OS
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {/* Ver OS button — always visible */}
                        <button
                          onClick={() => setQuickViewOS(o.os_number)}
                          className="text-[10px] bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-50"
                          data-testid={`map-view-os-${o.os_number}`}
                        >
                          Ver OS
                        </button>
                        {/* Compartilhar localização — visible for pending/in_transit OSs (not in_progress/completed) */}
                        {(status === 'pending' || status === 'arrived' || status === 'in_transit') && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await axios.post(`${API}/tracking/share-token`, { route_id: routeId, os_number: o.os_number }, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
                                const url = `${window.location.origin}/track/${res.data.token}`;
                                const text = encodeURIComponent(`Olá! Acompanhe a chegada do técnico em tempo real: ${url}`);
                                window.open(`https://wa.me/?text=${text}`, '_blank');
                                navigator.clipboard?.writeText(url).catch(() => {});
                                toast.success('Link copiado e WhatsApp aberto');
                              } catch (e) {
                                toast.error(e?.response?.data?.detail || 'Não foi possível gerar o link');
                              }
                            }}
                            className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700"
                            data-testid={`map-share-${o.os_number}`}
                            title="Compartilhar localização do técnico com o cliente desta OS"
                          >
                            Compartilhar Localização
                          </button>
                        )}
                        {/* Action buttons for navigation — only technician + active route */}
                        {isTechnician && locationActive && (status === 'pending' || status === 'in_transit') && (
                          <button
                            onClick={() => {
                              if (blockedByOther) {
                                toast.error('Anexe todas as 8 fotos para o laudo, para conseguir concluir e avançar de atendimento', { duration: 6000 });
                                return;
                              }
                              setStopStatuses(prev => ({ ...prev, [o.os_number]: 'in_progress' }));
                              refreshPhotoStatus(o.os_number);
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded ${blockedByOther ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                            data-testid={`map-start-${o.os_number}`}
                            disabled={blockedByOther}
                          >
                            Iniciar Atendimento
                          </button>
                        )}
                        {isTechnician && locationActive && status === 'arrived' && (
                          <button
                            onClick={() => {
                              if (blockedByOther) {
                                toast.error('Anexe todas as 8 fotos para o laudo, para conseguir concluir e avançar de atendimento', { duration: 6000 });
                                return;
                              }
                              setStopStatuses(prev => ({ ...prev, [o.os_number]: 'in_progress' }));
                              refreshPhotoStatus(o.os_number);
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded ${blockedByOther ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white animate-pulse hover:bg-blue-700'}`}
                            data-testid={`map-start-${o.os_number}`}
                            disabled={blockedByOther}
                          >
                            Iniciar Atendimento
                          </button>
                        )}
                        {isTechnician && locationActive && status === 'in_progress' && (
                          <button
                            onClick={async () => {
                              const fresh = await refreshPhotoStatus(o.os_number);
                              if (!fresh?.all_done) {
                                toast.error('Anexe todas as 8 fotos para o laudo, para conseguir concluir e avançar de atendimento', { duration: 6000 });
                                return;
                              }
                              setStopStatuses(prev => {
                                const next = { ...prev, [o.os_number]: 'completed' };
                                // Find the NEXT pending stop and mark it as 'in_transit' to represent "Em rota"
                                const pendingNext = sorted.find(s => !next[s.os_number] || next[s.os_number] === 'pending');
                                if (pendingNext) next[pendingNext.os_number] = 'in_transit';
                                return next;
                              });
                            }}
                            className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700"
                            data-testid={`map-complete-${o.os_number}`}
                          >
                            Concluir Atendimento
                          </button>
                        )}
                      </div>
                    </div>
                    <a href={buildStopNavUrl(o)} target="_blank" rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                      title="Navegar até este endereço">
                      <Navigation className="h-3.5 w-3.5 text-blue-500" />
                    </a>
                  </div>
                  );
                })}

                {/* Return */}
                <div className="flex items-start gap-2 px-2 py-2 rounded-lg bg-red-50 border border-red-200">
                  <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">B</div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-red-800">Retorno Base</div>
                    {legInfos[sorted.length] && (
                      <div className="text-[10px] text-red-600">{legInfos[sorted.length].dist.toFixed(1)} km - {legInfos[sorted.length].dur} min</div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Bottom actions */}
            {sorted.length > 0 && (
              <div className="p-3 border-t bg-white space-y-2">
                {isTechnician ? (
                  <button
                    onClick={toggleLocation}
                    className={`flex items-center justify-center gap-2 w-full text-sm font-medium py-2.5 rounded-lg transition-colors ${locationActive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                    data-testid="start-navigation-btn"
                  >
                    {locationActive ? (
                      <><Square className="h-4 w-4" />Parar Navegação</>
                    ) : (
                      <><Navigation className="h-4 w-4" />Iniciar Navegação</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={shareLocationViaWA}
                    className="flex items-center justify-center gap-2 w-full text-sm font-medium py-2.5 rounded-lg transition-colors bg-green-600 hover:bg-green-700 text-white"
                    data-testid="share-location-btn"
                    title="Apenas técnicos podem iniciar a navegação. Como admin, você pode compartilhar sua localização via WhatsApp."
                  >
                    <MessageCircle className="h-4 w-4" /> Compartilhar Localização (WhatsApp)
                  </button>
                )}
                {locationActive && isTechnician && (
                  <button
                    onClick={() => setVoiceEnabled(v => !v)}
                    className={`flex items-center justify-center gap-2 w-full text-xs font-medium py-2 rounded-lg border transition-colors ${voiceEnabled ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                    data-testid="toggle-voice-btn"
                  >
                    {voiceEnabled ? 'Voz Ativada' : 'Ativar Voz'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="absolute top-3 left-3 z-20 bg-white shadow-md rounded-full w-9 h-9 flex items-center justify-center hover:bg-gray-50 border transition-colors"
              data-testid="toggle-sidebar-btn"
              title={sidebarOpen ? 'Recolher paradas' : 'Ver paradas'}
            >
              {sidebarOpen ? <ChevronDown className="h-4 w-4 -rotate-90" /> : <ChevronDown className="h-4 w-4 rotate-90" />}
            </button>

            {/* Floating route info (mobile) */}
            {!sidebarOpen && routeInfo && !locationActive && (
              <div className="absolute top-3 left-14 z-20 bg-white shadow-md rounded-lg px-3 py-2 flex gap-3 text-xs text-gray-600">
                <span>{routeInfo.distance}</span>
                <span>{routeInfo.duration}</span>
                <span>{routeInfo.stops} paradas</span>
              </div>
            )}

            {/* Navigation controls overlay */}
            {locationActive && (
              <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
                {/* Recenter button (shows when not following) */}
                {!followMode && (
                  <button
                    onClick={recenterOnTech}
                    className="bg-white shadow-lg rounded-full w-10 h-10 flex items-center justify-center hover:bg-gray-50 border border-gray-200 transition-all animate-in fade-in duration-200"
                    data-testid="recenter-btn"
                    title="Recentralizar no técnico"
                  >
                    <Navigation className="h-5 w-5 text-blue-600" />
                  </button>
                )}
                {/* Voice toggle */}
                <button
                  onClick={() => setVoiceEnabled(v => !v)}
                  className={`shadow-lg rounded-full w-10 h-10 flex items-center justify-center border transition-all ${voiceEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                  data-testid="toggle-voice-map-btn"
                  title={voiceEnabled ? 'Desativar voz' : 'Ativar voz'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {voiceEnabled ? (
                      <><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>
                    ) : (
                      <line x1="23" y1="9" x2="17" y2="15" />
                    )}
                  </svg>
                </button>
              </div>
            )}

            {/* Floating action buttons */}
            {!sidebarOpen && sorted.length > 0 && (
              <div className="absolute bottom-4 left-3 right-3 z-20 flex gap-2">
                {isTechnician ? (
                  <button
                    onClick={toggleLocation}
                    className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg shadow-md transition-colors ${locationActive ? 'bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                    data-testid="start-navigation-float-btn"
                  >
                    {locationActive ? (
                      <><Square className="h-4 w-4" />Parar</>
                    ) : (
                      <><Navigation className="h-4 w-4" />Iniciar Navegação</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={shareLocationViaWA}
                    className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg shadow-md bg-green-600 hover:bg-green-700 text-white transition-colors"
                    data-testid="share-location-float-btn"
                  >
                    <MessageCircle className="h-4 w-4" /> Compartilhar Localização
                  </button>
                )}
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Calculando rota...</span>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                <div className="text-center max-w-sm px-4">
                  <MapPin className="h-6 w-6 text-red-400 mx-auto mb-2" />
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              </div>
            )}
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={mapCenter}
              zoom={13}
              onLoad={handleMapLoad}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                fullscreenControl: true,
                mapTypeControl: false,
                streetViewControl: false,
                gestureHandling: 'greedy',
              }}
            />
          </div>
        </div>
      </DialogContent>
      <OrderDetailOverlay open={!!quickViewOS} onClose={() => { const wasOS = quickViewOS; setQuickViewOS(null); if (wasOS) refreshPhotoStatus(wasOS); }} osNumber={quickViewOS} />
    </Dialog>
  );
};


const RoutesPage = () => {
  const { token, user } = useAuth();
  const userRole = user?.role || 'admin';
  const userName = user?.name || '';
  const navigate = useNavigate();
  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${token}` } });

  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTechnicians, setFilterTechnicians] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [techSearchTerm, setTechSearchTerm] = useState('');

  const fetchRoutes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/routes/`, getAuthHeader());
      setRoutes(res.data);
    } catch (err) {
      toast.error('Erro ao carregar roteiros');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  // Auto-refresh when tab becomes visible (mobile users coming back to the app)
  // and lightweight polling every 30s so admin/technician see updates in near-real-time.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchRoutes();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchRoutes();
    }, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [fetchRoutes]);

  // Auto-resume active navigation session on mount (technician).
  // If the technician closed the modal/tab while navigating, we reopen
  // the map dialog for the same route automatically.
  useEffect(() => {
    if (userRole !== 'technician') return;
    if (!routes || routes.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/tracking/session/current`, getAuthHeader());
        if (cancelled) return;
        if (res.data?.active && res.data.session?.route_id) {
          const target = routes.find(r => r.id === res.data.session.route_id);
          if (target) {
            setSelectedRoute(target);
            setShowViewModal(true);
            toast.info('Navegação ativa retomada', { duration: 4000 });
          }
        }
      } catch (_) { /* no active session */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, routes]);

  // Normalize technician name: first name only, title case
  const normalizeTechName = (name) => {
    if (!name) return '';
    const first = name.trim().split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  };

  // Get unique technicians (normalized by first name)
  const allTechnicians = [...new Set(routes.map(r => normalizeTechName(r.technician)).filter(Boolean))].sort();

  const filteredRoutes = routes.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterTechnicians.length > 0 && !filterTechnicians.includes(normalizeTechName(r.technician))) return false;
    if (filterDate && r.date !== filterDate) return false;
    return true;
  }).sort((a, b) => {
    // Sort by route date descending (most recent first)
    const dateA = a.date || '0000-00-00';
    const dateB = b.date || '0000-00-00';
    return dateB.localeCompare(dateA);
  });

  const handleDelete = async (id) => {
    if (!id) { toast.error('ID do roteiro inválido'); return; }
    if (!window.confirm('Excluir este roteiro?')) return;
    try {
      await axios.delete(`${API}/routes/${id}`, getAuthHeader());
      toast.success('Roteiro excluído');
      fetchRoutes();
    } catch (err) {
      if (err?.response?.status === 404) {
        // Already gone — treat as success and refresh list
        toast.success('Roteiro já havia sido removido');
        fetchRoutes();
      } else {
        toast.error(`Erro ao excluir: ${err?.response?.data?.detail || err?.message || 'desconhecido'}`);
      }
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await axios.post(`${API}/routes/${id}/duplicate`, {}, getAuthHeader());
      toast.success('Roteiro duplicado');
      fetchRoutes();
    } catch { toast.error('Erro ao duplicar'); }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pendente': 'bg-yellow-100 text-yellow-800',
      'Em andamento': 'bg-blue-100 text-blue-800',
      'Concluído': 'bg-green-100 text-green-800',
      'Cancelado': 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="routes-title">Roteiros</h1>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={fetchRoutes}
              disabled={loading}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
              title="Atualizar lista"
              data-testid="routes-refresh-btn"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline ml-2">Atualizar</span>
            </Button>
            {userRole === 'admin' && (
              <Button onClick={() => setShowCreateModal(true)} className="bg-gray-900 hover:bg-gray-800 text-white flex-1 sm:flex-none" data-testid="create-route-btn">
                <Plus className="h-4 w-4 mr-2" /> Novo Roteiro
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-44" data-testid="filter-route-status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {ROUTE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-52 justify-between text-sm font-normal" data-testid="filter-route-technician">
                {filterTechnicians.length === 0 ? 'Todos os técnicos' : `${filterTechnicians.length} técnico(s)`}
                <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="start">
              <Input
                placeholder="Buscar técnico..."
                value={techSearchTerm}
                onChange={e => setTechSearchTerm(e.target.value)}
                className="mb-2 h-8 text-xs"
                data-testid="tech-search-input"
              />
              <ScrollArea className="max-h-48">
                {allTechnicians.filter(t => !techSearchTerm || t.toLowerCase().includes(techSearchTerm.toLowerCase())).map(tech => (
                  <label key={tech} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                    <Checkbox
                      checked={filterTechnicians.includes(tech)}
                      onCheckedChange={(checked) => {
                        setFilterTechnicians(prev => checked ? [...prev, tech] : prev.filter(t => t !== tech));
                      }}
                    />
                    {tech}
                  </label>
                ))}
                {allTechnicians.filter(t => !techSearchTerm || t.toLowerCase().includes(techSearchTerm.toLowerCase())).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">Nenhum técnico encontrado</p>
                )}
              </ScrollArea>
              {filterTechnicians.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full mt-1 text-xs text-gray-500" onClick={() => setFilterTechnicians([])}>
                  Limpar filtro
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="w-full sm:w-44" data-testid="filter-route-date" />
        </div>

        {/* Routes list */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
        ) : filteredRoutes.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Nenhum roteiro encontrado</div>
        ) : (
          <div className="space-y-3">
            {filteredRoutes.map(route => (
              <Card key={route.id} className="hover:shadow-md transition-shadow" data-testid={`route-card-${route.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900 truncate">{route.name || `Roteiro ${route.date}`}</span>
                        <Badge className={getStatusColor(route.status)}>{route.status}</Badge>
                        {(route.orders || []).some(o => o.address_changed) && (
                          <Badge className="bg-amber-100 text-amber-800 text-[10px]" data-testid={`recalc-badge-${route.id}`}>Rota desatualizada</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span><strong>Técnico:</strong> {route.technician}</span>
                          <span><strong>Data:</strong> {route.date}</span>
                          <span><strong>OS:</strong> {route.orders?.length || 0}</span>
                          {route.total_distance && <span><strong>Distância:</strong> {route.total_distance}</span>}
                          {route.total_duration && <span><strong>Tempo:</strong> {route.total_duration}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedRoute(route); setShowViewModal(true); }} data-testid={`route-view-${route.id}`}>
                        <Search className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedRoute(route); setShowEditModal(true); }} data-testid={`route-edit-${route.id}`} title="Editar roteiro">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDuplicate(route.id)} data-testid={`route-dup-${route.id}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(route.id)} data-testid={`route-del-${route.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateRouteModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { fetchRoutes(); setShowCreateModal(false); }}
          token={token}
          technicianNames={allTechnicians}
          userRole={userRole}
          userName={userName}
        />
      )}

      {showViewModal && selectedRoute && (
        <ViewRouteModal
          open={showViewModal}
          onClose={() => { setShowViewModal(false); setSelectedRoute(null); }}
          route={selectedRoute}
          token={token}
          onUpdated={fetchRoutes}
          technicianNames={allTechnicians}
          userRole={userRole}
          userName={userName}
        />
      )}

      {showEditModal && selectedRoute && (
        <EditRouteModal
          open={showEditModal}
          onClose={() => { setShowEditModal(false); setSelectedRoute(null); }}
          route={selectedRoute}
          token={token}
          onUpdated={() => { fetchRoutes(); setShowEditModal(false); setSelectedRoute(null); }}
          technicianNames={allTechnicians}
          userRole={userRole}
          userName={userName}
        />
      )}
    </DashboardLayout>
  );
};


// === CREATE ROUTE MODAL ===
const CreateRouteModal = ({ open, onClose, onCreated, token, technicianNames = [], userRole = 'admin', userName = '' }) => {
  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${token}` } });

  const [step, setStep] = useState(1);
  const [allOrders, setAllOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOS, setSelectedOS] = useState(new Set());
  // Persists FULL order data for selected OSs across pagination/filter changes.
  // Set above only stores os_numbers; this Map keeps the actual order objects so
  // moving between pages doesn't drop selections.
  const [selectedOSData, setSelectedOSData] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeTechnician, setRouteTechnician] = useState('');
  const [routeDate, setRouteDate] = useState(new Date().toISOString().split('T')[0]);
  const [quickViewOS, setQuickViewOS] = useState(null);

  // Filters
  const [fStatuses, setFStatuses] = useState([]);
  const [fServiceTypes, setFServiceTypes] = useState([]);
  const [fNeighborhoods, setFNeighborhoods] = useState([]);
  const [fCities, setFCities] = useState([]);
  const [fSearch, setFSearch] = useState('');
  const [fStartDate, setFStartDate] = useState('');
  const [fEndDate, setFEndDate] = useState('');
  const [step2Search, setStep2Search] = useState('');
  // Debounced version of step2Search — actually used for filtering. The input
  // is controlled by step2Search (instant feedback while typing) but the
  // expensive `step2Orders` filter only runs after the user pauses typing.
  // This was the root cause of the laggy search on mobile/PC.
  const [step2SearchDebounced, setStep2SearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setStep2SearchDebounced(step2Search), 250);
    return () => clearTimeout(t);
  }, [step2Search]);
  const [geocodeProgress, setGeocodeProgress] = useState('');

  // Optimized data
  const [optimizedOrders, setOptimizedOrders] = useState([]);
  const [totalDistance, setTotalDistance] = useState('');
  const [totalDuration, setTotalDuration] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMapDialog, setShowMapDialog] = useState(false);

  // Route recommendations (3 options)
  const [routeOptions, setRouteOptions] = useState([]); // [{name, orders, distance, duration}]
  const [selectedOption, setSelectedOption] = useState(0);

  // Proximity suggestions
  const [proximityOptions, setProximityOptions] = useState([]);
  const [loadingProximity, setLoadingProximity] = useState(false);
  const [showProximityPanel, setShowProximityPanel] = useState(false);

  // Fetch orders with pagination (server-side)
  const [osPage, setOsPage] = useState(1);
  const [osTotalPages, setOsTotalPages] = useState(0);
  const [osTotalItems, setOsTotalItems] = useState(0);
  const [osSearch, setOsSearch] = useState('');
  // Local "as you type" mirror — keeps the input responsive even when the
  // actual search query is debounced (the input was feeling laggy because
  // value={osSearch} only updated 400ms after each keystroke).
  const [osSearchInput, setOsSearchInput] = useState('');
  const osSearchTimerRef = useRef(null);
  
  const fetchRouteOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '10');
      params.append('page', osPage);
      // Fetch ALL active OS — only Finalizada/Cancelada are excluded from
      // route eligibility. See ROUTE_EXCLUDED_STATUSES.
      params.append('exclude_status', ROUTE_EXCLUDED_STATUSES.join(','));
      if (osSearch) params.append('search', osSearch);
      const res = await axios.get(`${API}/service-orders?${params.toString()}`, getAuthHeader());
      const data = res.data.orders || [];
      setAllOrders(data);
      setFilteredOrders(data);
      setOsTotalPages(res.data.total_pages || 0);
      setOsTotalItems(res.data.total || 0);
    } catch { toast.error('Erro ao carregar OS'); }
    finally { setLoading(false); }
  }, [token, osPage, osSearch]);
  
  useEffect(() => {
    fetchRouteOrders();
  }, [fetchRouteOrders]);

  // Apply filters on current page data
  useEffect(() => {
    let filtered = [...allOrders];
    if (fStatuses.length > 0) filtered = filtered.filter(o => matchesNormalized(o.status, fStatuses));
    if (fServiceTypes.length > 0) filtered = filtered.filter(o => matchesNormalized(o.service_type, fServiceTypes));
    if (fNeighborhoods.length > 0) filtered = filtered.filter(o => matchesNormalized(o.neighborhood, fNeighborhoods));
    if (fCities.length > 0) filtered = filtered.filter(o => matchesNormalized(o.city, fCities));
    if (fStartDate) {
      filtered = filtered.filter(o => {
        const d = o.attendance_date || o.created_at || '';
        const dateOnly = d.substring(0, 10);
        return dateOnly >= fStartDate;
      });
    }
    if (fEndDate) {
      filtered = filtered.filter(o => {
        const d = o.attendance_date || o.created_at || '';
        const dateOnly = d.substring(0, 10);
        return dateOnly <= fEndDate;
      });
    }
    if (fSearch) {
      const s = fSearch.toLowerCase();
      filtered = filtered.filter(o =>
        o.os_number?.toLowerCase().includes(s) ||
        o.customer_name?.toLowerCase().includes(s) ||
        o.address?.toLowerCase().includes(s) ||
        o.neighborhood?.toLowerCase().includes(s) ||
        o.city?.toLowerCase().includes(s) ||
        o.technician?.toLowerCase().includes(s)
      );
    }
    setFilteredOrders(filtered);
  }, [allOrders, fStatuses, fServiceTypes, fNeighborhoods, fCities, fSearch, fStartDate, fEndDate]);

  // Step 2 filtered view — memoized; recalculates only when filteredOrders or
  // the DEBOUNCED search term change. Pre-lowercases the search string once.
  const step2Orders = React.useMemo(() => {
    if (!step2SearchDebounced) return filteredOrders;
    const s = step2SearchDebounced.toLowerCase();
    return filteredOrders.filter(o =>
      (o.os_number || '').toLowerCase().includes(s) ||
      (o.customer_name || '').toLowerCase().includes(s) ||
      (o.address || '').toLowerCase().includes(s) ||
      (o.neighborhood || '').toLowerCase().includes(s) ||
      (o.phone1 || '').toLowerCase().includes(s)
    );
  }, [filteredOrders, step2SearchDebounced]);

  const toggleOS = (osNum) => {
    setSelectedOS(prev => {
      const next = new Set(prev);
      if (next.has(osNum)) next.delete(osNum);
      else next.add(osNum);
      return next;
    });
    setSelectedOSData(prev => {
      const next = new Map(prev);
      if (next.has(osNum)) {
        next.delete(osNum);
      } else {
        const order = step2Orders.find(o => o.os_number === osNum) || allOrders.find(o => o.os_number === osNum);
        if (order) next.set(osNum, order);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedOS.size === step2Orders.length) {
      setSelectedOS(new Set());
      setSelectedOSData(new Map());
    } else {
      const nums = step2Orders.map(o => o.os_number);
      setSelectedOS(new Set(nums));
      const newData = new Map();
      step2Orders.forEach(o => newData.set(o.os_number, o));
      setSelectedOSData(newData);
    }
  };

  const clearSelection = () => {
    setSelectedOS(new Set());
    setSelectedOSData(new Map());
  };

  const getFullServiceType = (order) => {
    let type = order.service_type || '';
    if (type === 'Garantia' && order.sub_status) {
      type += ` > ${order.sub_status}`;
      if (order.micro_status) type += ` > ${order.micro_status}`;
    }
    if (type === 'Orçamento') {
      if (order.status_orcamento) type += ` > ${order.status_orcamento}`;
      if (order.conclusao_orcamento) type += ` > ${order.conclusao_orcamento}`;
    }
    return type;
  };

  const nonFinalizedOrders = allOrders;

  // Derive filter options from actual data (normalized to avoid duplicates)
  const statusOptions = deduplicatePlaces(nonFinalizedOrders.map(o => o.status))
    .filter(s => s.toUpperCase() !== 'AGUARDANDO ANÁLISE');
  // Fixed service type options as requested
  const serviceTypeOptions = [
    'Garantia Loja',
    'Garantia Hisense',
    'Garantia HQ',
    'Garantia Franke',
    'Garantia com deslocamento',
    'Fora de garantia',
    'Cortesia',
    'Orçamento'
  ];

  // When cities are selected, filter neighborhoods to those cities (geographic proximity)
  const neighborhoodsForFilter = fCities.length > 0
    ? deduplicatePlaces(nonFinalizedOrders.filter(o => matchesNormalized(o.city, fCities)).map(o => o.neighborhood))
    : deduplicatePlaces(nonFinalizedOrders.map(o => o.neighborhood));
  const cities = deduplicatePlaces(nonFinalizedOrders.map(o => o.city));

  // Clean address for geocoding - uses normalizeAddressForMaps
  const cleanAddress = (order) => {
    return normalizeAddressForMaps(order, false);
  };

  // Haversine distance in km
  const haversine = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Nearest-neighbor heuristic
  const nearestNeighborRoute = (ordersWithCoords, baseLat, baseLng) => {
    const unvisited = [...ordersWithCoords];
    const route = [];
    let curLat = baseLat, curLng = baseLng;
    while (unvisited.length > 0) {
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        if (!unvisited[i].lat || !unvisited[i].lng) continue;
        const d = haversine(curLat, curLng, unvisited[i].lat, unvisited[i].lng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = unvisited.splice(bestIdx, 1)[0];
      route.push(next);
      if (next.lat && next.lng) { curLat = next.lat; curLng = next.lng; }
    }
    return route.map((o, i) => ({ ...o, sequence: i + 1 }));
  };

  // Estimate total route distance from coordinates
  const estimateDistance = (ordersWithCoords, baseLat, baseLng) => {
    let total = 0;
    let prevLat = baseLat, prevLng = baseLng;
    for (const o of ordersWithCoords) {
      if (o.lat && o.lng) {
        total += haversine(prevLat, prevLng, o.lat, o.lng);
        prevLat = o.lat; prevLng = o.lng;
      }
    }
    total += haversine(prevLat, prevLng, baseLat, baseLng); // return to base
    return total * 1.3; // road factor
  };

  // Compute proximity-based suggestions for OS selection
  const computeProximitySuggestions = async () => {
    setLoadingProximity(true);
    setShowProximityPanel(false);
    try {
      const osNumbers = filteredOrders.map(o => o.os_number);
      if (osNumbers.length < 2) {
        toast.error('Poucas OS disponíveis para sugestão');
        setLoadingProximity(false);
        return;
      }
      const cacheRes = await axios.post(`${API}/routes/geocode`, { os_numbers: osNumbers }, getAuthHeader());
      const results = cacheRes.data.results || [];
      const coordMap = {};
      results.forEach(r => { if (r.cached) coordMap[r.os_number] = { lat: r.lat, lng: r.lng }; });
      const withCoords = filteredOrders
        .map(o => ({ ...o, lat: coordMap[o.os_number]?.lat || o.lat, lng: coordMap[o.os_number]?.lng || o.lng }))
        .filter(o => o.lat && o.lng);
      if (withCoords.length < 2) {
        toast.error('Poucas OS com coordenadas. Otimize uma rota primeiro para geocodificar os endereços.');
        setLoadingProximity(false);
        return;
      }
      const baseLat = -19.9245, baseLng = -43.9352;
      const MAX_OS = Math.min(8, withCoords.length);
      // Option 1: Closest to base
      const byDist = [...withCoords].sort((a, b) =>
        haversine(baseLat, baseLng, a.lat, a.lng) - haversine(baseLat, baseLng, b.lat, b.lng)
      );
      const opt1 = byDist.slice(0, MAX_OS);
      // Option 2: Densest cluster from remaining
      const opt1Set = new Set(opt1.map(o => o.os_number));
      const remaining = withCoords.filter(o => !opt1Set.has(o.os_number));
      let opt2;
      if (remaining.length >= 2) {
        const centLat = remaining.reduce((s, o) => s + o.lat, 0) / remaining.length;
        const centLng = remaining.reduce((s, o) => s + o.lng, 0) / remaining.length;
        opt2 = [...remaining].sort((a, b) =>
          haversine(centLat, centLng, a.lat, a.lng) - haversine(centLat, centLng, b.lat, b.lng)
        ).slice(0, MAX_OS);
      } else {
        opt2 = [...byDist].reverse().slice(0, MAX_OS);
      }
      // Option 3: Third region from remaining
      const opt2Set = new Set(opt2.map(o => o.os_number));
      const remaining2 = withCoords.filter(o => !opt1Set.has(o.os_number) && !opt2Set.has(o.os_number));
      let opt3;
      if (remaining2.length >= 2) {
        const c2Lat = remaining2.reduce((s, o) => s + o.lat, 0) / remaining2.length;
        const c2Lng = remaining2.reduce((s, o) => s + o.lng, 0) / remaining2.length;
        opt3 = [...remaining2].sort((a, b) =>
          haversine(c2Lat, c2Lng, a.lat, a.lng) - haversine(c2Lat, c2Lng, b.lat, b.lng)
        ).slice(0, MAX_OS);
      } else {
        opt3 = [...byDist].reverse().slice(0, MAX_OS);
      }
      const avgDist = (arr) => arr.length === 0 ? 0 : arr.reduce((s, o) => s + haversine(baseLat, baseLng, o.lat, o.lng), 0) / arr.length;

      // Option 4: Priority (oldest + closest) - combines date and proximity
      const parseDate = (o) => {
        for (const f of ['attendance_date', 'registration_date', 'created_at']) {
          const val = o[f];
          if (!val) continue;
          const s = String(val).trim();
          for (const fmt of [/^(\d{4})-(\d{2})-(\d{2})/, /^(\d{2})\/(\d{2})\/(\d{4})/]) {
            const m = s.match(fmt);
            if (m) {
              return fmt === /^(\d{2})\/(\d{2})\/(\d{4})/ 
                ? new Date(`${m[3]}-${m[2]}-${m[1]}`) 
                : new Date(`${m[1]}-${m[2]}-${m[3]}`);
            }
          }
          try { return new Date(s); } catch { /* ignore */ }
        }
        return new Date();
      };
      // Score: lower = higher priority (older date + closer to base + priority flag)
      const now = Date.now();
      const opt4 = [...withCoords].map(o => {
        const dist = haversine(baseLat, baseLng, o.lat, o.lng);
        const ageMs = now - parseDate(o).getTime();
        const ageDays = Math.max(ageMs / 86400000, 0);
        // Score: normalize distance (0-100km → 0-1) and age (0-365 days → 0-1), weight age higher
        const distScore = Math.min(dist / 100, 1);
        const ageScore = 1 - Math.min(ageDays / 365, 1); // older = lower score = higher priority
        // Priority flag: if OS is marked as priority, drastically lower score (= higher priority)
        const priorityBonus = o.priority ? -2 : 0;
        return { ...o, _score: distScore * 0.4 + ageScore * 0.6 + priorityBonus };
      }).sort((a, b) => a._score - b._score).slice(0, MAX_OS);

      setProximityOptions([
        { name: 'Mais Próximas da Base', orders: opt1, avgDist: avgDist(opt1).toFixed(1), icon: '📍' },
        { name: 'Região Concentrada', orders: opt2, avgDist: avgDist(opt2).toFixed(1), icon: '🗺' },
        { name: 'Região Alternativa', orders: opt3, avgDist: avgDist(opt3).toFixed(1), icon: '🧭' },
        { name: 'Prioridade (Antigas + Próximas)', orders: opt4, avgDist: avgDist(opt4).toFixed(1), icon: '⚡' },
      ]);
      setShowProximityPanel(true);
    } catch (err) {
      console.error('Proximity error:', err);
      toast.error('Erro ao calcular sugestões');
    } finally {
      setLoadingProximity(false);
    }
  };

  const applyProximitySuggestion = (option) => {
    const osNums = new Set(option.orders.map(o => o.os_number));
    setSelectedOS(osNums);
    // Sync data Map with the proximity-suggestion orders so handleOptimize can use them
    const newData = new Map();
    option.orders.forEach(o => newData.set(o.os_number, o));
    setSelectedOSData(newData);
    setShowProximityPanel(false);
    toast.success(`${osNums.size} OS selecionadas: ${option.name}`);
  };

  // Optimize route: use backend Routes API proxy + timeout protection
  const handleOptimize = async () => {
    // Use selectedOSData (persisted across pagination), fallback to allOrders if data is missing.
    const fromMap = Array.from(selectedOSData.values());
    const fromMapNums = new Set(fromMap.map(o => o.os_number));
    const fromAll = allOrders.filter(o => selectedOS.has(o.os_number) && !fromMapNums.has(o.os_number));
    const selected = [...fromMap, ...fromAll];
    if (selected.length < 2) {
      toast.error('Selecione pelo menos 2 OS');
      return;
    }
    if (selected.length > 8) {
      toast.error('Máximo 8 OS por roteiro. Reduza a seleção.');
      return;
    }

    setOptimizing(true);
    setStep(3);
    let cachedMap = {};

    try {
      // Check cached coords from backend
      setGeocodeProgress('Verificando coordenadas...');
      const osNumbers = selected.map(o => o.os_number);
      try {
        const cacheRes = await axios.post(`${API}/routes/geocode`, { os_numbers: osNumbers }, getAuthHeader());
        (cacheRes.data.results || []).forEach(r => { if (r.cached) cachedMap[r.os_number] = r; });
      } catch (e) { console.warn('Cache check failed:', e); }

      // Build waypoints for Routes API
      setGeocodeProgress('Calculando rota otimizada...');
      const waypointData = selected.map(order => {
        const cached = cachedMap[order.os_number];
        if (cached) {
          return { order, waypoint: { lat: cached.lat, lng: cached.lng }, hasCachedCoords: true };
        }
        return { order, waypoint: { address: cleanAddress(order) }, hasCachedCoords: false };
      });

      const BASE_WP = { lat: BASE_LAT, lng: BASE_LNG };

      // Call backend Routes API proxy
      const routeRes = await axios.post(`${API}/routes/compute-route`, {
        origin: BASE_WP,
        destination: BASE_WP,
        intermediates: waypointData.map(w => w.waypoint),
        optimize_waypoint_order: true,
      }, getAuthHeader());

      const route = routeRes.data.routes?.[0];
      if (!route) throw new Error('Nenhuma rota retornada pela API');

      const waypointOrder = route.optimizedIntermediateWaypointIndex || waypointData.map((_, i) => i);
      const legs = route.legs || [];

      // Extract lat/lng from legs and cache uncached coords
      const toCache = [];
      const reordered = waypointOrder.map((originalIdx, seq) => {
        const wp = waypointData[originalIdx];
        const leg = legs[seq];
        const endLoc = leg?.endLocation?.latLng;
        const lat = endLoc?.latitude || wp.order.lat || null;
        const lng = endLoc?.longitude || wp.order.lng || null;

        if (!wp.hasCachedCoords && lat && lng) {
          toCache.push({ os_number: wp.order.os_number, lat, lng });
        }

        return { ...wp.order, lat, lng, sequence: seq + 1 };
      });

      // Cache newly discovered coords
      if (toCache.length > 0) {
        try {
          await axios.post(`${API}/routes/cache-coords`, { coords: toCache }, getAuthHeader());
        } catch (e) { console.warn('Cache save failed:', e); }
      }

      const parseDuration = (durStr) => parseInt((durStr || '0').replace('s', ''), 10) || 0;
      const dist = legs.reduce((sum, l) => sum + (l.distanceMeters || 0), 0);
      const dur = legs.reduce((sum, l) => sum + parseDuration(l.duration), 0);
      const distKm = `${(dist / 1000).toFixed(1)} km`;
      const mins = Math.round(dur / 60);
      const durStr = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}min` : `${mins}min`;

      // Base coords (Mastermaq office)
      const baseLat = -19.9245, baseLng = -43.9352;

      // Option 1: Google-optimized
      const opt1 = { name: 'Rota Otimizada (Google)', orders: reordered, distance: distKm, duration: durStr };

      // Option 2: Nearest-neighbor from base
      const nnOrders = nearestNeighborRoute(reordered.map(o => ({ ...o })), baseLat, baseLng);
      const nnDist = estimateDistance(nnOrders, baseLat, baseLng);
      const nnMins = Math.round(nnDist / 40 * 60); // ~40km/h avg
      const opt2 = {
        name: 'Mais Próxima Primeiro',
        orders: nnOrders,
        distance: `${nnDist.toFixed(1)} km`,
        duration: nnMins >= 60 ? `${Math.floor(nnMins/60)}h ${nnMins%60}min` : `${nnMins}min`
      };

      // Option 3: Reverse of Google-optimized
      const revOrders = [...reordered].reverse().map((o, i) => ({ ...o, sequence: i + 1 }));
      const revDist = estimateDistance(revOrders, baseLat, baseLng);
      const revMins = Math.round(revDist / 40 * 60);
      const opt3 = {
        name: 'Rota Inversa',
        orders: revOrders,
        distance: `${revDist.toFixed(1)} km`,
        duration: revMins >= 60 ? `${Math.floor(revMins/60)}h ${revMins%60}min` : `${revMins}min`
      };

      setRouteOptions([opt1, opt2, opt3]);
      setSelectedOption(0);
      setOptimizedOrders(opt1.orders);
      setTotalDistance(opt1.distance);
      setTotalDuration(opt1.duration);
      setStep(4);
    } catch (err) {
      console.error('Optimize error:', err);
      const detail = err.response?.data?.detail || err.message || 'Erro desconhecido';
      toast.error(`Erro na otimização: ${detail}`);
      // Fallback: show orders without route optimization
      const fallback = selected.map((o, i) => {
        const cached = cachedMap?.[o.os_number];
        return { ...o, lat: cached?.lat || o.lat || null, lng: cached?.lng || o.lng || null, sequence: i + 1 };
      });
      setOptimizedOrders(fallback);
      setStep(4);
    } finally {
      setOptimizing(false);
      setGeocodeProgress('');
    }
  };

  const handleSave = async () => {
    if (!routeTechnician) { toast.error('Informe o técnico'); return; }
    setSaving(true);
    try {
      const orders = optimizedOrders.map(o => ({
        os_number: o.os_number,
        customer_name: o.customer_name || '',
        neighborhood: o.neighborhood || '',
        city: o.city || '',
        address: o.address || '',
        number: o.number || '',
        phone1: o.phone1 || '',
        technician: routeTechnician,
        conclusion: '',
        observation: '',
        sequence: o.sequence,
        lat: o.lat || null,
        lng: o.lng || null,
        attendance_date: o.attendance_date || '',
        status: o.status || '',
      }));

      await axios.post(`${API}/routes/`, {
        name: routeName || `Roteiro ${routeDate}`,
        technician: routeTechnician,
        date: routeDate,
        orders,
        total_distance: totalDistance,
        total_duration: totalDuration,
        status: 'Pendente',
      }, getAuthHeader());

      toast.success('Roteiro salvo!');
      onCreated();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const moveOrder = (idx, dir) => {
    const newOrders = [...optimizedOrders];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= newOrders.length) return;
    [newOrders[idx], newOrders[targetIdx]] = [newOrders[targetIdx], newOrders[idx]];
    newOrders.forEach((o, i) => o.sequence = i + 1);
    setOptimizedOrders(newOrders);
  };

  const removeOrder = (idx) => {
    const newOrders = optimizedOrders.filter((_, i) => i !== idx);
    newOrders.forEach((o, i) => o.sequence = i + 1);
    setOptimizedOrders(newOrders);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!quickViewOS) onClose(v); }} modal={!quickViewOS}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] sm:max-h-[90vh] h-[100dvh] sm:h-auto overflow-hidden p-0"
        data-testid="create-route-modal"
        onPointerDownOutside={(e) => { if (quickViewOS) e.preventDefault(); }}
        onInteractOutside={(e) => { if (quickViewOS) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (quickViewOS) e.preventDefault(); }}
      >
        <div className="p-4 sm:p-6 border-b">
          <DialogTitle className="text-lg font-semibold">
            {step === 1 && 'Filtrar OS'}
            {step === 2 && 'Selecionar OS'}
            {step === 3 && 'Otimizando Rota...'}
            {step === 4 && 'Roteiro Gerado'}
          </DialogTitle>
          <div className="flex gap-2 mt-2">
            {[1,2,3,4].map(s => (
              <div key={s} className={`h-1 flex-1 rounded ${s <= step ? 'bg-gray-900' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-auto" style={{maxHeight: 'calc(90vh - 140px)'}}>
          <div className="p-4 sm:p-6">
            {/* Step 1: Filters */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nome do Roteiro</Label>
                    <Input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Ex: Roteiro BH Centro" data-testid="route-name-input" />
                  </div>
                  <div>
                    <Label className="text-xs">Técnico Responsável</Label>
                    <TechnicianCombobox value={routeTechnician} onChange={setRouteTechnician} technicians={technicianNames} testId="route-technician-input" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Data do Roteiro</Label>
                    <Input type="date" value={routeDate} onChange={e => setRouteDate(e.target.value)} data-testid="route-date-input" />
                  </div>
                  <div>
                    <Label className="text-xs">Data Atendimento (de)</Label>
                    <Input type="date" value={fStartDate} onChange={e => setFStartDate(e.target.value)} data-testid="route-filter-start-date" />
                  </div>
                  <div>
                    <Label className="text-xs">Data Atendimento (até)</Label>
                    <Input type="date" value={fEndDate} onChange={e => setFEndDate(e.target.value)} data-testid="route-filter-end-date" />
                  </div>
                </div>
                <hr />
                <h4 className="font-medium text-sm">Filtros de OS</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <SearchableMultiSelect
                    label="Status"
                    options={statusOptions}
                    selected={fStatuses}
                    onChange={setFStatuses}
                    testId="route-filter-status"
                  />
                  <SearchableMultiSelect
                    label="Tipo de Atendimento"
                    options={serviceTypeOptions}
                    selected={fServiceTypes}
                    onChange={setFServiceTypes}
                    testId="route-filter-service"
                  />
                  <div>
                    <Label className="text-xs">Busca</Label>
                    <Input value={fSearch} onChange={e => setFSearch(e.target.value)} placeholder="OS, cliente, endereço, bairro..." className="mt-1" data-testid="route-filter-search" />
                  </div>
                  <SearchableMultiSelect
                    label="Cidade"
                    options={cities}
                    selected={fCities}
                    onChange={setFCities}
                    testId="route-filter-city"
                  />
                  <SearchableMultiSelect
                    label="Bairro"
                    options={neighborhoodsForFilter}
                    selected={fNeighborhoods}
                    onChange={setFNeighborhoods}
                    testId="route-filter-neighborhood"
                  />
                </div>

                {/* Active filters summary */}
                {(fStatuses.length > 0 || fCities.length > 0 || fNeighborhoods.length > 0 || fServiceTypes.length > 0 || fStartDate || fEndDate) && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-xs text-gray-500">Filtros:</span>
                    {fStatuses.map(s => <Badge key={s} variant="secondary" className="text-xs cursor-pointer" onClick={() => setFStatuses(p => p.filter(v => v !== s))}>{s} <X className="h-3 w-3 ml-1" /></Badge>)}
                    {fServiceTypes.map(t => <Badge key={t} variant="secondary" className="text-xs cursor-pointer" onClick={() => setFServiceTypes(p => p.filter(v => v !== t))}>{t} <X className="h-3 w-3 ml-1" /></Badge>)}
                    {fCities.map(c => <Badge key={c} variant="secondary" className="text-xs cursor-pointer" onClick={() => setFCities(p => p.filter(v => v !== c))}>{c} <X className="h-3 w-3 ml-1" /></Badge>)}
                    {fNeighborhoods.map(n => <Badge key={n} variant="secondary" className="text-xs cursor-pointer" onClick={() => setFNeighborhoods(p => p.filter(v => v !== n))}>{n} <X className="h-3 w-3 ml-1" /></Badge>)}
                    {fStartDate && <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setFStartDate('')}>De: {fStartDate} <X className="h-3 w-3 ml-1" /></Badge>}
                    {fEndDate && <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setFEndDate('')}>Até: {fEndDate} <X className="h-3 w-3 ml-1" /></Badge>}
                    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { setFStatuses([]); setFServiceTypes([]); setFCities([]); setFNeighborhoods([]); setFSearch(''); setFStartDate(''); setFEndDate(''); }}>Limpar tudo</Button>
                  </div>
                )}

                <div className="text-sm text-gray-500">{osTotalItems} OS encontradas</div>
                <Button onClick={() => setStep(2)} disabled={osTotalItems === 0} className="w-full sm:w-auto" data-testid="route-next-step2">
                  Avançar para Seleção ({osTotalItems} OS)
                </Button>
              </div>
            )}

            {/* Step 2: Select OS */}
            {step === 2 && (
              <div className="space-y-3">
                {/* Search + pagination header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)} data-testid="route-back-step1">Voltar</Button>
                  <div className="flex items-center gap-2 flex-1 max-w-md">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar OS por nome, nº, endereço..."
                        className="w-full h-8 pl-7 pr-3 text-sm border rounded-md"
                        value={osSearchInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOsSearchInput(val); // instant UI feedback
                          if (osSearchTimerRef.current) clearTimeout(osSearchTimerRef.current);
                          osSearchTimerRef.current = setTimeout(() => {
                            setOsSearch(val);
                            setOsPage(1);
                          }, 300);
                        }}
                        data-testid="route-os-search"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
                    <span className="text-sm text-gray-500" data-testid="route-selected-count">{selectedOS.size} selecionadas</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={selectAll} data-testid="route-select-all">
                        {selectedOS.size === step2Orders.length ? 'Desmarcar' : 'Todas'}
                      </Button>
                      {selectedOS.size > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearSelection} data-testid="route-clear-selection" className="text-gray-500 hover:text-red-600">
                          Limpar
                        </Button>
                      )}
                      <Button
                        variant="outline" size="sm"
                        onClick={computeProximitySuggestions}
                        disabled={loadingProximity}
                        data-testid="route-proximity-btn"
                      >
                        {loadingProximity ? <Loader2 className="h-4 w-4 animate-spin" /> : <><MapPin className="h-4 w-4 mr-1" />Sugestões</>}
                      </Button>
                      <Button
                        onClick={handleOptimize}
                        disabled={selectedOS.size < 2 || optimizing}
                        className="bg-gray-900 hover:bg-gray-800 text-white"
                        size="sm"
                        data-testid="route-optimize-btn-top"
                      >
                        {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Route className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Gerar Sequência </span>({selectedOS.size})</>}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Proximity Suggestions Panel */}
                {showProximityPanel && proximityOptions.length > 0 && (
                  <div className="border rounded-lg p-3 bg-blue-50 space-y-2" data-testid="proximity-panel">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-blue-900">Seleção por Proximidade</h4>
                      <Button variant="ghost" size="sm" onClick={() => setShowProximityPanel(false)} className="h-6 w-6 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {proximityOptions.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => applyProximitySuggestion(opt)}
                          className="p-3 rounded-lg border-2 border-blue-200 bg-white text-left hover:border-blue-500 transition-colors"
                          data-testid={`proximity-option-${i}`}
                        >
                          <div className="text-sm font-medium text-gray-800">{opt.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{opt.orders.length} OS &middot; ~{opt.avgDist} km da base</div>
                          <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                            {opt.orders.slice(0, 3).map(o => o.os_number).join(', ')}{opt.orders.length > 3 ? '...' : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search in Step 2 */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={step2Search}
                    onChange={e => setStep2Search(e.target.value)}
                    placeholder="Buscar OS, cliente, endereço, bairro, telefone..."
                    className="pl-9"
                    data-testid="route-step2-search"
                  />
                </div>

                {/* Desktop table - hidden on mobile */}
                <div className="border rounded-lg overflow-x-auto hidden sm:block">
                  <table className="w-full text-sm" data-testid="route-os-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left w-8"><Checkbox checked={selectedOS.size === step2Orders.length && step2Orders.length > 0} onCheckedChange={selectAll} /></th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500">N OS</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500">CLIENTE</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500">BAIRRO</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500 hidden md:table-cell">CIDADE</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500 hidden lg:table-cell">TELEFONE</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500 hidden lg:table-cell">TIPO</th>
                        <th className="p-2 text-left text-xs font-medium text-gray-500">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {step2Orders.map(o => (
                        <tr key={o.os_number} className={`hover:bg-gray-50 cursor-pointer ${selectedOS.has(o.os_number) ? 'bg-blue-50' : ''}`}
                            onClick={() => toggleOS(o.os_number)}>
                          <td className="p-2"><Checkbox checked={selectedOS.has(o.os_number)} /></td>
                          <td className="p-2 font-medium">{o.os_number}</td>
                          <td className="p-2 truncate max-w-[150px]">{o.customer_name}</td>
                          <td className="p-2 truncate max-w-[100px]">{o.neighborhood}</td>
                          <td className="p-2 hidden md:table-cell">{o.city}</td>
                          <td className="p-2 hidden lg:table-cell">{o.phone1}</td>
                          <td className="p-2 hidden lg:table-cell text-xs">{getFullServiceType(o)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{o.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards - visible only on small screens */}
                <div className="sm:hidden space-y-2">
                  {step2Orders.map(o => (
                    <div
                      key={o.os_number}
                      onClick={() => toggleOS(o.os_number)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedOS.has(o.os_number) ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 active:bg-gray-50'}`}
                      data-testid={`route-os-card-${o.os_number}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={selectedOS.has(o.os_number)} onClick={e => e.stopPropagation()} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">OS {o.os_number}</span>
                            <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                          </div>
                          <div className="text-xs text-gray-600 truncate mt-0.5">{o.customer_name}</div>
                          <div className="text-xs text-gray-400 truncate">{o.neighborhood} - {o.city}</div>
                          {o.phone1 && <div className="text-xs text-gray-400">{o.phone1}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {osTotalPages > 1 && (
                  <div className="flex items-center justify-between" data-testid="route-pagination">
                    <span className="text-xs text-gray-400">{step2Orders.length} de {osTotalItems} OS | Página {osPage}/{osTotalPages}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={osPage <= 1} onClick={() => setOsPage(p => Math.max(1, p - 1))} className="h-7 px-2 text-xs">
                        Anterior
                      </Button>
                      <span className="text-xs text-gray-500 px-2">{osPage}</span>
                      <Button variant="outline" size="sm" disabled={osPage >= osTotalPages} onClick={() => setOsPage(p => p + 1)} className="h-7 px-2 text-xs">
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
                {osTotalPages <= 1 && osTotalItems > 0 && (
                  <div className="flex items-center justify-start">
                    <span className="text-xs text-gray-400">{step2Orders.length} de {osTotalItems} OS</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-gray-500 font-medium">{selectedOS.size} OS selecionadas</span>
                  <Button onClick={handleOptimize} disabled={selectedOS.size < 2 || optimizing} className="bg-gray-900 hover:bg-gray-800 text-white" data-testid="route-optimize-btn">
                    {optimizing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Otimizando...</> : <><Route className="h-4 w-4 mr-2" />Gerar Sequência ({selectedOS.size} OS)</>}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Optimizing */}
            {step === 3 && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-gray-400 mb-4" />
                <p className="text-gray-600 font-medium">{geocodeProgress || 'Iniciando...'}</p>
                <p className="text-sm text-gray-400 mt-1">Aguarde enquanto os endereços são processados</p>
              </div>
            )}

            {/* Step 4: Results with Route Recommendations */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)} data-testid="route-back-step2">Voltar</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMapDialog(true)}
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    data-testid="route-view-map-btn"
                  >
                    <MapIcon className="h-4 w-4 mr-1" /> Ver Mapa
                  </Button>
                </div>

                {/* Route Options (3 recommendations) */}
                {routeOptions.length > 1 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Escolha uma opção de rota</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {routeOptions.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSelectedOption(i);
                            setOptimizedOrders(opt.orders);
                            setTotalDistance(opt.distance);
                            setTotalDuration(opt.duration);
                          }}
                          className={`p-3 rounded-lg border-2 text-left transition-colors ${selectedOption === i ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
                          data-testid={`route-option-${i}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedOption === i ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'}`}>
                              {i + 1}
                            </div>
                            <span className="text-sm font-medium">{opt.name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 ml-8">
                            <span><Navigation className="h-3 w-3 inline mr-0.5" />{opt.distance}</span>
                            <span><Clock className="h-3 w-3 inline mr-0.5" />{opt.duration}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Distance/Duration badges */}
                <div className="flex gap-2 flex-wrap items-center">
                  {totalDistance && <Badge variant="outline"><Navigation className="h-3 w-3 mr-1" />{totalDistance}</Badge>}
                  {totalDuration && <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{totalDuration}</Badge>}
                  <Badge variant="outline"><MapPin className="h-3 w-3 mr-1" />{optimizedOrders.length} OS</Badge>
                </div>

                {/* Map Dialog */}
                <RouteMapDialog
                  open={showMapDialog}
                  onClose={() => setShowMapDialog(false)}
                  orders={optimizedOrders}
                  routeName={routeName || `Roteiro ${routeDate}`}
                  token={token}
                  routeId={null}
                  userRole={userRole}
                  userName={userName}
                />

                {/* Ordered OS list */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Sequência de Atendimento</h4>
                  {optimizedOrders.map((o, idx) => (
                    <div key={o.os_number} className="flex items-center gap-2 p-3 border rounded-lg bg-white" data-testid={`route-seq-${o.os_number}`}>
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                        {o.sequence}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">OS {o.os_number} - {o.customer_name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {o.address && <span>{o.address} {o.number}, </span>}
                          {o.neighborhood} - {o.city} | {o.phone1}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" className="text-blue-600 text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); setQuickViewOS(o.os_number); }} data-testid={`view-os-${o.os_number}`}>
                          Ver OS
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => moveOrder(idx, -1)} disabled={idx === 0}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => moveOrder(idx, 1)} disabled={idx === optimizedOrders.length - 1}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeOrder(idx)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Save section */}
                <div className="border-t pt-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Técnico</Label>
                      <TechnicianCombobox value={routeTechnician} onChange={setRouteTechnician} technicians={technicianNames} testId="route-save-technician" />
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value="Pendente" disabled><SelectTrigger><SelectValue /></SelectTrigger></Select>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleSave} disabled={saving} className="bg-gray-900 hover:bg-gray-800 text-white flex-1 sm:flex-none" data-testid="route-save-btn">
                      {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : 'Salvar Roteiro'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
    <OrderDetailOverlay open={!!quickViewOS} onClose={() => setQuickViewOS(null)} osNumber={quickViewOS} />
    </>
  );
};


// === Per-OS inputs (Diagnóstico + Observações) — extracted + memoized to
// avoid re-rendering all OS cards on every keystroke (root cause of the
// typing delay on mobile). Local state, parent only sees committed values. ===
const RouteOSInputs = React.memo(function RouteOSInputs({ osNumber, initialConclusion, initialObservation, onPersist }) {
  const [conclusion, setConclusion] = React.useState(initialConclusion || '');
  const [observation, setObservation] = React.useState(initialObservation || '');
  const conclRef = React.useRef(null);
  const obsRef = React.useRef(null);
  const syncedRef = React.useRef({ c: initialConclusion || '', o: initialObservation || '' });

  // Reconcile from server (poll) ONLY if the field hasn't been edited locally.
  React.useEffect(() => {
    if (syncedRef.current.c === conclusion && (initialConclusion || '') !== conclusion) {
      setConclusion(initialConclusion || '');
      syncedRef.current.c = initialConclusion || '';
    }
    if (syncedRef.current.o === observation && (initialObservation || '') !== observation) {
      setObservation(initialObservation || '');
      syncedRef.current.o = initialObservation || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConclusion, initialObservation]);

  const schedule = (refName, value, currentC, currentO) => {
    const ref = refName === 'c' ? conclRef : obsRef;
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => {
      syncedRef.current = { c: currentC, o: currentO };
      onPersist(osNumber, { conclusion: currentC, observation: currentO });
    }, 500);
  };

  const flush = () => {
    if (conclRef.current) clearTimeout(conclRef.current);
    if (obsRef.current) clearTimeout(obsRef.current);
    if (syncedRef.current.c !== conclusion || syncedRef.current.o !== observation) {
      syncedRef.current = { c: conclusion, o: observation };
      onPersist(osNumber, { conclusion, observation });
    }
  };

  return (
    <>
      <div className="mt-2">
        <Label className="text-xs text-gray-500">Diagnóstico</Label>
        <Input
          value={conclusion}
          onChange={(e) => { const v = e.target.value; setConclusion(v); schedule('c', v, v, observation); }}
          onBlur={flush}
          placeholder="Informar diagnóstico técnico..."
          className="mt-1 text-sm"
          data-testid={`conclusion-${osNumber}`}
        />
      </div>
      <div className="mt-2">
        <Label className="text-xs text-blue-600 font-medium">Observações</Label>
        <Input
          value={observation}
          onChange={(e) => { const v = e.target.value; setObservation(v); schedule('o', v, conclusion, v); }}
          onBlur={flush}
          placeholder="Anotação rápida (ex: Concluída, Cobrar valor X...)"
          className="mt-1 text-sm bg-blue-50 border-blue-200 placeholder:text-blue-300 focus:border-blue-400"
          data-testid={`observation-${osNumber}`}
        />
      </div>
    </>
  );
});


// === VIEW/EDIT ROUTE MODAL ===
const ViewRouteModal = ({ open, onClose, route, token, onUpdated, technicianNames = [], userRole = 'admin', userName = '' }) => {
  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${token}` } });
  const [orders, setOrders] = useState(route.orders || []);
  const [status, setStatus] = useState(route.status || 'Pendente');
  const [needsRecalc, setNeedsRecalc] = useState(route.needs_recalculation || false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [quickViewOS, setQuickViewOS] = useState(null);
  const [etaValues, setEtaValues] = useState({});

  // Re-fetch route data when modal opens to get latest OS data
  const refreshRouteData = useCallback(async () => {
    if (!route?.id) return;
    try {
      const res = await axios.get(`${API}/routes/${route.id}`, getAuthHeader());
      const fresh = res.data;
      const newOrders = fresh.orders || [];
      // Avoid unnecessary state churn — only setOrders when content changed.
      // Comparing on os_number+lat+lng+sequence+conclusion+observation+status
      // prevents the inner map dialog from tearing down GPS navigation on
      // every poll (polling was causing the start/stop oscillation).
      setOrders(prev => {
        const key = (o) => `${o.os_number}|${o.lat||''}|${o.lng||''}|${o.sequence||0}|${o.conclusion||''}|${o.observation||''}|${o.status||''}`;
        const prevSig = (prev || []).map(key).join('::');
        const newSig = newOrders.map(key).join('::');
        return prevSig === newSig ? prev : newOrders;
      });
      setStatus(s => fresh.status && s !== fresh.status ? fresh.status : s);
      const hasAddrChange = newOrders.some(o => o.address_changed);
      setNeedsRecalc(n => n !== hasAddrChange ? hasAddrChange : n);
    } catch (_) {
      setOrders(prev => (prev && prev.length ? prev : (route.orders || [])));
    }
  }, [route?.id, route?.orders, getAuthHeader]);

  useEffect(() => {
    if (open && route?.id) {
      refreshRouteData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id]);

  // Periodically refresh open route modal so concurrent edits show up
  useEffect(() => {
    if (!open) return;
    const onVisible = () => { if (document.visibilityState === 'visible') refreshRouteData(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRouteData();
    }, 20000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [open, refreshRouteData]);

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    try {
      await axios.put(`${API}/routes/${route.id}`, { status: newStatus }, getAuthHeader());
      toast.success('Status atualizado');
      onUpdated();
    } catch { toast.error('Erro ao atualizar'); }
  };

  const handleConclusionChange = (osNumber, conclusion) => {
    const updated = orders.map(o => o.os_number === osNumber ? { ...o, conclusion } : o);
    setOrders(updated);
    setHasChanges(true);
    scheduleAutoSave(osNumber, { conclusion });
  };

  const handleObservationChange = (osNumber, observation) => {
    const updated = orders.map(o => o.os_number === osNumber ? { ...o, observation } : o);
    setOrders(updated);
    setHasChanges(true);
    scheduleAutoSave(osNumber, { observation });
  };

  // Called by the memoized RouteOSInputs once the user stops typing.
  // We persist immediately (no parent-level debounce) — the child already
  // debounced 500ms. This avoids the cascading re-render that used to make
  // typing feel laggy on mobile.
  const persistOSEntry = useCallback(async (osNumber, { conclusion, observation }) => {
    setOrders(curr => curr.map(o => o.os_number === osNumber ? { ...o, conclusion, observation } : o));
    setHasChanges(true);
    try {
      await axios.put(`${API}/routes/${route.id}/conclusion/${osNumber}`, {
        conclusion: conclusion || '', observation: observation || '',
      }, getAuthHeader());
    } catch (e) {
      console.error('persistOSEntry failed:', e);
    }
  }, [route?.id, getAuthHeader]);

  // Per-OS debounced autosave for conclusion/observation in the route view
  const autoSaveTimersRef = useRef({});
  const [autoSavingMap, setAutoSavingMap] = useState({});
  const scheduleAutoSave = (osNumber, partial) => {
    if (autoSaveTimersRef.current[osNumber]) clearTimeout(autoSaveTimersRef.current[osNumber]);
    autoSaveTimersRef.current[osNumber] = setTimeout(async () => {
      try {
        setAutoSavingMap(m => ({ ...m, [osNumber]: true }));
        // read latest values from state via callback to avoid stale closures
        setOrders(curr => {
          const target = curr.find(o => o.os_number === osNumber);
          if (target) {
            axios.put(`${API}/routes/${route.id}/conclusion/${osNumber}`, {
              conclusion: target.conclusion || '',
              observation: target.observation || '',
            }, getAuthHeader()).catch(() => {});
          }
          return curr;
        });
      } finally {
        setTimeout(() => setAutoSavingMap(m => ({ ...m, [osNumber]: false })), 200);
      }
    }, 900);
  };

  const handleSaveAllChanges = async () => {
    setSaving(true);
    try {
      for (const o of orders) {
        if (o.conclusion || o.observation) {
          await axios.put(`${API}/routes/${route.id}/conclusion/${o.os_number}`, {
            conclusion: o.conclusion || '',
            observation: o.observation || '',
          }, getAuthHeader());
        }
      }
      toast.success('Alterações salvas!');
      setHasChanges(false);
      onUpdated();
    } catch { toast.error('Erro ao salvar alterações'); }
    finally { setSaving(false); }
  };

  const handlePrint = () => {
    const printContent = `
      <html><head><style>
        @page { margin: 0; }
        body { font-family: Arial; font-size: 12px; margin: 10mm; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
        th { background: #f0f0f0; }
        h2 { margin-bottom: 4px; }
      </style></head><body>
        <h2>ROTEIRO - ${route.name || route.date}</h2>
        <p><strong>Tecnico:</strong> ${route.technician} | <strong>Data:</strong> ${route.date} | <strong>Distancia:</strong> ${route.total_distance || 'N/A'} | <strong>Tempo:</strong> ${route.total_duration || 'N/A'}</p>
        <table>
          <tr><th>#</th><th>N OS</th><th>CLIENTE</th><th>BAIRRO</th><th>CIDADE</th><th>TELEFONE</th><th>CONCLUSAO</th><th>OBS</th></tr>
          ${orders.map(o => `<tr><td>${o.sequence || ''}</td><td>${o.os_number}</td><td>${o.customer_name || ''}</td><td>${o.neighborhood || ''}</td><td>${o.city || ''}</td><td>${o.phone1 || ''}</td><td>${o.conclusion || ''}</td><td>${o.observation || ''}</td></tr>`).join('')}
        </table>
      </body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(printContent);
    iframe.contentDocument.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };

  const handleWhatsApp = () => {
    // Header uses the date, not the route name — clearer to the recipient.
    let header = 'ROTEIRO';
    try {
      const d = new Date((route.date || '') + 'T12:00:00');
      if (!isNaN(d.getTime())) header = `ROTEIRO ${d.toLocaleDateString('pt-BR')}`;
    } catch { /* keep default */ }
    let msg = `*${header}*\nTecnico: ${route.technician}\n\n`;
    orders.forEach(o => {
      msg += `${o.sequence}. OS ${o.os_number} - ${o.customer_name || ''}\n`;
      msg += `   ${o.neighborhood || ''} - ${o.city || ''}\n`;
      msg += `   Tel: ${o.phone1 || ''}\n\n`;
    });
    if (route.total_distance) msg += `Distancia total: ${route.total_distance}\n`;
    if (route.total_duration) msg += `Tempo estimado: ${route.total_duration}\n`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!quickViewOS) onClose(v); }} modal={!quickViewOS}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] sm:max-h-[90vh] h-[100dvh] sm:h-auto overflow-hidden p-0"
        data-testid="view-route-modal"
        onPointerDownOutside={(e) => { if (quickViewOS) e.preventDefault(); }}
        onInteractOutside={(e) => { if (quickViewOS) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (quickViewOS) e.preventDefault(); }}
      >
        <div className="p-4 sm:p-6 border-b">
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div>
              <DialogTitle className="text-lg font-semibold">{route.name || `Roteiro ${route.date}`}</DialogTitle>
              <div className="text-sm text-gray-500 mt-1">
                <span className="mr-4"><strong>Tecnico:</strong> {route.technician}</span>
                <span className="mr-4"><strong>Data:</strong> {route.date}</span>
                {route.total_distance && <span className="mr-4">{route.total_distance}</span>}
                {route.total_duration && <span>{route.total_duration}</span>}
              </div>
            </div>
            <div className="flex gap-1">
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-36" data-testid="route-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUTE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={refreshRouteData} className="text-gray-700" data-testid="route-refresh-btn">
              <RefreshCw className="h-3 w-3 mr-1" />Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowMapDialog(true)} className="text-blue-600 border-blue-300 hover:bg-blue-50" data-testid="view-route-map-btn">
              <MapIcon className="h-3 w-3 mr-1" />Ver Mapa
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="route-print-btn"><Printer className="h-3 w-3 mr-1" />Imprimir</Button>
            <Button variant="outline" size="sm" onClick={handleWhatsApp} data-testid="route-whatsapp-btn"><MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Button>
          </div>
          {needsRecalc && (
            <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-md px-3 py-2" data-testid="recalc-warning">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span className="text-xs text-amber-800 font-medium">Endereço de OS alterado — rota precisa ser recalculada</span>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto" style={{maxHeight: 'calc(90vh - 180px)'}}>
          <div className="p-4 sm:p-6 space-y-3 w-full max-w-full min-w-0">
            {orders.map(o => (
              <div key={o.os_number} className="flex items-start gap-3 p-3 border rounded-lg" data-testid={`view-route-os-${o.os_number}`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold mt-1">
                  {o.sequence}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">OS {o.os_number} - {o.customer_name}</span>
                    {o.priority && (
                      <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0" data-testid={`priority-route-${o.os_number}`}>Prioridade</Badge>
                    )}
                    {o.address_changed && (
                      <Badge className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0" data-testid={`addr-changed-${o.os_number}`}>Endereço alterado</Badge>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-600 text-xs" onClick={() => setQuickViewOS(o.os_number)} data-testid={`view-os-btn-${o.os_number}`}>
                      Ver OS
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-green-600 text-xs"
                      data-testid={`maps-btn-${o.os_number}`}
                      onClick={() => {
                        if (o.lat && o.lng) {
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`, '_blank');
                        } else {
                          const addr = `${o.address || ''} ${o.number || ''}, ${o.neighborhood || ''} - ${o.city || ''}`;
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank');
                        }
                      }}
                    >
                      <Navigation className="h-3 w-3 mr-0.5" />Maps
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500">{o.address} {o.number}, {o.neighborhood} - {o.city}</div>
                  {o.phone1 && <div className="text-xs text-gray-500"><Phone className="h-3 w-3 inline mr-1" />{o.phone1}</div>}
                  {/* ETA - Previsão de chegada (Slider) */}
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-3">
                      <select
                        id={`eta-mode-${o.os_number}`}
                        className="h-7 border border-gray-200 rounded-md text-xs px-2 bg-white"
                        defaultValue="duration"
                        data-testid={`eta-mode-${o.os_number}`}
                      >
                        <option value="duration">Duração</option>
                        <option value="time">Horário</option>
                      </select>
                      <div className="flex-1">
                        <Slider
                          value={[etaValues[o.os_number] ?? 30]}
                          onValueChange={([v]) => setEtaValues(prev => ({ ...prev, [o.os_number]: v }))}
                          min={0}
                          max={120}
                          step={5}
                          className="w-full"
                          data-testid={`eta-slider-${o.os_number}`}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 min-w-[50px] text-right" data-testid={`eta-display-${o.os_number}`}>
                        {(() => {
                          const val = etaValues[o.os_number] ?? 30;
                          const h = Math.floor(val / 60);
                          const m = val % 60;
                          if (h === 0) return `${m}min`;
                          if (m === 0) return `${h}h`;
                          return `${h}h${m}m`;
                        })()}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-green-700 border-green-300 hover:bg-green-50 shrink-0"
                      data-testid={`eta-send-${o.os_number}`}
                      onClick={() => {
                        const mode = document.getElementById(`eta-mode-${o.os_number}`)?.value || 'duration';
                        const totalMin = etaValues[o.os_number] ?? 30;
                        const hours = Math.floor(totalMin / 60);
                        const minutes = totalMin % 60;

                        if (hours === 0 && minutes === 0) { toast.error('Selecione um tempo'); return; }

                        let etaText = '';
                        if (mode === 'duration') {
                          if (hours === 0) {
                            etaText = `${minutes} minutos`;
                          } else if (minutes === 0) {
                            etaText = hours === 1 ? '1 hora' : `${hours} horas`;
                          } else {
                            etaText = hours === 1 ? `1 hora e ${minutes} minutos` : `${hours} horas e ${minutes} minutos`;
                          }
                        } else {
                          const now = new Date();
                          const arrival = new Date(now.getTime() + totalMin * 60000);
                          const hStr = String(arrival.getHours()).padStart(2, '0');
                          const mStr = String(arrival.getMinutes()).padStart(2, '0');
                          etaText = `${hStr}:${mStr}`;
                        }

                        const arrivalPrefix = mode === 'duration' ? 'em aproximadamente' : 'às';
                        const phone = (o.phone1 || '').replace(/\D/g, '');
                        const phoneNum = phone.startsWith('55') ? phone : `55${phone}`;
                        const addr = `${o.address || ''} ${o.number || ''}, ${o.neighborhood || ''} - ${o.city || ''}`.trim();
                        const msg = `Olá, *Mastermaq Assistência Técnica Serviço Autorizado*, informa que o técnico *${route.technician || ''}* chegará ao destino ${arrivalPrefix} *${etaText}*.\n\nOS ${o.os_number} - ${o.customer_name || ''}\n${addr}\n${o.phone1 || ''}`;
                        window.open(`https://wa.me/${phoneNum}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                    >
                      <MessageCircle className="h-3 w-3 mr-1" />Enviar previsão
                    </Button>
                  </div>
                  {/* Confirmar Agendamento */}
                  <div className="mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-green-700 border-green-300 hover:bg-green-50"
                      data-testid={`confirm-scheduling-${o.os_number}`}
                      onClick={() => {
                        // ALWAYS use the route date (selected on creation/edit).
                        // Never depend on route.name — even if the name was edited.
                        const routeDate = route.date || route.attendance_date || '';
                        let dateStr = '';
                        try {
                          const d = new Date(routeDate + 'T12:00:00');
                          if (!isNaN(d.getTime())) {
                            const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
                            dateStr = `${d.toLocaleDateString('pt-BR')} (${dias[d.getDay()]})`;
                          }
                        } catch { /* fall through */ }
                        if (!dateStr) {
                          toast.error('Data do roteiro inválida — abra Editar Roteiro e defina a data.');
                          return;
                        }
                        const addrParts = [o.address, o.number ? `N° ${o.number}` : ''].filter(Boolean).join(' ');
                        const locParts = [o.neighborhood, o.city].filter(Boolean).join(' - ');
                        const addr = [addrParts, locParts ].filter(Boolean).join(', ');
                        const phone = (o.phone1 || '').replace(/\D/g, '');
                        const phoneWa = phone.startsWith('55') ? phone : `55${phone}`;
                        // Build Maps link with lat/lng when available (more precise)
                        const mapsLink = (o.lat && o.lng)
                          ? `https://www.google.com/maps?q=${o.lat},${o.lng}`
                          : '';
                        const mapsLine = mapsLink ? `\nLocalização: ${mapsLink}\n` : '';
                        const msg = `Olá,\n\nA Mastermaq Assistência Técnica (Serviço Autorizado) informa que teremos disponibilidade técnica para o seu atendimento dia ${dateStr}.\n\nPedimos, por gentileza, que verifique se as informações abaixo estão corretas:\n\nOS ${o.os_number} - ${o.customer_name || ''}\n\n${addr}${mapsLine}\n${o.phone1 || ''}\n\nPodemos confirmar o agendamento para essa data?\n\nRessaltamos também que trabalhamos dentro do horário comercial (9h às 18h) e não realizamos agendamento com horário marcado. Você receberá uma mensagem automática entre 30 e 60 minutos antes da chegada do técnico.\n\nAguardamos sua confirmação`;
                        window.open(`https://wa.me/${phoneWa}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                    >
                      <MessageCircle className="h-3 w-3 mr-1" />Confirmar Agendamento
                    </Button>
                  </div>
                  <RouteOSInputs
                    osNumber={o.os_number}
                    initialConclusion={o.conclusion}
                    initialObservation={o.observation}
                    onPersist={persistOSEntry}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Save changes button */}
          <div className="pt-3 border-t">
            <Button
              onClick={handleSaveAllChanges}
              disabled={saving || !hasChanges}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
              data-testid="route-save-changes-btn"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : 'Salvar Alterações'}
            </Button>
          </div>
        </ScrollArea>
        <RouteMapDialog
          open={showMapDialog}
          onClose={() => setShowMapDialog(false)}
          orders={orders}
          routeName={route.name || `Roteiro ${route.date}`}
          token={token}
          routeId={route.id}
          userRole={userRole}
          userName={userName}
        />
      </DialogContent>
    </Dialog>
    <OrderDetailOverlay
      open={!!quickViewOS}
      onClose={() => setQuickViewOS(null)}
      osNumber={quickViewOS}
      onOrderUpdated={() => {
        // Re-fetch fresh route data after OS was updated
        axios.get(`${API}/routes/${route.id}`, getAuthHeader())
          .then(res => {
            const fresh = res.data;
            setOrders(fresh.orders || []);
            const hasAddrChange = (fresh.orders || []).some(o => o.address_changed);
            setNeedsRecalc(hasAddrChange);
          })
          .catch(() => {});
        onUpdated();
      }}
    />
    </>
  );
};


// === EDIT ROUTE MODAL ===
const EditRouteModal = ({ open, onClose, route, token, onUpdated, technicianNames = [], userRole = 'admin', userName = '' }) => {
  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${token}` } });

  const [orders, setOrders] = useState(route.orders || []);
  const [routeName, setRouteName] = useState(route.name || '');
  const [routeTechnician, setRouteTechnician] = useState(route.technician || '');
  const [routeDate, setRouteDate] = useState(route.date || '');
  const [totalDistance, setTotalDistance] = useState(route.total_distance || '');
  const [totalDuration, setTotalDuration] = useState(route.total_duration || '');
  const [status, setStatus] = useState(route.status || 'Pendente');
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [quickViewOS, setQuickViewOS] = useState(null);

  // Add OS panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [loadingOS, setLoadingOS] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const moveOrder = (idx, dir) => {
    const newOrders = [...orders];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= newOrders.length) return;
    [newOrders[idx], newOrders[targetIdx]] = [newOrders[targetIdx], newOrders[idx]];
    newOrders.forEach((o, i) => o.sequence = i + 1);
    setOrders(newOrders);
  };

  const removeOrder = (idx) => {
    const newOrders = orders.filter((_, i) => i !== idx);
    newOrders.forEach((o, i) => o.sequence = i + 1);
    setOrders(newOrders);
  };

  const [editOsSearch, setEditOsSearch] = useState('');
  const [editOsPage, setEditOsPage] = useState(1);
  const [editOsTotalPages, setEditOsTotalPages] = useState(0);
  const editSearchTimerRef = useRef(null);

  const fetchAvailableOS = async (searchTerm = '', page = 1) => {
    setLoadingOS(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '10');
      params.append('page', page);
      if (searchTerm) params.append('search', searchTerm);
      const res = await axios.get(`${API}/service-orders?${params.toString()}`, getAuthHeader());
      const data = (res.data.orders || []).filter(o => o.status !== 'Finalizada');
      setAvailableOrders(data);
      setEditOsTotalPages(res.data.total_pages || 0);
    } catch { toast.error('Erro ao carregar OS disponíveis'); }
    finally { setLoadingOS(false); }
  };

  const handleOpenAddPanel = () => {
    setShowAddPanel(true);
    fetchAvailableOS(editOsSearch, editOsPage);
  };

  const addOrder = (os) => {
    if (orders.some(o => o.os_number === os.os_number)) {
      toast.error('OS já está no roteiro');
      return;
    }
    const newOrder = {
      os_number: os.os_number,
      customer_name: os.customer_name || '',
      neighborhood: os.neighborhood || '',
      city: os.city || '',
      address: os.address || '',
      number: os.number || '',
      phone1: os.phone1 || '',
      technician: routeTechnician,
      conclusion: '',
      observation: '',
      sequence: orders.length + 1,
      lat: os.lat || null,
      lng: os.lng || null,
      attendance_date: os.attendance_date || '',
      status: os.status || '',
    };
    setOrders(prev => [...prev, newOrder]);
    toast.success(`OS ${os.os_number} adicionada`);
  };

  // Filtered available orders (exclude already in route)
  const existingNums = new Set(orders.map(o => o.os_number));
  const filteredAvailable = availableOrders
    .filter(o => !existingNums.has(o.os_number))
    .filter(o => {
      if (!addSearch) return true;
      const s = addSearch.toLowerCase();
      return o.os_number?.toLowerCase().includes(s) ||
             o.customer_name?.toLowerCase().includes(s) ||
             o.address?.toLowerCase().includes(s) ||
             o.neighborhood?.toLowerCase().includes(s) ||
             o.city?.toLowerCase().includes(s);
    });

  // Clean address for route computation - uses centralised normalizeAddressForMaps
  const cleanAddr = (order) => normalizeAddressForMaps(order, false);

  const buildWp = (order) => {
    if (order.lat && order.lng) return { lat: order.lat, lng: order.lng };
    return { address: cleanAddr(order) };
  };

  const handleRecalculate = async () => {
    if (orders.length < 2) { toast.error('Mínimo 2 OS para recalcular'); return; }
    if (orders.length > 8) { toast.error('Máximo 8 OS por roteiro'); return; }
    setOptimizing(true);
    try {
      // OS #1 is the fixed starting point
      const firstOrder = orders[0];
      const remainingOrders = orders.slice(1);

      // Check cached coords
      const osNumbers = orders.map(o => o.os_number);
      let cachedMap = {};
      try {
        const cacheRes = await axios.post(`${API}/routes/geocode`, { os_numbers: osNumbers }, getAuthHeader());
        (cacheRes.data.results || []).forEach(r => { if (r.cached) cachedMap[r.os_number] = r; });
      } catch (e) { console.warn('Cache check failed:', e); }

      const getWaypoint = (order) => {
        const cached = cachedMap[order.os_number];
        if (cached) return { lat: cached.lat, lng: cached.lng };
        if (order.lat && order.lng) return { lat: order.lat, lng: order.lng };
        return { address: cleanAddr(order) };
      };

      // Use OS #1 as origin, remaining as optimized intermediates
      const firstWp = getWaypoint(firstOrder);
      const remainingWps = remainingOrders.map(o => ({ order: o, waypoint: getWaypoint(o) }));

      const routeRes = await axios.post(`${API}/routes/compute-route`, {
        origin: firstWp.address ? { address: firstWp.address } : { lat: firstWp.lat, lng: firstWp.lng },
        destination: { lat: BASE_LAT, lng: BASE_LNG },
        intermediates: remainingWps.map(w => w.waypoint),
        optimize_waypoint_order: true,
      }, getAuthHeader());

      const routeResult = routeRes.data.routes?.[0];
      if (!routeResult) throw new Error('Nenhuma rota retornada');

      const waypointOrder = routeResult.optimizedIntermediateWaypointIndex || remainingWps.map((_, i) => i);
      const legs = routeResult.legs || [];

      const toCache = [];

      // First order is always sequence 1
      const firstLeg = legs[0];
      const firstEndLoc = firstLeg?.startLocation?.latLng;
      const firstLat = firstOrder.lat || firstEndLoc?.latitude || null;
      const firstLng = firstOrder.lng || firstEndLoc?.longitude || null;
      const reorderedFirst = { ...firstOrder, lat: firstLat, lng: firstLng, sequence: 1 };

      // Remaining orders reordered by optimization
      const reorderedRest = waypointOrder.map((originalIdx, seq) => {
        const wp = remainingWps[originalIdx];
        const leg = legs[seq];
        const endLoc = leg?.endLocation?.latLng;
        const lat = endLoc?.latitude || wp.order.lat || null;
        const lng = endLoc?.longitude || wp.order.lng || null;
        if (!wp.order.lat && !wp.order.lng && lat && lng) {
          toCache.push({ os_number: wp.order.os_number, lat, lng });
        }
        return { ...wp.order, lat, lng, sequence: seq + 2 };
      });

      const reordered = [reorderedFirst, ...reorderedRest];

      if (toCache.length > 0) {
        try { await axios.post(`${API}/routes/cache-coords`, { coords: toCache }, getAuthHeader()); }
        catch (e) { console.warn('Cache save failed:', e); }
      }

      const parseDur = (s) => parseInt((s || '0').replace('s', ''), 10) || 0;
      const dist = legs.reduce((sum, l) => sum + (l.distanceMeters || 0), 0);
      const dur = legs.reduce((sum, l) => sum + parseDur(l.duration), 0);
      const mins = Math.round(dur / 60);
      setTotalDistance(`${(dist / 1000).toFixed(1)} km`);
      setTotalDuration(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins}min`);
      setOrders(reordered);
      toast.success('Rota recalculada a partir da OS #1');
    } catch (err) {
      console.error('Recalculate error:', err);
      toast.error(`Erro ao recalcular: ${err.response?.data?.detail || err.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  const handleSave = async () => {
    if (!routeTechnician) { toast.error('Informe o técnico'); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/routes/${route.id}`, {
        name: routeName,
        technician: routeTechnician,
        date: routeDate,
        status,
        orders: orders.map(o => ({
          os_number: o.os_number,
          customer_name: o.customer_name || '',
          neighborhood: o.neighborhood || '',
          city: o.city || '',
          address: o.address || '',
          number: o.number || '',
          phone1: o.phone1 || '',
          technician: routeTechnician,
          conclusion: o.conclusion || '',
          observation: o.observation || '',
          sequence: o.sequence,
          lat: o.lat || null,
          lng: o.lng || null,
          attendance_date: o.attendance_date || '',
          status: o.status || '',
          // Clear address_changed flag on save
        })),
        total_distance: totalDistance,
        total_duration: totalDuration,
      }, getAuthHeader());
      toast.success('Roteiro atualizado!');
      onUpdated();
    } catch { toast.error('Erro ao salvar roteiro'); }
    finally { setSaving(false); }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!quickViewOS) onClose(v); }} modal={!quickViewOS}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] sm:max-h-[90vh] h-[100dvh] sm:h-auto overflow-hidden p-0"
        data-testid="edit-route-modal"
        onPointerDownOutside={(e) => { if (quickViewOS) e.preventDefault(); }}
        onInteractOutside={(e) => { if (quickViewOS) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (quickViewOS) e.preventDefault(); }}
      >
        <div className="p-4 sm:p-6 border-b">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Editar Roteiro
          </DialogTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Nome do roteiro" data-testid="edit-route-name" />
            </div>
            <div>
              <Label className="text-xs">Técnico</Label>
              <TechnicianCombobox value={routeTechnician} onChange={setRouteTechnician} technicians={technicianNames} testId="edit-route-technician" />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={routeDate} onChange={e => setRouteDate(e.target.value)} data-testid="edit-route-date" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36" data-testid="edit-route-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUTE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {totalDistance && <Badge variant="outline"><Navigation className="h-3 w-3 mr-1" />{totalDistance}</Badge>}
            {totalDuration && <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{totalDuration}</Badge>}
            <Badge variant="outline"><MapPin className="h-3 w-3 mr-1" />{orders.length} OS</Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-auto" style={{ maxHeight: 'calc(90vh - 260px)' }}>
          <div className="p-4 sm:p-6 space-y-3 w-full max-w-full min-w-0">
            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleOpenAddPanel} data-testid="edit-route-add-os-btn">
                <Plus className="h-4 w-4 mr-1" /> Adicionar OS
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={handleRecalculate}
                disabled={optimizing || orders.length < 2}
                data-testid="edit-route-recalculate-btn"
              >
                {optimizing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Recalculando...</> : <><Route className="h-4 w-4 mr-1" />Recalcular Rota</>}
              </Button>
            </div>

            {/* Add OS Panel */}
            {showAddPanel && (
              <div className="border rounded-lg p-3 bg-gray-50 space-y-3" data-testid="edit-route-add-panel">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Adicionar OS ao Roteiro</h4>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddPanel(false)} data-testid="edit-route-close-add-panel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={addSearch}
                    onChange={e => {
                      setAddSearch(e.target.value);
                      // Server-side search with debounce
                      if (editSearchTimerRef.current) clearTimeout(editSearchTimerRef.current);
                      editSearchTimerRef.current = setTimeout(() => {
                        setEditOsPage(1);
                        fetchAvailableOS(e.target.value, 1);
                      }, 400);
                    }}
                    placeholder="Buscar OS, cliente, endereço, bairro..."
                    className="pl-9"
                    data-testid="edit-route-add-search"
                  />
                </div>
                {loadingOS ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                ) : (
                  <>
                  <div className="max-h-[200px] overflow-y-auto border rounded bg-white">
                    {filteredAvailable.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3 text-center">Nenhuma OS disponível</p>
                    ) : filteredAvailable.map(o => (
                      <div key={o.os_number}
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer active:bg-blue-50 transition-colors"
                        onClick={() => addOrder(o)}
                        data-testid={`add-os-item-${o.os_number}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">OS {o.os_number} - {o.customer_name}</div>
                          <div className="text-xs text-gray-500 truncate">{o.neighborhood} - {o.city} | {o.phone1}</div>
                        </div>
                        <div className="text-green-600 shrink-0 ml-2">
                          <Plus className="h-4 w-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-gray-400">Página {editOsPage}/{editOsTotalPages || 1}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={editOsPage <= 1}
                        onClick={() => { setEditOsPage(p => p - 1); fetchAvailableOS(addSearch, editOsPage - 1); }}>Ant</Button>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={editOsPage >= editOsTotalPages}
                        onClick={() => { setEditOsPage(p => p + 1); fetchAvailableOS(addSearch, editOsPage + 1); }}>Próx</Button>
                    </div>
                  </div>
                  </>
                )}
              </div>
            )}

            {/* Current orders */}
            <h4 className="text-sm font-medium">Sequência de Atendimento ({orders.length} OS)</h4>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma OS no roteiro. Adicione OS acima.</p>
            ) : orders.map((o, idx) => (
              <div key={o.os_number} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border rounded-lg bg-white" data-testid={`edit-seq-${o.os_number}`}>
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                    {o.sequence}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">OS {o.os_number} - {o.customer_name}</span>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-600 text-xs shrink-0" onClick={() => setQuickViewOS(o.os_number)} data-testid={`edit-view-os-${o.os_number}`}>
                        Ver OS
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{o.address} {o.number}, {o.neighborhood} - {o.city}</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0 self-end sm:self-auto">
                  <Button variant="ghost" size="sm" onClick={() => moveOrder(idx, -1)} disabled={idx === 0} data-testid={`edit-move-up-${o.os_number}`}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => moveOrder(idx, 1)} disabled={idx === orders.length - 1} data-testid={`edit-move-down-${o.os_number}`}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => removeOrder(idx)} data-testid={`edit-remove-os-${o.os_number}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer: Save */}
        <div className="p-4 sm:p-6 border-t flex items-center gap-2 flex-wrap">
          <Button onClick={handleSave} disabled={saving || orders.length === 0} className="bg-gray-900 hover:bg-gray-800 text-white flex-1 sm:flex-none" data-testid="edit-route-save-btn">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : 'Salvar Alterações'}
          </Button>
          <Button variant="outline" onClick={() => onClose(false)} data-testid="edit-route-cancel-btn">Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
    <OrderDetailOverlay
      open={!!quickViewOS}
      onClose={() => setQuickViewOS(null)}
      osNumber={quickViewOS}
      onOrderUpdated={() => {
        axios.get(`${API}/routes/${route.id}`, getAuthHeader())
          .then(res => { setOrders(res.data.orders || []); })
          .catch(() => {});
        onUpdated();
      }}
    />
    </>
  );
};


// Wrap with Google Maps loader - libraries as static const to prevent reload warning
const RoutesPageWrapper = () => {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  if (!isLoaded) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Carregando Google Maps...</span>
        </div>
      </DashboardLayout>
    );
  }

  return <RoutesPage />;
};

export default RoutesPageWrapper;
