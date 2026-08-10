# Graph Report - app  (2026-07-31)

## Corpus Check
- 118 files · ~222,155 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1122 nodes · 1903 edges · 123 communities (66 shown, 57 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bf2f363a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- get
- devDependencies
- SupabaseCollection
- inventory_routes.py
- routes_module.py
- tracking_module.py
- form.jsx
- ServiceOrdersPage.js
- RoutesPage.js
- laudo_generator.py
- TelecontrolScraper
- DashboardLayout.js
- App.js
- InventoryPage.js
- post
- utils.js
- BaseModel
- use-toast.js
- components.json
- cn
- menubar.jsx
- server.py
- manuais_module.py
- printingService.js
- dependencies
- manifest.json
- migration_script.py
- SimpleCache
- users_module.py
- assinafy_service.py
- ManuaisPage.js
- mark_all_notifications_read
- LoginPage.js
- command.jsx
- context-menu.jsx
- whatsapp_module.py
- migrate_to_supabase.py
- force_resync
- alert-dialog.jsx
- table.jsx
- migrate_railway.py
- breadcrumb.jsx
- drawer.jsx
- dropdown-menu.jsx
- navigation-menu.jsx
- sheet.jsx
- label_templates_module.py
- migrate_to_new_supabase.py
- WebpackHealthPlugin
- toggle-group.jsx
- auth.js
- mapAssets.js
- migrate_fix.py
- compilerOptions
- health-endpoints.js
- generate_laudo_word
- alert.jsx
- Política de uso do Graphify neste projeto
- migration_verify.py
- CacheHeaderMiddleware
- dispatch_webhook.sh
- craco.config.js
- accordion.jsx
- PublicTrackingPage.js
- watch_crons.sh
- axios
- class-variance-authority
- clsx
- cmdk
- cra-template
- embla-carousel-react
- webhook_crond.sh
- @hookform/resolvers
- html2pdf.js
- input-otp
- mammoth
- next-themes
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-checkbox
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react-dom
- @react-google-maps/api
- react-hook-form
- react-resizable-panels
- react-router-dom
- react-scripts
- recharts
- @supabase/supabase-js
- tailwind-merge
- tailwindcss-animate
- vaul
- zod
- fetch_temp_pdf
- get_dashboard
- get_laudo_history
- get_migration_progress

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

## Communities (123 total, 57 thin omitted)

### Community 0 - "get"
Cohesion: 0.05
Nodes (44): api_health(), get_customer_history(), get_distinct_brands(), get_distinct_statuses(), get_external_os_status(), get_laudo_draft(), get_migration_summary(), get_next_invisacook_number() (+36 more)

### Community 1 - "devDependencies"
Cohesion: 0.04
Nodes (46): autoprefixer, @babel/plugin-proposal-private-property-in-object, @craco/craco, @emergentbase/visual-edits, eslint, @eslint/js, eslint-plugin-import, eslint-plugin-jsx-a11y (+38 more)

### Community 2 - "SupabaseCollection"
Cohesion: 0.07
Nodes (21): env_check(), get_photos_status(), Return whether the OS has all 8 mandatory photos (photo_1..photo_8) filled.…, Production diagnostic endpoint. Lists the 28 env vars the app needs and shows…, AggCursor, FindCursor, _get_client(), _headers() (+13 more)

### Community 3 - "inventory_routes.py"
Cohesion: 0.09
Nodes (40): _auth(), BatchCreate, create_batch(), create_movement(), create_product(), create_serial(), create_supplier(), delete_product() (+32 more)

### Community 4 - "routes_module.py"
Cohesion: 0.10
Nodes (38): _address_hash(), _build_waypoint(), cache_coords(), CacheCoordsItem, CacheCoordsRequest, compute_route(), ComputeRouteRequest, create_route() (+30 more)

### Community 5 - "tracking_module.py"
Cohesion: 0.11
Nodes (35): BreadcrumbPoint, create_share_token(), current_session(), end_tracking(), get_breadcrumbs(), get_live_position(), get_tracking_config(), GPSUpdate (+27 more)

### Community 6 - "form.jsx"
Cohesion: 0.10
Nodes (18): react, Carousel, CarouselContent, CarouselContext, CarouselItem, CarouselNext, CarouselPrevious, useCarousel() (+10 more)

### Community 7 - "ServiceOrdersPage.js"
Cohesion: 0.13
Nodes (24): OrderDetailOverlay(), SignatureModal(), SignatureViewModal(), TabsContent, TabsList, TabsTrigger, Textarea, BRAND_LIST (+16 more)

### Community 8 - "RoutesPage.js"
Cohesion: 0.10
Nodes (25): Checkbox, PopoverContent, Slider, supabase, buildMotoSVG(), buildTechIconSVG(), CreateRouteModal(), deduplicatePlaces() (+17 more)

### Community 9 - "laudo_generator.py"
Cohesion: 0.11
Nodes (25): _decode_base64_image(), generate_laudo_from_template(), _get_month_name(), _make_blank_jpeg(), Laudo Generator - Template-based approach Opens the real DOCX template and…, Replace status cell text with clean formatting (white background, black text).…, Replace serial number in cell, targeting the bold run at the end., Replace image blob AND update content type to ensure JPEG compatibility. (+17 more)

### Community 10 - "TelecontrolScraper"
Cohesion: 0.12
Nodes (15): Run sync for both Hisense and HQ Telecontrol, Run sync periodically every SYNC_INTERVAL_MINUTES, run_sync(), scheduler(), extract_brand_from_description(), Close browser instance safely, # NOTE: city and state NOT updated from list page (column indices unreliable), Fetch list of orders from consulta_lite_new.php with pagination support.… (+7 more)

### Community 11 - "DashboardLayout.js"
Cohesion: 0.16
Nodes (11): DashboardLayout(), menuItems, NotificationsPanel(), Badge(), badgeVariants, DropdownMenuContent, DropdownMenuItem, ScrollArea (+3 more)

### Community 12 - "App.js"
Cohesion: 0.11
Nodes (20): App(), AppRoutes(), ProtectedRoute(), PublicRoute(), Toaster(), AuthContext, AuthProvider(), failedQueue (+12 more)

### Community 13 - "InventoryPage.js"
Cohesion: 0.11
Nodes (22): LaudoModal(), PHOTO_LABELS, IMPORTANT: the OS PUT (step 2) is ADDITIVE — we only send a field if the, RECALL_PHOTO_LABELS, Button, DialogContent, DialogDescription, DialogFooter() (+14 more)

### Community 14 - "post"
Cohesion: 0.08
Nodes (26): create_os_share_token(), fire_test_webhook(), increment_print_count(), migrate_fix_aguardando_status(), migrate_statuses(), OSShareTokenRequest, post, Increment and return print count for an OS. (+18 more)

### Community 15 - "utils.js"
Cohesion: 0.09
Nodes (14): Avatar, AvatarFallback, AvatarImage, HoverCardContent, InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot (+6 more)

### Community 16 - "BaseModel"
Cohesion: 0.11
Nodes (21): create_external_os(), create_service_order(), ExternalOS, Notification, BaseModel, Sign an OS with technician and client signatures, Run sync for both Hisense and HQ in parallel. Parallel execution ensures the HQ…, OS received from external website/system (+13 more)

### Community 17 - "use-toast.js"
Cohesion: 0.16
Nodes (18): Toast, ToastAction, ToastClose, ToastDescription, ToastTitle, toastVariants, ToastViewport, Toaster() (+10 more)

### Community 18 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 19 - "cn"
Cohesion: 0.21
Nodes (13): buttonVariants, Calendar(), Pagination(), PaginationContent, PaginationEllipsis(), PaginationItem, PaginationLink(), PaginationNext() (+5 more)

### Community 20 - "menubar.jsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 21 - "server.py"
Cohesion: 0.12
Nodes (21): CEPResponse, check_new_external_os(), create_token(), get_webhook_config(), login(), LoginRequest, LoginResponse, lookup_cep() (+13 more)

### Community 22 - "manuais_module.py"
Cohesion: 0.15
Nodes (15): _convert_pptx_to_pdf(), _find_soffice(), get_object(), init_storage(), _pdf_page_count(), put_object(), APIRouter, Manuais Module - File management for technical manuals Upload, organize by… (+7 more)

### Community 23 - "printingService.js"
Cohesion: 0.30
Nodes (14): qrcode, baseStyles(), calcQrSizeMm(), firstName(), fmtDate(), generateQRDataURL(), getOrigin(), LABEL_SIZES (+6 more)

### Community 24 - "dependencies"
Cohesion: 0.15
Nodes (14): date-fns, fabric, dependencies, date-fns, fabric, lucide-react, @radix-ui/react-tabs, @radix-ui/react-toast (+6 more)

### Community 25 - "manifest.json"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, icons, lang, name, orientation (+5 more)

### Community 26 - "migration_script.py"
Cohesion: 0.22
Nodes (12): fetch_os_data(), login(), map_to_schema(), parse_visit_fee(), Migration script - Fetches service orders from the old Mastermaq system and…, Save progress to JSON file for monitoring, Parse 'R$ 80,00' to 80.0, Login to the old system (+4 more)

### Community 28 - "users_module.py"
Cohesion: 0.21
Nodes (11): hash_password(), BaseModel, Users module — RBAC (Admin vs Technician) with bcrypt password hashing.…, Register /api/users routes. Admin-only for write operations., Ensure the legacy/master admin exists and password matches env., seed_admin(), setup_users_routes(), UserCreate (+3 more)

### Community 29 - "assinafy_service.py"
Cohesion: 0.17
Nodes (11): create_assignment(), create_signer(), generate_os_pdf(), get_document_status(), Assinafy Digital Signature Service Handles PDF generation and Assinafy API…, Upload a PDF document to Assinafy and return the document data, Create a signer in Assinafy, Create a virtual assignment for the document (+3 more)

### Community 30 - "ManuaisPage.js"
Cohesion: 0.20
Nodes (12): SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, DEFAULT_BRANDS (+4 more)

### Community 31 - "mark_all_notifications_read"
Cohesion: 0.50
Nodes (5): delete_service_order(), mark_all_notifications_read(), mark_notification_read(), delete, put

### Community 32 - "LoginPage.js"
Cohesion: 0.33
Nodes (7): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, FinancialPage()

### Community 33 - "command.jsx"
Cohesion: 0.20
Nodes (8): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut()

### Community 34 - "context-menu.jsx"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 35 - "whatsapp_module.py"
Cohesion: 0.22
Nodes (8): AsyncClient, get_saudacao(), _get_shared_client(), APIRouter, WhatsApp Business API Module Handles configuration, message sending,…, Dynamic greeting based on time of day (Brasilia timezone UTC-3), Register WhatsApp Business API routes, setup_whatsapp_routes()

### Community 36 - "migrate_to_supabase.py"
Cohesion: 0.31
Nodes (8): clean_doc(), insert_batch(), main(), migrate_collection(), Migration script: MongoDB → Supabase (PostgreSQL via REST API) Exports all data…, Remove MongoDB _id and convert non-serializable types, Insert a batch of rows into Supabase via REST API, Migrate a MongoDB collection to a Supabase table

### Community 37 - "force_resync"
Cohesion: 0.12
Nodes (16): force_resync(), _load_health_from_db(), _persist_health(), Download Playwright chromium at runtime if missing. Cloud Build cannot fetch…, Auto-migrate on startup: source names and status normalization, Force a catch-up resync for a specific scraper (Hisense or HQ)., Start background auto-sync loop for Telecontrol HISENSE only. HQ is NOT auto-…, Background task that flips a scraper to `down` when its last run is stale… (+8 more)

### Community 38 - "alert-dialog.jsx"
Cohesion: 0.22
Nodes (8): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle

### Community 39 - "table.jsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 40 - "migrate_railway.py"
Cohesion: 0.39
Nodes (7): clear_table(), get_supabase_count(), insert_batch(), main(), normalize(), Migration: Railway MongoDB (production) → Supabase (PostgreSQL) Clears test…, Delete all rows from a Supabase table

### Community 41 - "breadcrumb.jsx"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 42 - "drawer.jsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 43 - "dropdown-menu.jsx"
Cohesion: 0.25
Nodes (7): DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent, DropdownMenuSubTrigger

### Community 44 - "navigation-menu.jsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 45 - "sheet.jsx"
Cohesion: 0.25
Nodes (7): SheetContent, SheetDescription, SheetFooter(), SheetHeader(), SheetOverlay, SheetTitle, sheetVariants

### Community 46 - "label_templates_module.py"
Cohesion: 0.33
Nodes (5): LabelTemplate, LabelTemplateIn, BaseModel, Label Templates module — CRUD para templates de adesivos térmicos. Armazena…, setup_label_templates_routes()

### Community 47 - "migrate_to_new_supabase.py"
Cohesion: 0.38
Nodes (6): insert_batch(), main(), Supabase Database Migration Script =================================== Creates…, Read CSV and return list of dicts, Insert rows in batches via Supabase REST API, read_csv()

### Community 49 - "toggle-group.jsx"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 50 - "auth.js"
Cohesion: 0.29
Nodes (4): LOGIN, LOGOUT, REGISTER, HOME

### Community 51 - "mapAssets.js"
Cohesion: 0.33
Nodes (5): createMotoIcon(), MAP_STYLE, MOTO_SVG, ROUTE_POLYLINE_STYLES, STOP_COLORS

### Community 52 - "migrate_fix.py"
Cohesion: 0.47
Nodes (5): insert_batch(), main(), normalize(), Fix migration: insert missing service_orders and sync_logs with normalized keys, Ensure doc has exactly the specified columns, with None for missing

### Community 53 - "compilerOptions"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, include, src

### Community 54 - "health-endpoints.js"
Cohesion: 0.47
Nodes (5): formatBytes(), formatDuration(), os, SERVER_START_TIME, setupHealthEndpoints()

### Community 55 - "generate_laudo_word"
Cohesion: 0.40
Nodes (5): generate_recall_laudo(), Generate a Recall inspection laudo DOCX programmatically., generate_laudo_word(), LaudoData, Generate laudo DOCX by filling the template and save to history

### Community 56 - "alert.jsx"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 57 - "Política de uso do Graphify neste projeto"
Cohesion: 0.33
Nodes (5): Comandos úteis, Política de uso do Graphify neste projeto, Quando NÃO USAR o grafo (ler arquivo direto), Quando USAR o grafo (`graphify query/path/explain`), Ruído já excluído (via `/app/.graphifyignore`)

### Community 58 - "migration_verify.py"
Cohesion: 0.67
Nodes (3): capture_fields(), Verify OS data by loading in browser form (the reliable method) vs what the…, verify()

### Community 59 - "CacheHeaderMiddleware"
Cohesion: 0.50
Nodes (3): CacheHeaderMiddleware, Cache policy: - Live data (service-orders, routes, notifications, tracking,…, BaseHTTPMiddleware

### Community 61 - "craco.config.js"
Cohesion: 0.50
Nodes (3): config, path, webpackConfig

### Community 62 - "accordion.jsx"
Cohesion: 0.50
Nodes (3): AccordionContent, AccordionItem, AccordionTrigger

### Community 63 - "PublicTrackingPage.js"
Cohesion: 0.67
Nodes (3): GOOGLE_MAPS_LIBRARIES, haversine(), PublicTrackingPage()

## Knowledge Gaps
- **280 isolated node(s):** `Quando USAR o grafo (`graphify query/path/explain`)`, `Quando NÃO USAR o grafo (ler arquivo direto)`, `Comandos úteis`, `Ruído já excluído (via `/app/.graphifyignore`)`, `dispatch_webhook.sh script` (+275 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **57 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`, `form.jsx`, `printingService.js`, `axios`, `class-variance-authority`, `clsx`, `cmdk`, `cra-template`, `embla-carousel-react`, `@hookform/resolvers`, `html2pdf.js`, `input-otp`, `mammoth`, `next-themes`, `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react-dom`, `@react-google-maps/api`, `react-hook-form`, `react-resizable-panels`, `react-router-dom`, `react-scripts`, `recharts`, `@supabase/supabase-js`, `tailwind-merge`, `tailwindcss-animate`, `vaul`, `zod`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `react` connect `form.jsx` to `dependencies`, `use-toast.js`, `DashboardLayout.js`, `RoutesPage.js`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `form.jsx`, `ServiceOrdersPage.js`, `RoutesPage.js`, `DashboardLayout.js`, `InventoryPage.js`, `utils.js`, `use-toast.js`, `menubar.jsx`, `ManuaisPage.js`, `LoginPage.js`, `command.jsx`, `context-menu.jsx`, `alert-dialog.jsx`, `table.jsx`, `breadcrumb.jsx`, `drawer.jsx`, `dropdown-menu.jsx`, `navigation-menu.jsx`, `sheet.jsx`, `toggle-group.jsx`, `alert.jsx`, `accordion.jsx`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `Quando USAR o grafo (`graphify query/path/explain`)`, `Quando NÃO USAR o grafo (ler arquivo direto)`, `Comandos úteis` to the rest of the system?**
  _280 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `get` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `SupabaseCollection` be split into smaller, more focused modules?**
  _Cohesion score 0.07450980392156863 - nodes in this community are weakly interconnected._