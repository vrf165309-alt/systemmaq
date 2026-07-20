# PRD — Mastermaq / Maq-Sync-Hub

## Contexto original (problem statement)
Migração de codebase do repositório `https://github.com/fernandodo2027-rgb/maq-sync-hub.git` (última atualização: Julho/2026) para um novo ambiente Emergent. O app é um sistema de gestão de Ordens de Serviço (OS) para assistência técnica, com scraping do Telecontrol (Hisense + HQ), integração Supabase (dados relacionais) + MongoDB (metadados locais), geração de laudos DOCX, e um perfil white-label restrito para o parceiro Invisacook.

## Stack
- Frontend: React 19 (CRA + Craco), Tailwind, Shadcn/UI, lucide-react, axios, react-router 6
- Backend: Python 3.11 + FastAPI + uvicorn (Supervisor porta 8001)
- DB primário: Supabase (PostgreSQL via PostgREST) — inclui `laudo_drafts`
- DB secundário: MongoDB local (`os_metadata` priority/print_count, `users`, tracking GPS, session, notifications_seen)
- Scraping: Playwright + Chromium headless
- Docx: python-docx + openpyxl
- Auth: JWT customizado (3 roles: `admin`, `technician`, `invisacook`)
- Integrações externas: Google Maps, WhatsApp Cloud API, Assinafy, Emergent LLM Key, Telecontrol

## Personas / Roles
- **admin** (Master): acesso total, gerencia usuários, sincroniza, gera laudos, cadastra produtos etc.
- **technician**: acesso operacional às OSs, roteiro, laudos.
- **invisacook**: perfil restrito white-label — só vê/edita OSs com `source="invisacook"`, numeração INV-#####, header/sidebar/logo Invisacook, menu só com "Ordens de Serviço".

## Migração realizada em 20/07/2026
Passo a passo executado conforme o problem statement:

1. Apagado tudo em `/app` exceto `.git` e `.emergent`.
2. Clonado `https://github.com/fernandodo2027-rgb/maq-sync-hub.git` em `/tmp/repo` e copiado para `/app/` (menos `.git`).
3. Backend deps: `pip install -r requirements.txt` — OK.
4. Frontend deps: `yarn install --ignore-engines` — OK (aviso opcional do `canvas` ignorado, conforme documentação).
5. Playwright: `playwright install chromium` no path `/root/.cache/ms-playwright` — OK.
6. `/app/backend/.env` criado com todas as 28 chaves obrigatórias.
7. `/app/frontend/.env` criado com `REACT_APP_BACKEND_URL` corrigido para o preview real do pod (`https://2c89069e-d05b-494c-a8d1-ed71aa3f7761.preview.emergentagent.com`) + `REACT_APP_GOOGLE_MAPS_API_KEY` + `WDS_SOCKET_PORT`.
   - ⚠️ O `REACT_APP_BACKEND_URL` inicial (`next-agent-deploy-1...`) estava desatualizado; substituído pelo endpoint correto obtido de `$preview_endpoint`.
8. `sudo supervisorctl restart backend frontend` — ambos RUNNING.
9. Verificação (checklist F):
   - `/api/admin/env-check` → `missing:[]`, `present_count:28`, `supabase_project_ref: vqzwgkevsaihlgmcswvi`, `live_products_query.http_status: 200`.
   - Login admin → OK. `GET /api/service-orders?limit=2` → `total: 6821` (>6000 ✅).
   - Frontend `/` → HTTP 200. Screenshot mostra tela de login Mastermaq carregando.
10. Usuário Invisacook recriado via `POST /api/users` (admin token) — HTTP 200. Login Invisacook validado.

## Otimizações críticas herdadas (NÃO reverter)
- Photo lazy-load (`?include_photos=1`).
- RPC `photos_status_for()` para reduzir egress.
- Caches em memória (dashboard 5min, statuses/brands 10min, OS list 60s, notifications 30s).
- Auto-sync HQ removido — HQ só via botão "Sincronizar".
- `update_one` do adapter Supabase RAISE em erro.
- Priority preservada (só muta se `priority` no body).
- Filtro Priority cross-page (busca IDs no Mongo antes de paginar no Supabase).
- OS Cancelada sempre disponível no filtro de status.
- Laudo Mastermaq preserva fontes via `_set_cell_text_preserving_runs()` (SEM campos Hisense).
- Merge-only sync do `OrderDetailModal`/`LaudoModal`.
- Search input mobile-safe (sem `isComposingRef`).
- Responsividade mobile: `min-w-0 overflow-x-hidden`, `flex-wrap`, Radix scroll-area override.

## Status atual
- ✅ Migração concluída, backend + frontend RUNNING.
- ✅ Supabase conectado (6821 OSs, project ref correto).
- ✅ Admin login OK, Invisacook login OK.
- ✅ Playwright Chromium instalado em `/root/.cache/ms-playwright`.

## Backlog / Próximos passos (para o dono do projeto testar manualmente)
Conforme instruído no problem statement, **NÃO foi chamado testing agent**. O checklist final (seção 6) precisa ser validado manualmente pelo dono:
- Dashboard mostra ~6800 OSs ✅ (confirmado via API)
- Botão "Sincronizar" traz OSs HQ em <1 min (validar manualmente)
- Cadastrar produto gera PROD-XXXXXXXX (validar manualmente)
- Páginas públicas `/p/<code>` e `/os-view/<os_number>` sem login (validar manualmente)
- Impressão de OS e Produto gera QR (validar manualmente)
- LaudoModal salva rascunho (agora persiste em Supabase, sobrevive migrações)
- DOCX Hisense / Recall / Mastermaq (validar)
- Import de planilha .xlsx/.csv (validar)
- Busca mobile Android (validar)
- Login Invisacook mostra sidebar branca, logo INVISACOOK, header `#F7F5F2`, menu só com "Ordens de Serviço", sem chips/badges (validar)
- OSs marcadas como prioridade e usuários adicionais (exceto admin master e Invisacook recém-criado) precisam ser recadastrados manualmente (Mongo local vem vazio a cada migração).
