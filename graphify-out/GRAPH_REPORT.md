# Graph Report - .  (2026-07-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1116 nodes · 1898 edges · 118 communities (66 shown, 52 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e76f0769`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113

## God Nodes (most connected - your core abstractions)
1. `cn()` - 67 edges
2. `useAuth()` - 30 edges
3. `SupabaseCollection` - 19 edges
4. `Button` - 16 edges
5. `DashboardLayout()` - 14 edges
6. `_get_client()` - 13 edges
7. `_headers()` - 13 edges
8. `Label` - 13 edges
9. `Input` - 12 edges
10. `FindCursor` - 11 edges

## Surprising Connections (you probably didn't know these)
- `OrderDetailOverlay()` --indirect_call--> `toast()`  [INFERRED]
  frontend/src/components/OrderDetailOverlay.js → frontend/src/hooks/use-toast.js
- `AlertDialogHeader()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/alert-dialog.jsx → frontend/src/lib/utils.js
- `AlertDialogFooter()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/alert-dialog.jsx → frontend/src/lib/utils.js
- `BreadcrumbSeparator()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/breadcrumb.jsx → frontend/src/lib/utils.js
- `BreadcrumbEllipsis()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/breadcrumb.jsx → frontend/src/lib/utils.js

## Import Cycles
- 3-file cycle: `frontend/src/components/DashboardLayout.js -> frontend/src/components/OrderDetailOverlay.js -> frontend/src/pages/ServiceOrdersPage.js -> frontend/src/components/DashboardLayout.js`

## Communities (118 total, 52 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (68): api_health(), CEPResponse, check_new_external_os(), env_check(), fetch_temp_pdf(), get_customer_history(), get_dashboard(), get_distinct_brands() (+60 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (46): autoprefixer, @babel/plugin-proposal-private-property-in-object, @craco/craco, @emergentbase/visual-edits, eslint, @eslint/js, eslint-plugin-import, eslint-plugin-jsx-a11y (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (17): AggCursor, FindCursor, _get_client(), _headers(), Supabase database adapter - provides MongoDB-like interface over Supabase REST…, Basic aggregation support - returns AggCursor, Mimics Motor's find cursor with chaining, Format a value for PostgREST filter (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (40): _auth(), BatchCreate, create_batch(), create_movement(), create_product(), create_serial(), create_supplier(), delete_product() (+32 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (38): _address_hash(), _build_waypoint(), cache_coords(), CacheCoordsItem, CacheCoordsRequest, compute_route(), ComputeRouteRequest, create_route() (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (35): BreadcrumbPoint, create_share_token(), current_session(), end_tracking(), get_breadcrumbs(), get_live_position(), get_tracking_config(), GPSUpdate (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (32): react, Carousel, CarouselContent, CarouselContext, CarouselItem, CarouselNext, CarouselPrevious, useCarousel() (+24 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (25): OrderDetailOverlay(), SignatureModal(), SignatureViewModal(), DropdownMenuContent, DropdownMenuItem, TabsContent, TabsList, TabsTrigger (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (21): PopoverContent, SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (25): _decode_base64_image(), generate_laudo_from_template(), _get_month_name(), _make_blank_jpeg(), Laudo Generator - Template-based approach Opens the real DOCX template and…, Replace status cell text with clean formatting (white background, black text).…, Replace serial number in cell, targeting the bold run at the end., Replace image blob AND update content type to ensure JPEG compatibility. (+17 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (15): Run sync for both Hisense and HQ Telecontrol, Run sync periodically every SYNC_INTERVAL_MINUTES, run_sync(), scheduler(), extract_brand_from_description(), Close browser instance safely, # NOTE: city and state NOT updated from list page (column indices unreliable), Fetch list of orders from consulta_lite_new.php with pagination support.… (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (12): DashboardLayout(), menuItems, NotificationsPanel(), Badge(), badgeVariants, Button, Input, ScrollArea (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (20): App(), AppRoutes(), ProtectedRoute(), PublicRoute(), Toaster(), AuthContext, AuthProvider(), failedQueue (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (20): LaudoModal(), PHOTO_LABELS, IMPORTANT: the OS PUT (step 2) is ADDITIVE — we only send a field if the, RECALL_PHOTO_LABELS, DialogContent, DialogDescription, DialogFooter(), DialogHeader() (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (22): fire_test_webhook(), get_photos_status(), increment_print_count(), migrate_fix_aguardando_status(), migrate_statuses(), post, Increment and return print count for an OS., Start the migration script in background (+14 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (12): AccordionContent, AccordionItem, AccordionTrigger, Checkbox, HoverCardContent, Progress, RadioGroup, RadioGroupItem (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (19): create_os_share_token(), create_service_order(), create_token(), login(), LoginRequest, LoginResponse, Notification, OSShareTokenRequest (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (18): Toast, ToastAction, ToastClose, ToastDescription, ToastTitle, toastVariants, ToastViewport, Toaster() (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (13): buttonVariants, Calendar(), Pagination(), PaginationContent, PaginationEllipsis(), PaginationItem, PaginationLink(), PaginationNext() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (15): _convert_pptx_to_pdf(), _find_soffice(), get_object(), init_storage(), _pdf_page_count(), put_object(), APIRouter, Manuais Module - File management for technical manuals Upload, organize by… (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.30
Nodes (14): qrcode, baseStyles(), calcQrSizeMm(), firstName(), fmtDate(), generateQRDataURL(), getOrigin(), LABEL_SIZES (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (14): date-fns, fabric, dependencies, date-fns, fabric, lucide-react, @radix-ui/react-tabs, @radix-ui/react-toast (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, icons, lang, name, orientation (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (12): fetch_os_data(), login(), map_to_schema(), parse_visit_fee(), Migration script - Fetches service orders from the old Mastermaq system and…, Save progress to JSON file for monitoring, Parse 'R$ 80,00' to 80.0, Login to the old system (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (8): create_external_os(), ExternalOS, Lightweight in-memory cache with TTL., OS received from external website/system, Send WhatsApp text message to Mastermaq office number., Create OS from external website/system. Uses the same numbering pattern as…, send_wa_notification(), SimpleCache

### Community 28 - "Community 28"
Cohesion: 0.21
Nodes (11): hash_password(), BaseModel, Users module — RBAC (Admin vs Technician) with bcrypt password hashing.…, Register /api/users routes. Admin-only for write operations., Ensure the legacy/master admin exists and password matches env., seed_admin(), setup_users_routes(), UserCreate (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (11): create_assignment(), create_signer(), generate_os_pdf(), get_document_status(), Assinafy Digital Signature Service Handles PDF generation and Assinafy API…, Upload a PDF document to Assinafy and return the document data, Create a signer in Assinafy, Create a virtual assignment for the document (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (11): force_resync(), _persist_health(), Run sync for both Hisense and HQ in parallel. Parallel execution ensures the HQ…, Force a catch-up resync for a specific scraper (Hisense or HQ)., Background task that flips a scraper to `down` when its last run is stale…, Run scraper sync, update health metrics, and trigger auto-resync on recovery.…, run_background_sync(), _run_sync_with_health() (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (10): delete_service_order(), mark_all_notifications_read(), mark_notification_read(), delete, put, Save laudo draft data to database for persistence. ADDITIVE save: only fields…, save_laudo_data(), ServiceOrderUpdate (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (7): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, FinancialPage()

### Community 33 - "Community 33"
Cohesion: 0.20
Nodes (8): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut()

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (8): AsyncClient, get_saudacao(), _get_shared_client(), APIRouter, WhatsApp Business API Module Handles configuration, message sending,…, Dynamic greeting based on time of day (Brasilia timezone UTC-3), Register WhatsApp Business API routes, setup_whatsapp_routes()

### Community 36 - "Community 36"
Cohesion: 0.31
Nodes (8): clean_doc(), insert_batch(), main(), migrate_collection(), Migration script: MongoDB → Supabase (PostgreSQL via REST API) Exports all data…, Remove MongoDB _id and convert non-serializable types, Insert a batch of rows into Supabase via REST API, Migrate a MongoDB collection to a Supabase table

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (9): _load_health_from_db(), Download Playwright chromium at runtime if missing. Cloud Build cannot fetch…, Auto-migrate on startup: source names and status normalization, Start background auto-sync loop for Telecontrol HISENSE only. HQ is NOT auto-…, shutdown_db_client(), startup_auto_sync(), startup_ensure_playwright_browser(), startup_migrate() (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (8): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 40 - "Community 40"
Cohesion: 0.39
Nodes (7): clear_table(), get_supabase_count(), insert_batch(), main(), normalize(), Migration: Railway MongoDB (production) → Supabase (PostgreSQL) Clears test…, Delete all rows from a Supabase table

### Community 41 - "Community 41"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (7): DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent, DropdownMenuSubTrigger

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (7): SheetContent, SheetDescription, SheetFooter(), SheetHeader(), SheetOverlay, SheetTitle, sheetVariants

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (5): LabelTemplate, LabelTemplateIn, BaseModel, Label Templates module — CRUD para templates de adesivos térmicos. Armazena…, setup_label_templates_routes()

### Community 47 - "Community 47"
Cohesion: 0.38
Nodes (6): insert_batch(), main(), Supabase Database Migration Script =================================== Creates…, Read CSV and return list of dicts, Insert rows in batches via Supabase REST API, read_csv()

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 50 - "Community 50"
Cohesion: 0.29
Nodes (4): LOGIN, LOGOUT, REGISTER, HOME

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (5): createMotoIcon(), MAP_STYLE, MOTO_SVG, ROUTE_POLYLINE_STYLES, STOP_COLORS

### Community 52 - "Community 52"
Cohesion: 0.47
Nodes (5): insert_batch(), main(), normalize(), Fix migration: insert missing service_orders and sync_logs with normalized keys, Ensure doc has exactly the specified columns, with None for missing

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, include, src

### Community 54 - "Community 54"
Cohesion: 0.47
Nodes (5): formatBytes(), formatDuration(), os, SERVER_START_TIME, setupHealthEndpoints()

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (5): generate_recall_laudo(), Generate a Recall inspection laudo DOCX programmatically., generate_laudo_word(), LaudoData, Generate laudo DOCX by filling the template and save to history

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (3): capture_fields(), Verify OS data by loading in browser form (the reliable method) vs what the…, verify()

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (3): CacheHeaderMiddleware, Cache policy: - Live data (service-orders, routes, notifications, tracking,…, BaseHTTPMiddleware

### Community 61 - "Community 61"
Cohesion: 0.50
Nodes (3): config, path, webpackConfig

### Community 62 - "Community 62"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (3): GOOGLE_MAPS_LIBRARIES, haversine(), PublicTrackingPage()

## Knowledge Gaps
- **276 isolated node(s):** `dispatch_webhook.sh script`, `watch_crons.sh script`, `webhook_crond.sh script`, `$schema`, `style` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 24` to `Community 1`, `Community 6`, `Community 23`, `Community 65`, `Community 66`, `Community 67`, `Community 68`, `Community 69`, `Community 70`, `Community 72`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Community 80`, `Community 81`, `Community 82`, `Community 83`, `Community 84`, `Community 85`, `Community 86`, `Community 87`, `Community 88`, `Community 89`, `Community 90`, `Community 91`, `Community 92`, `Community 93`, `Community 94`, `Community 95`, `Community 96`, `Community 97`, `Community 98`, `Community 99`, `Community 100`, `Community 101`, `Community 102`, `Community 103`, `Community 104`, `Community 105`, `Community 106`, `Community 107`, `Community 108`, `Community 109`, `Community 110`, `Community 111`, `Community 112`, `Community 113`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `react` connect `Community 6` to `Community 24`, `Community 17`, `Community 11`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 19` to `Community 6`, `Community 7`, `Community 8`, `Community 11`, `Community 13`, `Community 15`, `Community 17`, `Community 20`, `Community 32`, `Community 33`, `Community 34`, `Community 38`, `Community 39`, `Community 41`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 49`, `Community 56`, `Community 57`, `Community 62`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `dispatch_webhook.sh script`, `watch_crons.sh script`, `webhook_crond.sh script` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0443064182194617 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08233117483811286 - nodes in this community are weakly interconnected._