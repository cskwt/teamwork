import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardPaste, MessageSquareWarning, Send, Smartphone, Upload, Image as ImageIcon } from 'lucide-react';
import { ArtworkApproval, FileAttachment, Order } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { generateId, formatDate } from '../../utils/helpers';
import { getFileSource, uploadRawFileWithLocalFallback } from '../../utils/files';
import {
  buildApprovalMessage,
  loadWhatsAppConfig,
  normalizeWhatsAppNumber,
  sendArtworkWhatsApp,
  trackingCode,
} from '../../utils/whatsapp';

interface Props {
  order: Order;
}

const statusLabel: Record<ArtworkApproval['status'], { ar: string; color: string; bg: string }> = {
  sent: { ar: 'بانتظار رد العميل', color: '#d97706', bg: '#fffbeb' },
  approved: { ar: 'تم الاعتماد', color: '#16a34a', bg: '#f0fdf4' },
  rejected: { ar: 'مطلوب تعديل', color: '#dc2626', bg: '#fef2f2' },
};

const ArtworkApprovalTab: React.FC<Props> = ({ order }) => {
  const { state, dispatch, addHistoryEntry } = useApp();
  const { currentUser } = state;
  const approvals = order.artworkApprovals || [];
  const imageForms = (order.orderForms || []).filter(
    (f) => (f.url || f.dataUrl) && (f.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name || '')),
  );
  const dropRef = useRef<HTMLDivElement>(null);

  const [phone, setPhone] = useState(order.clientPhone || '');
  const [selectedUrl, setSelectedUrl] = useState(imageForms[0]?.url || imageForms[0]?.dataUrl || '');
  const [selectedName, setSelectedName] = useState(imageForms[0]?.name || '');
  const [message, setMessage] = useState('');
  const [code, setCode] = useState(() => trackingCode());
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    setPhone(order.clientPhone || '');
  }, [order.clientPhone, order.id]);

  useEffect(() => {
    setMessage(buildApprovalMessage(order, code));
  }, [order.id, order.clientName, order.orderNumber, code]);

  useEffect(() => {
    loadWhatsAppConfig().then((c) => setConfigured(c.configured));
  }, []);

  const latest = useMemo(
    () => [...approvals].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0],
    [approvals],
  );

  const persistPhone = (value: string) => {
    const next = value.trim();
    if (next === (order.clientPhone || '')) return;
    dispatch({
      type: 'UPDATE_ORDER',
      payload: { ...order, clientPhone: next, updatedAt: new Date().toISOString() },
      silent: true,
    } as any);
  };

  const attachImage = async (file: File) => {
    setStatus('جاري رفع لقطة التصميم...');
    const attached = await uploadRawFileWithLocalFallback(generateId(), file);
    const src = attached.url || attached.dataUrl || '';
    if (!src) {
      setStatus('تعذر رفع الصورة. أعد المحاولة.');
      return;
    }
    if (!attached.url) {
      setStatus('الصورة على هذا الجهاز فقط — ارفع ملفات واتساب/API إلى Hostinger ثم أعد الإرسال.');
    } else {
      setStatus('');
    }
    setSelectedUrl(attached.url || src);
    setSelectedName(attached.name);
    dispatch({
      type: 'UPDATE_ORDER',
      payload: {
        ...order,
        orderForms: [...(order.orderForms || []), attached],
        updatedAt: new Date().toISOString(),
      },
      silent: true,
    } as any);
  };

  const handlePickExisting = (f: FileAttachment) => {
    const src = getFileSource(f) || '';
    setSelectedUrl(src);
    setSelectedName(f.name);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await attachImage(file);
    } catch {
      setStatus('تعذر رفع الصورة.');
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const blob = item.getAsFile();
    if (!blob) return;
    const file = new File([blob], `artwork-${Date.now()}.png`, { type: blob.type || 'image/png' });
    try {
      await attachImage(file);
    } catch {
      setStatus('تعذر لصق الصورة.');
    }
  };

  const handleSend = async () => {
    const e164 = normalizeWhatsAppNumber(phone);
    if (!e164) {
      setStatus('أدخل رقم واتساب صحيح للعميل.');
      return;
    }
    if (!selectedUrl || !selectedUrl.startsWith('http')) {
      setStatus('يجب رفع لقطة التصميم إلى السيرفر (رابط عام) قبل الإرسال عبر واتساب.');
      return;
    }
    if (!currentUser) return;
    setSending(true);
    setStatus('جاري الإرسال عبر واتساب...');
    const now = new Date().toISOString();
    const approval: ArtworkApproval = {
      id: generateId(),
      round: approvals.length + 1,
      trackingCode: code,
      createdAt: now,
      sentAt: now,
      sentBy: currentUser.id,
      customerPhone: e164,
      imageUrl: selectedUrl,
      imageName: selectedName,
      message,
      status: 'sent',
    };
    const sent = await sendArtworkWhatsApp({
      to: e164,
      body: message,
      mediaUrl: selectedUrl,
      orderId: order.id,
      approvalId: approval.id,
      trackingCode: code,
    });
    if (!sent.ok) {
      setSending(false);
      setStatus(sent.error || 'فشل إرسال واتساب. أدخل حساب Twilio من الإعدادات وارفع ملفات واتساب إلى Hostinger.');
      return;
    }
    dispatch({
      type: 'UPDATE_ORDER',
      payload: {
        ...order,
        clientPhone: e164,
        artworkApprovals: [...approvals, { ...approval, messageSid: sent.sid }],
        updatedAt: now,
      },
      silent: true,
    } as any);
    addHistoryEntry(order.id, 'إرسال التصميم للاعتماد عبر واتساب', undefined, e164);
    setSending(false);
    setStatus('تم إرسال التصميم للعميل عبر واتساب ✓');
    setCode(trackingCode());
  };

  return (
    <div className="wa-approval" onPaste={handlePaste} ref={dropRef} tabIndex={0}>
      <p className="wa-intro">
        أرسل لقطة التصميم للعميل عبر واتساب من رقم الاستوديو. يعتمد العميل أو يطلب تعديلاً مع ملاحظة، فيصلك إشعار وتعيد الإرسال بعد التعديل.
      </p>

      {latest && (
        <div className="wa-latest" style={{ background: statusLabel[latest.status].bg, borderColor: statusLabel[latest.status].color }}>
          {latest.status === 'approved' ? <CheckCircle2 size={18} color="#16a34a" /> : latest.status === 'rejected' ? <MessageSquareWarning size={18} color="#dc2626" /> : <Smartphone size={18} color="#d97706" />}
          <div>
            <strong style={{ color: statusLabel[latest.status].color }}>{statusLabel[latest.status].ar}</strong>
            {latest.status === 'rejected' && latest.customerComment && (
              <p className="wa-comment">ملاحظة العميل: «{latest.customerComment}»</p>
            )}
            {latest.status === 'approved' && <p className="wa-comment">يمكن البدء بالتنفيذ.</p>}
            {latest.repliedAt && <span className="wa-meta">{formatDate(latest.repliedAt)}</span>}
          </div>
        </div>
      )}

      {configured === false && (
        <p className="wa-warn">اربط واتساب من القائمة الجانبية ← الإعدادات ← بطاقة «واتساب اعتماد التصميم». يظهر هذا القسم لحساب المدير فقط.</p>
      )}

      <div className="wa-field">
        <label>رقم واتساب العميل</label>
        <input
          className="od-edit-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => persistPhone(phone)}
          placeholder="مثال: 94493883 أو +96594493883"
          inputMode="tel"
          dir="ltr"
        />
      </div>

      <div className="wa-field">
        <div className="od-files-title-row">
          <label>لقطة التصميم</label>
          <div className="wa-upload-actions">
            <span className="wa-paste-hint"><ClipboardPaste size={13} /> يمكن لصق الصورة هنا (Ctrl+V)</span>
            <label className="od-upload-btn">
              <Upload size={13} /> رفع لقطة شاشة
              <input type="file" accept="image/*" hidden onChange={handleUpload} />
            </label>
          </div>
        </div>
        {imageForms.length > 0 && (
          <div className="wa-thumbs">
            {imageForms.map((f) => {
              const src = getFileSource(f) || '';
              const active = selectedUrl === src || selectedUrl === f.url;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`wa-thumb ${active ? 'wa-thumb--on' : ''}`}
                  onClick={() => handlePickExisting(f)}
                >
                  {src ? <img src={src} alt={f.name} /> : <ImageIcon size={22} />}
                </button>
              );
            })}
          </div>
        )}
        {selectedUrl && (
          <div className="wa-preview">
            <img src={selectedUrl} alt={selectedName || 'artwork'} />
          </div>
        )}
      </div>

      <div className="wa-field">
        <label>نص رسالة الاعتماد (تُرسل مع الصورة)</label>
        <textarea className="od-edit-input od-edit-textarea" rows={12} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <button className="btn-primary wa-send" onClick={handleSend} disabled={sending}>
        <Send size={15} /> {sending ? 'جاري الإرسال...' : latest?.status === 'rejected' ? 'إرسال التصميم المعدّل للعميل' : 'إرسال للاعتماد عبر واتساب'}
      </button>
      {status && <p className={`wa-status ${status.includes('✓') ? 'msg-success' : ''}`}>{status}</p>}

      {approvals.length > 0 && (
        <div className="wa-history">
          <h4>سجل الاعتماد</h4>
          {[...approvals].reverse().map((a) => {
            const st = statusLabel[a.status];
            return (
              <div key={a.id} className="wa-round">
                <div className="wa-round-head">
                  <span>الجولة {a.round}</span>
                  <span className="wa-pill" style={{ color: st.color, background: st.bg }}>{st.ar}</span>
                </div>
                <span className="wa-meta">{formatDate(a.sentAt)} · {a.customerPhone} · {a.trackingCode}</span>
                {a.customerComment && <p className="wa-comment">رد العميل: {a.customerComment}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArtworkApprovalTab;
