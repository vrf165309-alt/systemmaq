import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, ChevronRight, Check, RotateCcw, Send } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const SignaturePad = ({ onSave, label }) => {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 200;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = (e) => {
    e.preventDefault();
    setDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    setHasDrawn(false);
  };

  const save = () => {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="relative border-2 border-gray-200 rounded-lg overflow-hidden touch-none bg-white">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height: 200 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          data-testid="signature-canvas"
        />
        <div className="absolute bottom-3 left-3 right-3 border-t border-dashed border-gray-300" />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear} data-testid="signature-clear-btn">
          <RotateCcw className="h-4 w-4 mr-1" /> Limpar
        </Button>
        <Button size="sm" onClick={save} disabled={!hasDrawn}
          className="ml-auto bg-gray-900 hover:bg-gray-800"
          data-testid="signature-confirm-btn"
        >
          <Check className="h-4 w-4 mr-1" /> Confirmar
        </Button>
      </div>
    </div>
  );
};

const SignatureModal = ({ open, onClose, order, onSigned, getAuthHeader, isOverlay = false }) => {
  const [step, setStep] = useState(1); // 1: dados, 2: assin tecnico, 3: assin cliente
  const [techName, setTechName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientCpf, setClientCpf] = useState('');
  const [sigTech, setSigTech] = useState(null);
  const [useSavedTech, setUseSavedTech] = useState(false);
  const [savedTechSig, setSavedTechSig] = useState(null);
  const [sigClient, setSigClient] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [linkSending, setLinkSending] = useState(false);
  const [linkSent, setLinkSent] = useState(null); // { url, whatsapp_url }

  useEffect(() => {
    if (open) {
      setStep(1);
      setSigTech(null);
      setSigClient(null);
      setUseSavedTech(false);
      setError(null);
      setTechName(order?.technician || '');
      setClientName(order?.customer_name || '');
      setClientCpf('');
      setSavedTechSig(null);
      setLinkSent(null);
      setLinkSending(false);
    }
  }, [open, order]);

  // Update saved sig when tech name changes
  useEffect(() => {
    if (techName.trim()) {
      const key = `mastermaq_tech_sig_${techName.trim().toLowerCase()}`;
      setSavedTechSig(localStorage.getItem(key) || null);
    } else {
      setSavedTechSig(null);
    }
  }, [techName]);

  const totalSteps = 3;

  const handleNextFromData = () => {
    if (!techName.trim()) {
      setError('Nome do técnico/entregador é obrigatório');
      return;
    }
    if (!clientName.trim()) {
      setError('Nome do cliente é obrigatório');
      return;
    }
    setError(null);
    if (savedTechSig) {
      setUseSavedTech(true);
      setSigTech(savedTechSig);
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleTechConfirm = useCallback((dataUrl) => {
    setSigTech(dataUrl);
    const key = `mastermaq_tech_sig_${techName.trim().toLowerCase()}`;
    localStorage.setItem(key, dataUrl);
    setSavedTechSig(dataUrl);
    setStep(3);
  }, [techName]);

  const handleClientConfirm = useCallback(async (dataUrl) => {
    setSigClient(dataUrl);
    setSubmitting(true);
    setError(null);

    try {
      const resp = await fetch(`${API}/api/service-orders/${order.os_number}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader().headers
        },
        body: JSON.stringify({
          signature_technician: sigTech,
          signature_client: dataUrl,
          signature_client_name: clientName.trim(),
          signature_client_cpf: clientCpf.trim(),
          signature_tech_name: techName.trim()
        })
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.detail || 'Erro ao assinar OS');
      }

      const result = await resp.json();
      onSigned(result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [API, order, sigTech, clientName, clientCpf, getAuthHeader, onSigned, onClose]);

  // ─── Enviar link ao cliente por WhatsApp ─────────────────────────
  // Gera um token único no backend com a assinatura do técnico já
  // capturada e abre o WhatsApp do cliente com uma mensagem pronta
  // contendo o link. O cliente assina pelo próprio celular.
  const handleSendLink = useCallback(async () => {
    if (!sigTech) {
      setError('Assinatura do técnico é necessária antes de enviar o link.');
      return;
    }
    setLinkSending(true);
    setError(null);
    try {
      const resp = await fetch(`${API}/api/service-orders/${order.os_number}/signature-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader().headers },
        body: JSON.stringify({
          technician_signature: sigTech,
          technician_name: techName.trim(),
          client_name: clientName.trim(),
          client_cpf: clientCpf.trim(),
        })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro ao gerar link');
      }
      const data = await resp.json();
      // Sempre reconstruir a URL usando o origin que o cliente ESTÁ vendo
      // — o backend pode devolver o host do cluster interno se o header
      // Origin da chamada não bater com o domínio público.
      const absoluteUrl = `${window.location.origin}/sign/${data.token}`;
      let whatsUrl = data.whatsapp_url || '';
      if (whatsUrl) {
        // Substitui QUALQUER URL de /sign/${token} pela absoluta correta
        // (a mensagem do wa.me pode ter o valor errado embutido).
        try {
          const u = new URL(whatsUrl);
          const text = u.searchParams.get('text') || '';
          // Regex substitui qualquer URL até /sign/<token>
          const fixed = text.replace(/https?:\/\/[^\s]*\/sign\/[a-f0-9-]+/gi, absoluteUrl)
                            .replace(/\/sign\/[a-f0-9-]+/gi, absoluteUrl);
          u.searchParams.set('text', fixed);
          whatsUrl = u.toString();
        } catch (_) { /* fallback: uso da URL bruta */ }
      }
      setLinkSent({ url: absoluteUrl, whatsapp_url: whatsUrl });
      // Abre o WhatsApp em nova aba
      if (whatsUrl) window.open(whatsUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message);
    } finally {
      setLinkSending(false);
    }
  }, [API, order, sigTech, techName, clientName, clientCpf, getAuthHeader]);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" data-testid="signature-modal" data-overlay="true">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Assinar OS {order.os_number}
            <span className="text-sm font-normal text-gray-400 ml-2">
              Passo {step} de {totalSteps}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${step >= 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {step > 1 ? <Check className="h-3 w-3" /> : '1'} Dados
          </div>
          <ChevronRight className="h-3 w-3 text-gray-300" />
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${step >= 2 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {step > 2 || useSavedTech ? <Check className="h-3 w-3" /> : '2'} Técnico
          </div>
          <ChevronRight className="h-3 w-3 text-gray-300" />
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${step >= 3 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {sigClient ? <Check className="h-3 w-3" /> : '3'} Cliente
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700" data-testid="signature-error">
            {error}
          </div>
        )}

        {submitting ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
            <p className="text-sm text-gray-500">Finalizando assinatura...</p>
          </div>
        ) : step === 1 ? (
          /* Step 1: Client data */
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Técnico *</Label>
              <Input
                value={techName}
                onChange={e => setTechName(e.target.value)}
                placeholder="Nome do técnico ou entregador"
                data-testid="sig-tech-name"
              />
              {savedTechSig && techName.trim() && (
                <p className="text-[11px] text-green-600 mt-1">Assinatura salva para "{techName.trim()}" — será reutilizada</p>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium">Nome do Cliente *</Label>
              <Input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Nome completo do cliente"
                data-testid="sig-client-name"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">CPF <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Input
                value={clientCpf}
                onChange={e => setClientCpf(e.target.value)}
                placeholder="000.000.000-00"
                data-testid="sig-client-cpf"
              />
            </div>
            <Button onClick={handleNextFromData} className="w-full bg-gray-900 hover:bg-gray-800" data-testid="sig-next-btn">
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        ) : step === 2 ? (
          /* Step 2: Tech signature */
          <div>
            <SignaturePad
              key="tech"
              label={`Assinatura: ${techName || 'Técnico'}`}
              onSave={handleTechConfirm}
            />
            <Button variant="ghost" size="sm" className="text-gray-500 mt-2"
              onClick={() => setStep(1)} data-testid="sig-back-1">
              Voltar
            </Button>
          </div>
        ) : (
          /* Step 3: Client signature */
          <div>
            {useSavedTech && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded border border-gray-100">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-xs text-gray-600">Assinatura do técnico reutilizada</span>
                <Button variant="ghost" size="sm" className="ml-auto text-xs text-gray-400 h-6 px-2"
                  onClick={() => {
                    setUseSavedTech(false);
                    setSigTech(null);
                    setStep(2);
                  }} data-testid="sig-redo-tech">
                  Refazer
                </Button>
              </div>
            )}

            {/* ─── Enviar link para o cliente assinar pelo próprio celular ─── */}
            {linkSent ? (
              <div className="mb-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50" data-testid="sig-link-sent">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-900">Link enviado</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      O WhatsApp foi aberto em outra aba. O link expira em 7 dias.
                    </p>
                    <div className="mt-2 flex items-center gap-2 bg-white rounded border border-emerald-200 px-2 py-1">
                      <input
                        readOnly
                        value={linkSent.url}
                        className="flex-1 min-w-0 text-[11px] font-mono text-gray-700 bg-transparent outline-none"
                        data-testid="sig-link-url"
                      />
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard?.writeText(linkSent.url).catch(() => {}); }}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 font-medium flex-shrink-0"
                        data-testid="sig-link-copy"
                      >
                        Copiar
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-3 text-xs text-gray-500 hover:text-gray-700 underline"
                      data-testid="sig-link-close"
                    >
                      Fechar (aguardando cliente assinar)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800">Cliente não está presente?</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                      Envie um link seguro pelo WhatsApp — o cliente assina no próprio celular.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSendLink}
                    disabled={linkSending}
                    className="flex-shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    data-testid="sig-send-link-btn"
                  >
                    {linkSending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                    Enviar link
                  </Button>
                </div>
              </div>
            )}

            {!linkSent && (
              <>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-2">
                  <span>Ou o cliente assina agora</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <SignaturePad
                  key="client"
                  label={`Assinatura do Cliente: ${clientName || order.customer_name}`}
                  onSave={handleClientConfirm}
                />
                <Button variant="ghost" size="sm" className="text-gray-500 mt-2"
                  onClick={() => {
                    if (useSavedTech) {
                      setUseSavedTech(false);
                      setSigTech(null);
                      setStep(1);
                    } else {
                      setStep(2);
                    }
                  }} data-testid="sig-back-2">
                  Voltar
                </Button>
              </>
            )}
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};

export default SignatureModal;
