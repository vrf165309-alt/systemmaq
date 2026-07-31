import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional
from playwright.async_api import async_playwright, Browser, Page
import os
import re

logger = logging.getLogger(__name__)

TELECONTROL_BASE_URL = os.environ.get('TELECONTROL_BASE_URL', 'https://posvenda.telecontrol.com.br')
TELECONTROL_LOGIN = os.environ.get('TELECONTROL_LOGIN', '')
TELECONTROL_PASSWORD = os.environ.get('TELECONTROL_PASSWORD', '')
TELECONTROL_LOGIN_HQ = os.environ.get('TELECONTROL_LOGIN_HQ', '')
TELECONTROL_PASSWORD_HQ = os.environ.get('TELECONTROL_PASSWORD_HQ', '')

# Known brands to extract from product description
KNOWN_BRANDS = ['HQ', 'Hisense', 'Gorenje', 'Bertazzoni', 'Lofra', 'Franke', 'Consul', 'Brastemp', 'Electrolux', 'Samsung', 'LG', 'Bosch', 'Midea', 'Philco', 'Panasonic', 'Viking', 'Liebherr', 'Tecno', 'Belmicro']

# Status colors mapping from Telecontrol
STATUS_COLOR_MAP = {
    "#FAFF73": "Aguardando Peças",
    "#FEF3C7": "Aguardando Peças",
    "rgb(250, 255, 115)": "Aguardando Peças",
    "rgb(254, 243, 199)": "Aguardando Peças",
    "#EF5CFF": "Aguardando Conserto",
    "rgb(239, 92, 255)": "Aguardando Conserto",
    "#9E8FFF": "Aguardando Retirada",
    "rgb(158, 143, 255)": "Aguardando Retirada",
    "#8DFF70": "Finalizada",
    "rgb(141, 255, 112)": "Finalizada",
    "#D1FAE5": "Finalizada",
    "rgb(209, 250, 229)": "Finalizada",
    "#0731ed": "Aguard. Abastecimento Estoque",
    "rgb(7, 49, 237)": "Aguard. Abastecimento Estoque",
    "#A6ACAF": "Em transito",
    "rgb(166, 172, 175)": "Em transito",
    "#f10f0f": "Em auditoria",
    "rgb(241, 15, 15)": "Em auditoria",
    "#FF8282": "Aguardando Analise A.T",
    "rgb(255, 130, 130)": "Aguardando Analise A.T",
    "#D6D6D6": "Aberta Call-Center",
    "rgb(214, 214, 214)": "Aberta Call-Center",
    "#4DFFFF": "Aguardando Confirmação Cliente",
    "rgb(77, 255, 255)": "Aguardando Confirmação Cliente",
    "#FF9933": "Aguardando Produto",
    "rgb(255, 153, 51)": "Aguardando Produto",
    "#7d0000": "OS Cancelada",
    "rgb(125, 0, 0)": "OS Cancelada",
}


def extract_brand_from_description(description: str) -> str:
    """Extract brand name from product description"""
    if not description:
        return ""
    description_upper = description.upper()
    for brand in KNOWN_BRANDS:
        if brand.upper() in description_upper:
            return brand
    return ""


class TelecontrolScraper:
    def __init__(self, login='', password='', source_label='telecontrol'):
        self.browser: Optional[Browser] = None
        self.playwright = None
        self.logged_in = False
        self.login_user = login
        self.login_pass = password
        self.source_label = source_label
        self._sync_lock = asyncio.Lock()
        # Captured from the login page's #msgErro when auth fails — surfaced
        # in sync_orders errors so the health badge shows the real reason
        # (e.g. "Login ou senha inválidos") instead of a generic message.
        self.last_login_error: Optional[str] = None
        
    async def start_browser(self):
        """Initialize browser instance"""
        try:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions',
                    '--no-zygote',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-background-networking',
                ]
            )
            logger.info(f"[{self.source_label}] Browser started successfully")
        except Exception as e:
            logger.error(f"[{self.source_label}] Failed to start browser: {str(e)}")
            raise
        
    async def close_browser(self):
        """Close browser instance safely"""
        try:
            if self.browser:
                try:
                    await self.browser.close()
                except Exception:
                    pass
                self.browser = None
            if self.playwright:
                try:
                    await self.playwright.stop()
                except Exception:
                    pass
                self.playwright = None
            self.logged_in = False
        except Exception as e:
            logger.error(f"[{self.source_label}] Error closing browser: {str(e)}")
            self.browser = None
            self.playwright = None
            self.logged_in = False
    
    async def login(self, page: Page) -> bool:
        """Login to Telecontrol"""
        try:
            logger.info(f"Navigating to Telecontrol login page...")
            await page.goto(f"{TELECONTROL_BASE_URL}/assist/index.php", wait_until='domcontentloaded', timeout=60000)
            await page.wait_for_timeout(3000)
            
            # Check if already logged in (redirected to main page)
            current_url = page.url
            logger.info(f"Current URL: {current_url}")
            
            if "consulta_lite_new.php" in current_url or "menu_inicial" in current_url:
                self.logged_in = True
                logger.info("Already logged in")
                return True
            
            # Wait for page to be ready
            await page.wait_for_load_state('networkidle', timeout=30000)
            
            # Try different selectors for login form
            login_selectors = [
                'input[name="login"]',
                'input[name="usuario"]',
                'input[name="user"]',
                '#usuario',
                '#login'
            ]
            
            password_selectors = [
                'input[name="senha"]',
                'input[name="password"]',
                'input[type="password"]',
                '#senha',
                '#password'
            ]
            
            submit_selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Entrar")',
                'button:has-text("Login")',
            ]
            
            # Try to find and fill login field
            login_filled = False
            for selector in login_selectors:
                try:
                    if await page.locator(selector).count() > 0:
                        await page.fill(selector, self.login_user, timeout=5000)
                        login_filled = True
                        logger.info(f"Filled login using selector: {selector}")
                        break
                except Exception:
                    continue
            
            if not login_filled:
                logger.error("Could not find login field")
                return False
            
            # Try to find and fill password field
            password_filled = False
            for selector in password_selectors:
                try:
                    if await page.locator(selector).count() > 0:
                        await page.fill(selector, self.login_pass, timeout=5000)
                        password_filled = True
                        logger.info(f"Filled password using selector: {selector}")
                        break
                except Exception:
                    continue
            
            if not password_filled:
                logger.error("Could not find password field")
                return False
            
            # Try to click submit button. Telecontrol's form uses
            # `action="javascript: login();"` — so the actual submit is the
            # JS `login()` function. We try to invoke it directly first;
            # falling back to a real click / Enter press if that doesn't
            # work (which handles older / different login pages).
            submitted = False
            try:
                await page.evaluate('typeof login === "function" && login()')
                submitted = True
                logger.info("Invoked Telecontrol login() JS function")
            except Exception as e:
                logger.debug(f"Could not invoke login() JS: {e}")
            if not submitted:
                for selector in submit_selectors:
                    try:
                        if await page.locator(selector).count() > 0:
                            await page.click(selector, timeout=5000)
                            submitted = True
                            logger.info(f"Clicked submit using selector: {selector}")
                            break
                    except Exception:
                        continue
            if not submitted:
                await page.keyboard.press('Enter')
                logger.info("Pressed Enter to submit")

            # Give the JS `login()` AJAX call a bit of time to populate the
            # #msgErro element OR to redirect. We first wait a short beat
            # for the AJAX submit, THEN wait for either a URL change (means
            # login worked) or an error message to appear (means it didn't).
            await page.wait_for_timeout(3000)
            try:
                await page.wait_for_function(
                    """() => {
                        const url = window.location.href;
                        const msg = document.getElementById('msgErro');
                        return !url.includes('login_posvenda_new')
                            || (msg && msg.innerText && msg.innerText.trim().length > 0);
                    }""",
                    timeout=8000,
                )
            except Exception:
                # No signal either way — fall through to the URL check below
                pass
            try:
                await page.wait_for_load_state('networkidle', timeout=15000)
            except Exception:
                pass

            # Check if login was successful.
            #
            # OLD (buggy): declared success as long as "erro" wasn't in the
            # URL. That let redirects back to `login_posvenda_new.php` count
            # as "logged in", so fetch_orders_list would then try to fill
            # date fields on the login page and blow up cryptically. Root
            # cause of the 28/07 silent-truncation incident together with
            # the pagination bug.
            #
            # NEW: require the URL to look like a logged-in page AND make
            # sure it doesn't still say "login" somewhere. Also grab the
            # exact `#msgErro` text from the page when we fail — this ends
            # up surfaced in the health badge so the operator sees
            # "Login ou senha inválidos" instead of a generic error.
            current_url = page.url
            url_l = current_url.lower()
            logged_in_hint = (
                "consulta_lite_new.php" in url_l
                or "menu_inicial" in url_l
                or "assist/main" in url_l
            )
            still_on_login = "login" in url_l or url_l.endswith("index.php")
            if logged_in_hint and not still_on_login:
                self.logged_in = True
                logger.info(f"Login successful, current URL: {current_url}")
                return True

            # Failed. Capture the exact error message the site is showing.
            site_msg = ""
            try:
                site_msg = await page.evaluate(
                    'document.getElementById("msgErro")?.innerText || ""'
                )
                site_msg = (site_msg or "").strip()
            except Exception:
                pass
            try:
                title = await page.title()
            except Exception:
                title = "?"
            # Telecontrol's server-side response after a failed submit
            # redirects to /assist/login.php? — that's a strong signal the
            # credentials were rejected (as opposed to network problems,
            # which would time out before this point).
            if not site_msg and current_url.rstrip("/?").endswith("login.php"):
                site_msg = "Login ou senha inválidos (Telecontrol rejeitou as credenciais)"
            reason = site_msg or f"login page reached (title={title!r}) — session not established"
            logger.error(
                f"Login failed — url={current_url} reason={reason!r} "
                f"user={self.login_user!r}"
            )
            # Store on instance so sync_orders can surface a clean message
            # instead of the whole stacktrace-y string.
            self.last_login_error = reason
            return False
                
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False
    
    async def fetch_orders_list(self, page: Page, start_date: str, end_date: str) -> List[Dict]:
        """Fetch list of orders from consulta_lite_new.php with pagination support.
        Resilient to selector changes: tries multiple selectors with logging.
        """
        orders = []
        
        try:
            # Navigate to search page
            logger.info("Navigating to search page...")
            await page.goto(f"{TELECONTROL_BASE_URL}/assist/consulta_lite_new.php", wait_until='domcontentloaded', timeout=60000)
            await page.wait_for_timeout(3000)
            await page.wait_for_load_state('networkidle', timeout=30000)
            
            # Fill date filters with multiple selector fallbacks (resilient to HTML changes)
            logger.info(f"Setting date range: {start_date} to {end_date}")
            
            date_start_selectors = ['#data_inicial', 'input[name="data_inicial"]', 'input[name="dataInicial"]', 'input[name="data_inicio"]', 'input[id*="dataInicial"]', 'input[placeholder*="Inicial" i]']
            date_end_selectors = ['#data_final', 'input[name="data_final"]', 'input[name="dataFinal"]', 'input[name="data_fim"]', 'input[id*="dataFinal"]', 'input[placeholder*="Final" i]']

            async def _fill_with_fallback(selectors, value, field_name):
                """Try each selector until one works. Returns True on success."""
                for sel in selectors:
                    try:
                        loc = page.locator(sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            await loc.fill('', timeout=5000)
                            await loc.fill(value, timeout=5000)
                            logger.info(f"Filled {field_name} via selector '{sel}'")
                            return True
                    except Exception as inner:
                        logger.debug(f"Selector '{sel}' failed for {field_name}: {inner}")
                        continue
                logger.error(f"Could not fill {field_name} with any selector")
                return False

            ok1 = await _fill_with_fallback(date_start_selectors, start_date, "data_inicial")
            ok2 = await _fill_with_fallback(date_end_selectors, end_date, "data_final")

            if not (ok1 and ok2):
                # Save screenshot + HTML for diagnostic — visible to operations
                try:
                    debug_dir = "/tmp/scraper_debug"
                    os.makedirs(debug_dir, exist_ok=True)
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    await page.screenshot(path=f"{debug_dir}/fetch_orders_fail_{self.source_label}_{ts}.png", full_page=True)
                    html = await page.content()
                    with open(f"{debug_dir}/fetch_orders_fail_{self.source_label}_{ts}.html", "w", encoding="utf-8") as f:
                        f.write(html)
                    logger.error(f"Selector failure debug saved to {debug_dir}/fetch_orders_fail_{self.source_label}_{ts}.*")
                except Exception as dbg:
                    logger.warning(f"Failed to save scraper debug artifacts: {dbg}")
                raise RuntimeError(f"Scraper {self.source_label}: date selectors broke. URL: {page.url}")

            # Try to set results per page to maximum before searching
            try:
                select_el = page.locator('select[name="tabelas_length"], select[name="DataTables_Table_0_length"]')
                if await select_el.count() > 0:
                    await select_el.select_option(value="100")
                    logger.info("Set results per page to 100")
                    await page.wait_for_timeout(1000)
            except Exception as e:
                logger.debug(f"Could not set page length: {e}")
            
            # Click search button - use form-specific button
            logger.info("Clicking search button...")
            try:
                # Try clicking the button within the main form
                await page.click('#formulario_pesquisa button.btn', timeout=10000)
            except Exception:
                try:
                    # Fallback: click the first visible Pesquisar button
                    buttons = await page.locator('button.btn').all()
                    for btn in buttons:
                        text = await btn.inner_text()
                        if "Pesquisar" in text and "Pré-OS" not in text:
                            if await btn.is_visible():
                                await btn.click()
                                logger.info("Clicked Pesquisar button")
                                break
                except Exception as e:
                    logger.error(f"Error clicking search button: {e}")
            
            await page.wait_for_timeout(8000)
            await page.wait_for_load_state('networkidle', timeout=60000)

            # Try to set results per page to maximum after search too (some tables reinitialize)
            try:
                select_el = page.locator('select[name="tabelas_length"], select[name="DataTables_Table_0_length"]')
                if await select_el.count() > 0:
                    options = await select_el.locator('option').all()
                    max_val = "100"
                    for opt in options:
                        val = await opt.get_attribute('value')
                        if val and (val == "-1" or val == "All"):
                            max_val = val
                            break
                        try:
                            if int(val) > int(max_val):
                                max_val = val
                        except Exception:
                            pass
                    await select_el.select_option(value=max_val)
                    logger.info(f"Set results per page to {max_val}")
                    await page.wait_for_timeout(5000)
                    await page.wait_for_load_state('networkidle', timeout=30000)
            except Exception as e:
                logger.debug(f"Could not set page length after search: {e}")
            
            # Wait for table to load
            try:
                await page.wait_for_selector('#tabelas tbody tr', timeout=30000)
            except Exception:
                logger.info("No results found or table not loaded")
                return orders

            # Paginate through all results.
            #
            # HARDENED PAGINATION (28/07/2026 incident):
            # - The previous version caught any exception on the "next page"
            #   click and treated it as "end of results", silently truncating
            #   the sync. Any network hiccup would produce a partial sync
            #   that persisted success=True in the DB. Root cause of the
            #   incident where 4 Hisense OSs went missing.
            # - Now: transient errors (timeouts, missing selectors) are
            #   retried up to 3x with backoff; only permanent failure raises
            #   so the caller can mark the sync as failed instead of
            #   pretending it finished.
            page_num = 1
            while True:
                logger.info(f"Scraping page {page_num}...")

                page_orders = await self._extract_orders_from_page(page)
                if page_orders:
                    orders.extend(page_orders)
                    logger.info(f"Page {page_num}: extracted {len(page_orders)} orders (total: {len(orders)})")

                # Attempt to advance to next page. Retry up to 3x with
                # exponential backoff on transient Playwright/network errors
                # before declaring the pagination truly finished.
                advanced = False
                page_ended = False
                last_error = None
                for attempt in range(1, 4):  # 3 tries total
                    try:
                        next_btn = page.locator(
                            '#tabelas_next:not(.disabled), .paginate_button.next:not(.disabled)'
                        )
                        if await next_btn.count() > 0 and await next_btn.is_enabled():
                            await next_btn.click()
                            await page.wait_for_timeout(3000)
                            # 30s instead of 15s — Telecontrol can be slow
                            # under load without being broken.
                            await page.wait_for_load_state('networkidle', timeout=30000)
                            # Confirm the new page has rendered before we
                            # extract from it — otherwise _extract_orders_from_page
                            # could pull the previous page again.
                            await page.wait_for_selector('#tabelas tbody tr', timeout=30000)
                            page_num += 1
                            advanced = True
                            break
                        else:
                            # Real "no next page" (the button is disabled
                            # because we're on the last page). This is the
                            # ONLY legitimate exit — not any exception.
                            logger.info("No more pages (next button disabled)")
                            page_ended = True
                            break
                    except Exception as e:  # noqa: BLE001 - narrow retry loop
                        last_error = e
                        backoff = 2 * attempt  # 2s, 4s, 6s
                        logger.warning(
                            f"[{self.source_label}] Pagination attempt {attempt}/3 "
                            f"on page {page_num}->page {page_num + 1} failed: {e}. "
                            f"Retrying in {backoff}s..."
                        )
                        await page.wait_for_timeout(backoff * 1000)

                if page_ended:
                    break
                if not advanced:
                    # All 3 retries exhausted — this is a REAL failure. Do
                    # NOT silently succeed with partial data — raise so the
                    # sync gets flagged as failed and someone gets alerted.
                    raise RuntimeError(
                        f"Pagination failed on page {page_num} after 3 retries "
                        f"(collected {len(orders)} orders so far). "
                        f"Last error: {last_error}"
                    )

                # Safety limit
                if page_num > 50:
                    logger.warning("Reached max page limit (50)")
                    break

            if orders:
                for order in orders:
                    order['brand'] = extract_brand_from_description(order.get('product', ''))

            logger.info(f"Successfully extracted {len(orders)} orders from Telecontrol ({page_num} pages)")
            return orders

        except Exception as e:
            # Bubble the exception up to sync_orders so it flips success=False
            # and shows in result["errors"]. The previous "return orders" swallowed
            # the failure and made partial syncs look successful (the 28/07 bug).
            logger.error(f"Error fetching orders list: {e}")
            raise

    async def _extract_orders_from_page(self, page: Page) -> List[Dict]:
        """Extract orders from current page of results table"""
        source_label = self.source_label
        return await page.evaluate('''(sourceLabel) => {
                const orders = [];
                const rows = document.querySelectorAll('#tabelas tbody tr');
                
                // Status color mapping - from the colored box inside the OS number cell
                // The color indicator is in: <div class="box-legendas-os box-sm-os" style="background-color:COLOR">
                const statusColorMap = {
                    "#FAFF73": "Aguardando Peças",
                    "#faff73": "Aguardando Peças",
                    "rgb(250, 255, 115)": "Aguardando Peças",
                    
                    "#EF5CFF": "Aguardando Conserto",
                    "#ef5cff": "Aguardando Conserto",
                    "rgb(239, 92, 255)": "Aguardando Conserto",
                    
                    "#9E8FFF": "Aguardando Retirada",
                    "#9e8fff": "Aguardando Retirada",
                    "rgb(158, 143, 255)": "Aguardando Retirada",
                    
                    "#8DFF70": "Finalizada",
                    "#8dff70": "Finalizada",
                    "rgb(141, 255, 112)": "Finalizada",
                    
                    "#0731ed": "Aguard. Abastecimento Estoque",
                    "rgb(7, 49, 237)": "Aguard. Abastecimento Estoque",
                    
                    "#A6ACAF": "Em transito",
                    "#a6acaf": "Em transito",
                    "rgb(166, 172, 175)": "Em transito",
                    
                    "#f10f0f": "Em auditoria",
                    "rgb(241, 15, 15)": "Em auditoria",
                    
                    "#FF8282": "Aguardando Analise A.T",
                    "#ff8282": "Aguardando Analise A.T",
                    "rgb(255, 130, 130)": "Aguardando Analise A.T",
                    
                    "#D6D6D6": "Aberta Call-Center",
                    "#d6d6d6": "Aberta Call-Center",
                    "rgb(214, 214, 214)": "Aberta Call-Center",
                    
                    "#4DFFFF": "Aguardando Confirmação Cliente",
                    "#4dffff": "Aguardando Confirmação Cliente",
                    "rgb(77, 255, 255)": "Aguardando Confirmação Cliente",
                    
                    "#FF9933": "Aguardando Produto",
                    "#ff9933": "Aguardando Produto",
                    "rgb(255, 153, 51)": "Aguardando Produto",
                    
                    "#7d0000": "OS Cancelada",
                    "#7D0000": "OS Cancelada",
                    "rgb(125, 0, 0)": "OS Cancelada",
                    // Additional dark-red variants observed for Cancelada
                    "#8B0000": "OS Cancelada",
                    "#8b0000": "OS Cancelada",
                    "rgb(139, 0, 0)": "OS Cancelada",
                    "#B00000": "OS Cancelada",
                    "#b00000": "OS Cancelada",
                };
                
                rows.forEach((row, idx) => {
                    try {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 14) return;
                        
                        // Get OS number from column 1
                        const osLink = cells[1]?.querySelector('a');
                        const osNumber = osLink ? osLink.innerText.trim() : cells[1]?.innerText?.trim() || '';
                        if (!osNumber || !/^\\d+$/.test(osNumber)) return;
                        
                        // STATUS: Read from the colored box div inside the OS number cell (column 1)
                        // The status indicator is: <div class="box-legendas-os box-sm-os" style="background-color:COLOR">
                        let status = '';
                        const statusBox = cells[1]?.querySelector('.box-legendas-os');
                        if (statusBox) {
                            // Try reading inline style first (browser normalizes to rgb format)
                            let boxColor = statusBox.style.backgroundColor || '';
                            
                            // If inline style empty, try getAttribute for raw style
                            if (!boxColor) {
                                const styleAttr = statusBox.getAttribute('style') || '';
                                const colorMatch = styleAttr.match(/background-color:\\s*([^;]+)/i);
                                if (colorMatch) {
                                    boxColor = colorMatch[1].trim();
                                }
                            }
                            
                            // Try computed style as last resort
                            if (!boxColor || boxColor === 'rgba(0, 0, 0, 0)' || boxColor === 'transparent') {
                                boxColor = window.getComputedStyle(statusBox).backgroundColor;
                            }
                            
                            // Match color to status
                            status = statusColorMap[boxColor] || statusColorMap[boxColor.toLowerCase()] || '';
                            
                            // If still no match, try computed style
                            if (!status) {
                                const computed = window.getComputedStyle(statusBox).backgroundColor;
                                status = statusColorMap[computed] || '';
                            }
                        }
                        
                        // Situação column (13) - follow-up text (NOT the status, but useful info)
                        const situacao = cells[13]?.innerText?.trim() || '';
                        
                        // Diagnostic: if we could not map the color, expose it
                        // so the backend can log which colors we're missing.
                        const rawBoxColor = statusBox ? (
                            statusBox.style.backgroundColor ||
                            (statusBox.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1] ||
                            window.getComputedStyle(statusBox).backgroundColor || ''
                        ) : '';
                        
                        // Get type of service (Tipo de Atendimento) from column 8
                        const serviceType = cells[8]?.innerText?.trim() || '';
                        
                        // Get customer name from CONSUMIDOR column (16)
                        const customerName = cells[16]?.innerText?.trim() || '';
                        
                        // Get product description (22)
                        const product = cells[22]?.innerText?.trim() || '';
                        
                        // Get model/reference (21)
                        const model = cells[21]?.innerText?.trim() || '';
                        
                        // Get city (19) - fallback to "não capturado" if empty
                        const city = cells[19]?.innerText?.trim() || 'não capturado';
                        
                        // Get state (20)
                        const state = cells[20]?.innerText?.trim() || '';
                        
                        // Get phone (15)
                        const phone = cells[15]?.innerText?.trim() || '';
                        
                        // Get defect (9 - Defeito Reclamado Cliente)
                        const defect = cells[9]?.innerText?.trim() || '';
                        
                        // Get serial number (2)
                        const serialNumber = cells[2]?.innerText?.trim() || '';
                        
                        // Get date fields
                        const registrationDate = cells[3]?.innerText?.trim() || '';
                        const scheduledDate = cells[4]?.innerText?.trim() || '';
                        
                        orders.push({
                            os_number: osNumber,
                            status: status,
                            raw_box_color: rawBoxColor,  // diagnostic — see logger below
                            situacao: situacao,
                            service_type: serviceType,
                            customer_name: customerName,
                            product: product,
                            model: model,
                            city: city,
                            state: state,
                            phone1: phone,
                            reported_defect: defect,
                            serial_number: serialNumber,
                            registration_date: registrationDate,
                            scheduled_date: scheduledDate,
                            source: sourceLabel
                        });
                    } catch (e) {
                        console.error('Error parsing row:', e);
                    }
                });
                
                return orders;
            }''', source_label)
    
    async def fetch_order_details(self, page: Page, os_number: str) -> Optional[Dict]:
        """Fetch detailed order info from os_press.php"""
        try:
            url = f"{TELECONTROL_BASE_URL}/assist/os_press.php?os={os_number}"
            await page.goto(url, wait_until='domcontentloaded', timeout=60000)
            await page.wait_for_timeout(2000)
            
            order_data = {
                "os_number": os_number,
                "source": self.source_label
            }
            
            # Helper function to get text from cell next to titulo containing specific text
            async def get_field_value(titulo_text: str) -> str:
                try:
                    # Use XPath to find td.titulo containing text and get next sibling td.conteudo
                    titulo_cells = await page.query_selector_all('td.titulo')
                    for i, cell in enumerate(titulo_cells):
                        cell_text = await cell.inner_text()
                        if titulo_text.lower() in cell_text.lower():
                            # Get next sibling which should be the conteudo
                            next_cell = await cell.evaluate_handle('el => el.nextElementSibling')
                            if next_cell:
                                try:
                                    text = await next_cell.inner_text()
                                    # Clean up the text
                                    text = text.strip().replace('\xa0', '').replace('&nbsp;', '').strip()
                                    if text and text != '-':
                                        return text
                                except Exception:
                                    pass
                    return ""
                except Exception as e:
                    logger.debug(f"Error getting field {titulo_text}: {e}")
                    return ""
            
            # Extract customer name - field "Nome" in consumer section (first one is usually the consumer)
            customer_name = await get_field_value("Nome")
            if customer_name:
                order_data["customer_name"] = customer_name
            
            # Extract product description
            product_desc = await get_field_value("Descrição")
            if product_desc:
                order_data["product"] = product_desc
            
            # Extract brand from product description
            order_data["brand"] = extract_brand_from_description(order_data.get("product", ""))
            
            # Try to get reference/model
            reference = await get_field_value("Referência")
            if reference:
                order_data["model"] = reference
                # Also try to extract brand from reference
                if not order_data["brand"]:
                    order_data["brand"] = extract_brand_from_description(reference)
            
            # Extract serial number
            serial = await get_field_value("Nº de série")
            if serial:
                order_data["serial_number"] = serial
            
            # Extract batch (Versão Produto)
            batch = await get_field_value("Versão Produto")
            if batch:
                order_data["batch"] = batch
            
            # Extract phone - try Telefone Residencial first, then Celular
            phone = await get_field_value("Telefone Residencial")
            if not phone or phone in ['-', '--', '---']:
                phone = await get_field_value("Celular")
            if phone and phone not in ['-', '--', '---']:
                order_data["phone1"] = phone
            
            # Extract email
            email = await get_field_value("E-mail")
            if email:
                order_data["email"] = email
            
            # Extract address info
            cep = await get_field_value("CEP")
            if cep:
                order_data["cep"] = cep
            
            address = await get_field_value("Endereço")
            if address:
                order_data["address"] = address
            
            number = await get_field_value("Número")
            if number:
                order_data["number"] = number
            
            complement = await get_field_value("Complemento")
            if complement:
                order_data["complement"] = complement
            
            neighborhood = await get_field_value("Bairro")
            if neighborhood:
                order_data["neighborhood"] = neighborhood
            
            city = await get_field_value("Cidade")
            order_data["city"] = city if city else "não capturado"
            
            state = await get_field_value("Estado")
            if not state:
                state = await get_field_value("UF")
            if state:
                order_data["state"] = state
            
            # Extract defect - try multiple field names
            defect = await get_field_value("Defeito Reclamado Cliente")
            if not defect:
                defect = await get_field_value("Reclamado")
            if defect:
                order_data["reported_defect"] = defect
            
            # Extract service type
            service_type = await get_field_value("Tipo de Atendimento")
            if service_type:
                order_data["service_type"] = service_type
            
            # Extract status from various sources
            try:
                # Try to find status in interaction table (most accurate)
                status_cells = await page.query_selector_all('table.table-striped td.tac')
                for cell in status_cells:
                    text = (await cell.inner_text()).strip()
                    if text and ("F/Up" in text or "Aguardando" in text or "Finalizada" in text or "cliente" in text.lower()):
                        order_data["status"] = text
                        break
                
                # If not found, look for Situação header
                if not order_data.get("status"):
                    situacao_cells = await page.query_selector_all('th:has-text("Situação")')
                    for cell in situacao_cells:
                        tr = await cell.evaluate_handle('el => el.closest("tr")')
                        next_tr = await tr.evaluate_handle('el => el.nextElementSibling')
                        if next_tr:
                            status_td = await next_tr.query_selector('td.tac')
                            if status_td:
                                order_data["status"] = (await status_td.inner_text()).strip()
                                break
            except Exception as e:
                logger.debug(f"Error extracting status: {e}")
            
            # Extract registration date (Abertura or Data da NF)
            try:
                abertura = await get_field_value("ABERTURA")
                if abertura:
                    match = re.search(r'(\d{2})/(\d{2})/(\d{4})', abertura)
                    if match:
                        order_data["registration_date"] = f"{match.group(3)}-{match.group(2)}-{match.group(1)}"
            except Exception:
                pass
            
            # Extract scheduling history from Histórico de Intervenção table
            try:
                scheduling_history = []
                # Find the table with "Histórico de Intervenção"
                hist_header = await page.query_selector('td.inicio:has-text("Histórico de Intervenção")')
                if hist_header:
                    # Navigate to the parent table
                    parent_table = await hist_header.evaluate_handle('el => el.closest("table")')
                    if parent_table:
                        rows = await parent_table.query_selector_all('tr')
                        for row in rows[2:]:  # Skip the header rows
                            cells = await row.query_selector_all('td')
                            if len(cells) >= 3:
                                date_text = (await cells[0].inner_text()).strip()
                                desc_text = (await cells[1].inner_text()).strip()
                                status_text = (await cells[2].inner_text()).strip() if len(cells) > 2 else ""
                                justif_text = (await cells[3].inner_text()).strip() if len(cells) > 3 else ""
                                
                                if date_text and desc_text:
                                    scheduling_history.append({
                                        "date": date_text,
                                        "description": desc_text,
                                        "status": status_text,
                                        "justification": justif_text
                                    })
                
                order_data["scheduling_history"] = scheduling_history
            except Exception as e:
                logger.debug(f"Error extracting scheduling history: {e}")
                order_data["scheduling_history"] = []
            
            logger.info(f"Fetched details for OS {os_number}: {order_data.get('customer_name', 'N/A')}")
            return order_data
            
        except Exception as e:
            logger.error(f"Error fetching order details for {os_number}: {e}")
            return None
    
    async def sync_orders(self, start_date: str, end_date: str, db) -> Dict:
        """Main sync function"""
        if self._sync_lock.locked():
            logger.info(f"[{self.source_label}] Sync already running, skipping")
            return {"success": False, "orders_synced": 0, "orders_updated": 0, "errors": ["Sync already in progress"]}
        
        async with self._sync_lock:
            return await self._sync_orders_impl(start_date, end_date, db)

    async def _sync_orders_impl(self, start_date: str, end_date: str, db) -> Dict:
        """Internal sync implementation"""
        def normalize_date(val):
            """Convert dd/mm/yyyy to yyyy-mm-dd"""
            if not val:
                return val
            import re
            m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', str(val).strip())
            if m:
                return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
            return val
        
        result = {
            "success": False,
            "orders_synced": 0,
            "orders_updated": 0,
            "errors": []
        }
        
        try:
            # Always start with a fresh browser to avoid stale handles
            try:
                await self.close_browser()
            except Exception:
                pass
            await self.start_browser()
            
            page = await self.browser.new_page(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            # Login — retry up to 2 times before giving up so transient
            # errors (slow network, momentary 5xx from Telecontrol) don't
            # kill an entire sync cycle. Every failure is recorded in
            # result["errors"] so the caller can see WHY the sync failed.
            logged_in = False
            self.last_login_error = None
            for attempt in range(1, 3):  # 2 attempts
                try:
                    if await self.login(page):
                        logged_in = True
                        break
                    # login() populates self.last_login_error with the exact
                    # site-side message (e.g. "Login ou senha inválidos !!!")
                    reason = self.last_login_error or "session not established"
                    result["errors"].append(
                        f"Login attempt {attempt}/2 failed: {reason}"
                    )
                except Exception as e:  # noqa: BLE001
                    result["errors"].append(
                        f"Login attempt {attempt}/2 raised: {e}"
                    )
                    logger.warning(
                        f"[{self.source_label}] Login attempt {attempt}/2 failed: {e}"
                    )
                if attempt < 2:
                    await page.wait_for_timeout(3000 * attempt)  # 3s, then 6s
            if not logged_in:
                # Sync is broken — DO NOT return success. The badge is
                # driven by SCRAPER_HEALTH.consecutive_failures, and this
                # exit path must bubble that up.
                await page.close()
                return result

            # Fetch orders list — retry up to 2 times. fetch_orders_list
            # now raises on real failures (see hardened pagination) so we
            # get to actually retry instead of silently truncating.
            orders = []
            list_ok = False
            for attempt in range(1, 3):
                try:
                    orders = await self.fetch_orders_list(page, start_date, end_date)
                    list_ok = True
                    break
                except Exception as e:  # noqa: BLE001
                    result["errors"].append(
                        f"fetch_orders_list attempt {attempt}/2 raised: {e}"
                    )
                    logger.warning(
                        f"[{self.source_label}] fetch_orders_list attempt {attempt}/2 "
                        f"failed: {e}"
                    )
                    if attempt < 2:
                        await page.wait_for_timeout(5000 * attempt)  # 5s, 10s
            if not list_ok:
                # Same reasoning as login: bubble up as failure.
                await page.close()
                return result
            
            # Process each order
            for order_summary in orders:
                try:
                    os_number = order_summary["os_number"]
                    
                    # CRITICAL: Look for existing OS ONLY within the same source.
                    # This prevents Telecontrol scraper from accidentally overwriting
                    # internal Mastermaq OSs that may share the same os_number.
                    existing = await db.service_orders.find_one(
                        {"os_number": os_number, "source": self.source_label}
                    )

                    # Safety check: detect cross-source collision and skip to avoid data loss.
                    if not existing:
                        collision = await db.service_orders.find_one(
                            {"os_number": os_number}, {"_id": 0, "os_number": 1, "source": 1}
                        )
                        if collision:
                            logger.warning(
                                f"[scraper {self.source_label}] os_number={os_number} already exists "
                                f"with source={collision.get('source')}. Skipping to avoid overwriting."
                            )
                            result["errors"].append(
                                f"OS {os_number} colide com source {collision.get('source')}; ignorada para preservar dados."
                            )
                            continue
                    
                    if existing:
                        # Diagnostic: log unmapped color codes so we can add
                        # them to statusColorMap. Only log once per color per
                        # sync to avoid spamming (Set of seen colors is fine
                        # in-process because a sync is one function call).
                        raw_color = order_summary.get("raw_box_color", "")
                        if raw_color and not order_summary.get("status"):
                            if not hasattr(self, "_unmapped_colors"):
                                self._unmapped_colors = set()
                            if raw_color not in self._unmapped_colors:
                                self._unmapped_colors.add(raw_color)
                                logger.warning(
                                    f"[scraper {self.source_label}] UNMAPPED status color "
                                    f"{raw_color!r} on OS {os_number} (situacao={order_summary.get('situacao','')!r}). "
                                    f"Add it to statusColorMap in telecontrol_scraper.py."
                                )
                        
                        # Build update dict with all changed fields from list page
                        update_fields = {}
                        new_status = order_summary.get("status", "")
                        old_status = existing.get("status", "")
                        
                        # Update status if the new one is non-empty and different
                        if new_status and new_status != old_status:
                            update_fields["status"] = new_status
                        
                        # Update other fields if they have values and differ
                        # NOTE: city and state NOT updated from list page (column indices unreliable)
                        # They are only set from the detail page (fetch_order_details) for new orders
                        for field in ["customer_name", "product", "brand", "model", "phone1", 
                                      "service_type", "reported_defect", "serial_number", 
                                      "registration_date"]:
                            new_val = order_summary.get(field, "")
                            if field == "registration_date":
                                new_val = normalize_date(new_val) or new_val
                            if new_val and new_val != existing.get(field, ""):
                                update_fields[field] = new_val
                        
                        if update_fields:
                            update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
                            await db.service_orders.update_one(
                                {"os_number": os_number},
                                {"$set": update_fields}
                            )
                            
                            # Create notification only for status changes
                            if "status" in update_fields:
                                notification = {
                                    "id": f"notif-{os_number}-{datetime.now().timestamp()}",
                                    "message": f"OS {os_number} mudou de '{old_status}' para '{new_status}'",
                                    "os_number": os_number,
                                    "old_status": old_status,
                                    "new_status": new_status,
                                    "read": False,
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }
                                await db.notifications.insert_one(notification)
                            result["orders_updated"] += 1
                    else:
                        # Fetch full details for new order
                        details = await self.fetch_order_details(page, os_number)
                        
                        if details:
                            # Set defaults for missing fields
                            new_order = {
                                "id": f"tc-{os_number}",
                                "os_number": os_number,
                                "customer_name": details.get("customer_name") or order_summary.get("customer_name", ""),
                                "registration_date": normalize_date(details.get("registration_date")) or datetime.now().strftime("%Y-%m-%d"),
                                "attendance_date": normalize_date(details.get("attendance_date")),
                                "cep": details.get("cep", ""),
                                "address": details.get("address", ""),
                                "number": details.get("number", ""),
                                "neighborhood": details.get("neighborhood", ""),
                                "city": details.get("city") or order_summary.get("city") or "não capturado",
                                "state": details.get("state", ""),
                                "complement": details.get("complement"),
                                "phone1": details.get("phone1") or order_summary.get("phone1", ""),
                                "phone2": None,
                                "landline": None,
                                "email": details.get("email", ""),
                                "visit_fee": None,
                                "reference_point": None,
                                "service_type": details.get("service_type", ""),
                                "product": details.get("product") or order_summary.get("product", ""),
                                "brand": details.get("brand") or order_summary.get("brand", ""),
                                "model": details.get("model", ""),
                                "serial_number": details.get("serial_number", ""),
                                "batch": details.get("batch", ""),
                                "reported_defect": details.get("reported_defect") or order_summary.get("reported_defect", ""),
                                "observations": None,
                                "status": details.get("status") or order_summary.get("status", ""),
                                "scheduling_history": details.get("scheduling_history", []),
                                "source": self.source_label,
                                "created_at": datetime.now(timezone.utc).isoformat(),
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            }
                            
                            # Add sort_date for proper ordering
                            reg = new_order.get("registration_date", "")
                            sort_date = None
                            if reg:
                                for fmt in ["%d/%m/%Y", "%Y-%m-%d"]:
                                    try:
                                        sort_date = datetime.strptime(reg.strip()[:10], fmt).isoformat()
                                        break
                                    except Exception:
                                        pass
                            if not sort_date:
                                sort_date = new_order["created_at"]
                            new_order["sort_date"] = sort_date
                            
                            await db.service_orders.insert_one(new_order)
                            result["orders_synced"] += 1
                        
                        await page.wait_for_timeout(500)  # Rate limiting
                    
                except Exception as e:
                    logger.error(f"Error processing order: {e}")
                    result["errors"].append(str(e))
                    continue
            
            await page.close()
            # Only declare success if we ACTUALLY got past login + list
            # fetch. Per-order errors are recorded but tolerated — losing a
            # couple of details to individual quirks is expected. A blanket
            # login/pagination failure is NOT (that's what left 4 OSs behind
            # on 28/07).
            result["success"] = list_ok and logged_in
            # Convenience flag so callers can distinguish "everything fine"
            # vs "mostly worked but had errors" without re-parsing.
            result["degraded"] = bool(result["errors"]) and result["success"]

        except Exception as e:
            logger.error(f"[{self.source_label}] Sync error: {e}")
            result["errors"].append(str(e))
            result["success"] = False
        finally:
            await self.close_browser()

        return result


# Singleton instances
scraper_hisense = TelecontrolScraper(
    login=TELECONTROL_LOGIN,
    password=TELECONTROL_PASSWORD,
    source_label='telecontrol_hisense'
)

scraper_hq = TelecontrolScraper(
    login=TELECONTROL_LOGIN_HQ,
    password=TELECONTROL_PASSWORD_HQ,
    source_label='telecontrol_hq'
)

# Keep backward compat alias
scraper = scraper_hisense
