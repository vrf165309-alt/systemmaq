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

## Sessão 30/08/2026 (parte 2) — Link de assinatura remota via WhatsApp

### 9. Link de assinatura pelo celular do cliente
Cenário: o técnico está no cliente, mas o cliente não está presente (ou o técnico terminou o serviço e voltou para a loja). Antes só havia opção do cliente assinar no aparelho do técnico. Agora é possível gerar um link único que o cliente abre no próprio celular e assina.

**Backend (`server.py`)**:
- Nova collection MongoDB `signature_links` (sidecar): `{token, os_number, technician_signature, technician_name, client_name_hint, client_cpf_hint, status, created_at, expires_at, used_at}`.
- `POST /api/service-orders/{os}/signature-link` (auth): gera `uuid4` como token, salva a assinatura do técnico + metadados, monta URL absoluta usando o `Origin`/`Referer` da chamada, monta mensagem WhatsApp pronta com `wa.me/55{phone}?text=...`. TTL 7 dias.
- `GET /api/public/sign/{token}` (público): retorna só dados essenciais da OS (número, cliente, produto, defeito, técnico, status) — SEM telefone/endereço/valores. Valida expiração, status `used` e se a OS já foi assinada por outro caminho.
- `POST /api/public/sign/{token}/submit` (público): aceita `signature_client` + `client_cpf` opcional. Persiste na OS reusando o mesmo pipeline de `sign_service_order` (Assinafy PDF em background). Marca token como `used` — single-use.

**Frontend**:
- Nova rota pública `/sign/:token` em `App.js` renderiza `PublicSignPage.js`. Visual clean, mobile-first: 
  - Header com badge "Link seguro" (verde)
  - Card "Confira os dados" com dados da OS em grid 2 colunas
  - Card "Sua assinatura" com canvas retina-aware (DPR)+ campo CPF opcional
  - Botão "Confirmar Assinatura" dark (slate-900) — grande, tap-friendly
  - Estados: loading (spinner), erro (link expirado/usado), sucesso (ícone de escudo verde + "Assinatura registrada")
- `SignatureModal.js`: no Step 3, além do canvas de assinatura, agora há um card `"Cliente não está presente? [Enviar link]"` (accent verde). Ao clicar:
  1. Chama o endpoint de criação
  2. Reconstrói a URL sempre com `window.location.origin` (evita cluster-hostname interno)
  3. Substitui a URL na mensagem do wa.me
  4. Abre `wa.me` em nova aba
  5. Mostra card verde "Link enviado" com URL + botão "Copiar" + botão "Fechar (aguardando cliente assinar)"

## Sessão 30/08/2026 (parte 3) — Fix urgente: HTTP 520 em produção após deploy

## Sessão 31/08/2026 — Fixes: link duplicado + fluxo cliente-primeiro

### 11. Bug: mensagem WhatsApp com URL duplicada (`https://.../https://.../sign/...`)
- **Causa**: no `SignatureModal.js`, o `handleSendLink` fazia 2 regex sucessivos sobre a mensagem retornada pelo backend. O 1º substituía uma URL absoluta correta pela mesma URL absoluta. O 2º substituía o path `/sign/<token>` (que ainda existia no resultado) pela URL ABSOLUTA — criando concatenação `https://mastermaq-system.onlinehttps://mastermaq-system.online/sign/...`.
- **Fix**: reconstruir a mensagem inteira do zero no frontend usando `window.location.origin + token + order.customer_name + order.product + order.phone1`. Backend continua devolvendo `url` e `whatsapp_url`, mas o frontend agora IGNORA e monta do zero — comportamento 100% previsível.

### 12. Feature: fluxo "cliente assina primeiro, técnico completa depois"
Antes: `technician_signature` era OBRIGATÓRIO no `POST /signature-link` — o técnico precisava assinar ANTES de enviar o link. Depois do fix:

**Backend (`server.py`)**:
- `SignatureLinkCreate.technician_signature: Optional[str]` — aceita `null`.
- `POST /public/sign/{token}/submit`: quando o link NÃO tinha `technician_signature`, persiste SOMENTE `signature_client` + CPF na OS. Retorna `fully_signed: false`. Assinafy NÃO é disparado.
- `POST /service-orders/{os}/sign`: `signature_technician` e `signature_client` viraram opcionais. Só bloqueia (400) se as duas JÁ existem. Faz update parcial — pode receber só a parte do técnico e mesclar com o cliente já salvo. Assinafy dispara automaticamente quando as duas ficam presentes.
- `GET /service-orders/{os}/signatures` agora retorna também `signature_client_name`, `signature_client_cpf`, `signature_tech_name`.

**Frontend (`SignatureModal.js`)**:
- Novo `useEffect` no `open` que faz `GET /signatures` e detecta o estado parcial (`existingClientSig` / `existingTechSig`).
- Novo modo **"completion"** — quando a OS tem só `signature_client`, o modal renderiza uma UI compacta:
  * Header: "Completar Assinatura — OS #####"
  * Card verde "Cliente já assinou" com **CPF exibido** e preview da assinatura
  * Input "Técnico *" (nome)
  * Canvas OU pill "Assinatura salva encontrada" (se `localStorage` tem sig do técnico) + "Refazer"
  * Botão "Confirmar" que chama `/sign` com só a parte do técnico → OS fica totalmente assinada
- Novo botão **"Enviar link para o cliente"** no Step 1 — permite enviar sem que o técnico assine antes (fluxo cliente-primeiro). Habilitado só quando o nome do cliente está preenchido.
- Preserva fluxo tradicional: se o técnico assina primeiro em Step 2 e envia o link em Step 3, o link carrega a assinatura do técnico e o submit do cliente já finaliza a OS.

**Testado end-to-end**:
- Link SEM tech sig → cliente submit → `fully_signed=false` → só client no /signatures
- Reabrir modal → completion mode com CPF e preview corretos
- `/sign` com só tech → OS completa (ambas assinaturas presentes) → 400 no re-submit
- Assinafy dispara só quando ambas ficam presentes
- **Sintoma**: após deploy, `POST /api/auth/login` em `mastermaq-system.online` retornava HTTP 520 imediato. Usuários não conseguiam logar.
- **RCA (deployer agent)**: backend saudável e ready no cluster, ZERO POST de login chegava ao uvicorn. Causa: loop de auto-sync Hisense lançava Playwright/chromium a cada 30 min → OOM-kill sob o tier_0 de 512Mi → conexões TCP recusadas/resetadas → Cloudflare devolvia 520 antes do request chegar no origin. `consecutive_failures: 367` no scraper Hisense com erros `spawn ETXTBSY` e `Executable doesn't exist`.
- **Fix aplicado em `server.py`**:
  * `startup_auto_sync()` agora respeita ENV `HISENSE_AUTO_SYNC_ENABLED` (default: `false`). Loop e watchdog só sobem se `=true`.
  * Quando desabilitado, o status Hisense é resetado para `"manual"` (novo estado — não dispara `down`/`warning` no `/api/scrapers/health`) e `consecutive_failures=0`. Badge do dashboard fica limpo.
  * `_load_health_from_db()` agora roda `await` (não `create_task`) ANTES do reset, para não sobrescrever depois.
  * Botão "Sincronizar" no painel continua funcionando (dispara `POST /api/telecontrol/sync` isolado, sem loop).
- **Testado local**: login `HTTP 200 in 0.459s`, health `overall: ok`, Hisense `status: manual`, HQ continua rodando normal.
- **Ação pendente do usuário**: redeploy para propagar o fix a produção. Após redeploy, se ainda quiser rodar auto-sync em preview, definir `HISENSE_AUTO_SYNC_ENABLED=true` em `backend/.env`.

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
