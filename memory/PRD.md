# PRD — Mastermaq / Maq-Sync-Hub

## Sessão atual (20-31/07/2026)

### 1. Migração do repositório (20/07)
- Repo `fernandodo2027-rgb/maq-sync-hub` clonado sobre /app
- Backend + frontend deps instaladas; Playwright Chromium em `/root/.cache/ms-playwright`
- Todas as 28 chaves de `backend/.env` presentes; `REACT_APP_BACKEND_URL` corrigido
- Usuário Invisacook recriado (Mongo local reseta a cada migração)
- Todas as 13 políticas de otimização de saída Supabase auditadas e íntegras
- OS `INV-00001` (teste) removida; `invisacook_seq` zerado

### 2. Bug "Dados para Laudo apagam de um dia pro outro" (20/07)
- **Photo PUT aditivo** (`LaudoModal.js runLaudoSave` + `saveDraft`): só envia `photo_i` se `images[i]` não for vazio
- **Autosave gated por flags reais** (`draftFetched && photosFetched`): substitui `setTimeout(300)`
- **Server-side photo guard** (`PUT /service-orders/{n}`): recusa `photo_i=""` se existe foto no banco, exceto com `clear_photos:[i]` explícito

### 3. Bug "somente 1ª imagem em todas" no laudo DOCX (21-31/07)
- **Hisense** (`laudo_generator.py`): user confirmou que Hisense está OK — apenas fotos órfãs do template. Não mexer no PHOTO_SLOTS.
- **Mastermaq** (`laudo_mastermaq_generator.py`): reescrito para 4 slots distintos
  - Antes: 1 foto (índice 7) copiada em image1/2/3 → todos os slots iguais
  - Depois: patch dinâmico do XML — 2ª ocorrência de `rId7` vira `rId200` + novo relationship + arquivo `image_foto2.jpeg`
  - Mapping: modal FOTO 1 → template FOTO 1 (esq); modal FOTO 2 → template FOTO 2 (dir); modal FOTO 7 → template FOTO 3 (Defeito); modal FOTO 4 → template FOTO 4 (Elétrica)
  - Validado visualmente com 4 cores distintas

### 4. Scraper Telecontrol blindado (31/07)
Bug raiz: 3 falhas em cascata que se escondiam mutuamente:
- `login()` retornava True se URL não continha "erro"
- `except Exception: break` na paginação silenciava tudo
- `success=True` no final independente de falhas parciais

Correções aplicadas:
- `login()`: valida URL de página logada + chama JS `login()` direto + captura `#msgErro` + retry 2×
- Paginação: retry 3× com backoff, `networkidle` 15→30s, `raise` em erro real
- `sync_orders`: retry login+fetch 2× cada, campo `degraded`, success só se ambos OK
- `_run_sync_with_health`: detecção de volume anômalo (<20% da média das últimas 5 execuções)
- Watchdog interno (`_scraper_watchdog`): task async no boot, marca `down` se sync > 3× interval
- `/api/scrapers/health` retorna `overall_message` ("Scraper Hisense falhou")
- Badge no `DashboardLayout` mostra mensagem específica

**Bug real exposto**: credenciais Hisense do `.env` (`19955560000128`/`Thami2007`) foram rejeitadas pelo Telecontrol com "Login ou senha inválidos". User precisa atualizar `TELECONTROL_PASSWORD` e rodar `POST /api/scrapers/hisense/resync?days=60` pra recuperar as 4 OSs perdidas.

### 5. Bug "fotos apagam ao reabrir OS" (31/07)
Achado no `useEffect` merge-only sync do `ServiceOrdersPage.js` (linha 1755):
```diff
- if (k.startsWith('photo_')) continue;
```
O guard `isPrevEmpty` já protege contra sobrescrever fotos em upload local. O `continue` bloqueava o merge legítimo quando handleOrderClick abria o modal com snapshot da lista (sem fotos) e o GET `?include_photos=1` chegava depois em paralelo. Removida a linha — fotos agora são hidratadas normalmente.

## Backlog
- Canal externo de alerta SMS para scraper (item 3.2 do plano do scraper)
- Simulação de queda de rede via mock
- README de manutenção do scraper
- Documentação de referência

## Sessão 30/08/2026 — 3 fixes de UX

### 6. Aba "OSs Atrasadas" não renderizava (ServiceOrdersPage.js:1196)
- Havia um comentário TODO `{/* ↓↓↓ COLE AQUI o bloco <TabsContent value="overdue"> ↓↓↓ */}` no lugar do TabsContent — nunca foi implementado.
- Backend `/api/service-orders/overdue-at` já retornava 93 OSs (validado com curl). Só faltava o container do lado do React.
- Fix: implementado TabsContent com cards (visual vermelho), filtros por status (Aguardando Análise A.T / Peças / Conserto), busca, badge de dias, link WhatsApp e navegação clicando no card (`handleOrderClick` — mesmo fluxo do Histórico).

### 7. Campainha tocando ao mudar de página (DashboardLayout.js:200)
- DashboardLayout é usado por cada página individual → desmonta a cada rota → `seenAlertIdsRef` (useRef) resetava a Set vazia → primeiro `poll()` interpretava TODOS os alertas como "novos" → `audioRef.current.play()`.
- Fix: adicionado `alertsFirstPollRef` que sinaliza o primeiro poll após montar. O áudio só toca se houver item novo E não for o primeiro poll. Os IDs continuam sendo populados no ref.
- Pattern espelha o segundo useEffect (linha 227) que já usava `lastExtCountRef.current !== null` pra mesma proteção.

### 8. Adesivo personalizado imprimindo torto / vários por impressão (LabelTemplatesPage.js + printingService.js)
- CSS antigo: `@page { size: 50mm 30mm; margin: 0 }` sem `landscape`, sem `page-break-after`, sem margem para o liner de 4mm da bobina 58mm.
- Consequência: impressora térmica alinhava conteúdo em pé, fora da margem, e cuspia várias etiquetas em branco antes de sair uma correta.
- Fix: criada função `printCustomLabel(pngDataUrl, { sizeKey, customContent, name })` em `printingService.js` que replica EXATAMENTE a geometria de `printOSLabel`/`printProductLabel`:
  * paper = 58×30mm (com 4mm de liner) para preset `50×30`
  * `landscape` explícito
  * `page-break-after: always` + `break-inside: avoid`
  * screen preview 3× antes de imprimir + botão explícito (não auto-print)
- `LabelTemplatesPage.print()` agora mapeia size preset → sizeKey e delega para `printCustomLabel`. Presets 80×50 e 100×50 sem liner (paper = content). Tamanhos custom = paper próprio.

## P0 investigado (não era bug de agendamento)
- Scheduler dos scrapers (`hisense_loop` + `_scraper_watchdog`) confirmado rodando após restart do supervisor. Log mostra 74 ciclos executados, sync ativo a cada 30 min.
- Últimos ciclos retornam `0 new, 0 updated` porque o auto-sync usa janela de 30 dias corridos (`datetime.now() - 30 days`), enquanto o `run_sync_manual.py` do usuário aponta para datas fixas do passado. Diferença é temporal, não de código.

## Stack
- Frontend: React 19 (CRA + Craco), Tailwind, Shadcn/UI, lucide-react, axios, react-router 6
- Backend: Python 3.11 + FastAPI + uvicorn (Supervisor porta 8001)
- DB primário: Supabase (PostgreSQL via PostgREST)
- DB secundário: MongoDB local
- Scraping: Playwright + Chromium
- Auth: JWT customizado (roles: admin, technician, invisacook)

## Ambientes
- Preview (dev): `https://2c89069e-d05b-494c-a8d1-ed71aa3f7761.preview.emergentagent.com`
- Produção: `https://mastermaq-system.online` (deploy manual pelo user quando OK)
