import { FileAttachment } from '../types';

const FILES_API_URL = 'https://www.csapp.io/teamwork-api/files-api.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const readFileAsDataUrl = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });

type UploadResult = { url: string | null; error?: string; status?: number };

const parseUploadResponse = async (res: Response): Promise<UploadResult> => {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  // Require a real public URL — never treat bare {success:true} as upload OK
  if (res.ok && data?.url && typeof data.url === 'string' && data.url.startsWith('http')) {
    return { url: data.url, status: res.status };
  }
  return {
    url: null,
    status: res.status,
    error: data?.error || `HTTP ${res.status}`,
  };
};

const postMultipart = async (
  endpoint: string,
  id: string,
  file: File | Blob,
  fileName: string,
  fileType: string,
  signal: AbortSignal,
): Promise<UploadResult> => {
  const form = new FormData();
  form.append('id', id);
  form.append('name', fileName);
  form.append('type', fileType);
  form.append('file', file, fileName);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY },
    body: form,
    signal,
  });
  return parseUploadResponse(res);
};

const postJsonDataUrl = async (
  endpoint: string,
  id: string,
  fileName: string,
  fileType: string,
  dataUrl: string,
  signal: AbortSignal,
): Promise<UploadResult> => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ id, name: fileName, type: fileType, dataUrl }),
    signal,
  });
  return parseUploadResponse(res);
};

/**
 * Upload a browser File/Blob to Hostinger files-api.php ONLY.
 * Do NOT fall back to api.php — an outdated Hostinger api.php ignores ?resource=file
 * and overwrites the entire app_state with the file JSON (data wipe).
 */
export const uploadRawFileToServer = async (
  id: string,
  file: File | Blob,
  name?: string,
  type?: string,
): Promise<string | null> => {
  const fileName = name || (file instanceof File ? file.name : 'file');
  const fileType = type || (file instanceof File ? file.type : file.type) || 'application/octet-stream';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      let result = await postMultipart(FILES_API_URL, id, file, fileName, fileType, controller.signal);
      if (result.url) return result.url;

      // JSON fallback for the same files-api only (small files)
      const dataUrl = await readFileAsDataUrl(file);
      result = await postJsonDataUrl(FILES_API_URL, id, fileName, fileType, dataUrl, controller.signal);
      if (result.url) return result.url;

      console.warn('[upload] files-api failed', result.error || result.status);
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[upload] exception', err);
    return null;
  }
};

/** Upload with local dataUrl fallback so the user can still save the order */
export const uploadRawFileWithLocalFallback = async (
  id: string,
  file: File,
): Promise<FileAttachment> => {
  const url = await uploadRawFileToServer(id, file);
  if (url) {
    return { id, name: file.name, type: file.type, size: file.size, url };
  }
  const dataUrl = await readFileAsDataUrl(file);
  return { id, name: file.name, type: file.type, size: file.size, dataUrl };
};

const postJson = async (file: FileAttachment, signal: AbortSignal): Promise<string | null> => {
  if (!file.dataUrl) return null;
  const a = await postJsonDataUrl(
    FILES_API_URL,
    file.id,
    file.name || 'file',
    file.type || 'application/octet-stream',
    file.dataUrl,
    signal,
  );
  return a.url;
};

/** Upload a file to Hostinger shared storage; returns public URL or null */
export const uploadAttachmentToServer = async (
  file: FileAttachment,
): Promise<string | null> => {
  if (file.url && file.url.includes('/teamwork-api/uploads/')) {
    return file.url;
  }
  if (!file?.dataUrl || !file.dataUrl.startsWith('data:')) return file.url || null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);

    try {
      const blob = dataUrlToBlob(file.dataUrl);
      const result = await postMultipart(
        FILES_API_URL,
        file.id,
        blob,
        file.name || 'file',
        file.type || blob.type || 'application/octet-stream',
        controller.signal,
      );
      if (result.url) {
        clearTimeout(timer);
        return result.url;
      }
    } catch {
      // fall through to JSON
    }

    const url = await postJson(file, controller.signal);
    clearTimeout(timer);
    return url;
  } catch {
    return null;
  }
};

/** Upload a raw dataUrl (e.g. ops screen photos) to shared storage */
export const uploadDataUrlToServer = async (
  id: string,
  dataUrl: string,
  name = 'photo.jpg',
): Promise<string | null> => {
  if (!dataUrl?.startsWith('data:')) {
    return dataUrl?.startsWith('http') ? dataUrl : null;
  }
  const mime = dataUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
  return uploadAttachmentToServer({
    id,
    name: name.includes('.') ? name : `${name}.${ext}`,
    type: mime,
    size: 0,
    dataUrl,
  });
};

/** Ensure attachment has a shareable url (upload if needed) */
export const ensureAttachmentUrl = async (
  file: FileAttachment,
): Promise<FileAttachment> => {
  if (file.url) return file;
  if (!file.dataUrl) return file;
  const url = await uploadAttachmentToServer(file);
  return url ? { ...file, url } : file;
};

const VERCEL_DOWNLOAD_ORIGIN = 'https://teamwork.csapp.io';

export const extFromFileMeta = (name?: string, type?: string): string => {
  const fromName = (name || '').split('?')[0].split('#')[0];
  const dot = fromName.lastIndexOf('.');
  const ext = dot >= 0 ? fromName.slice(dot + 1).toLowerCase() : '';
  if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext;
  const mime = (type || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return '';
};

/** Keep a filesystem-safe name and always restore .pdf for invoice PDFs. */
export const safeDownloadName = (fileName: string, src?: string, mime?: string): string => {
  let name = (fileName || 'download').trim() || 'download';
  name = name.replace(/[\r\n"\\]/g, '_');
  const ext = extFromFileMeta(name, mime) || extFromFileMeta(src, mime);
  if (ext && !name.toLowerCase().endsWith(`.${ext}`)) name = `${name}.${ext}`;
  return name;
};

/** Best source for viewing/downloading: local dataUrl or shared url */
export const getFileSource = (file?: FileAttachment | null): string | undefined => {
  if (!file) return undefined;
  return file.dataUrl || file.url || undefined;
};

export const isHostingerUploadUrl = (src?: string): boolean =>
  !!src && /\/teamwork-api\/uploads\/[^/?#]+/i.test(src);

export const downloadProxyHref = (src: string, fileName: string, absolute = true): string => {
  const name = safeDownloadName(fileName, src);
  const qs = `url=${encodeURIComponent(src)}&name=${encodeURIComponent(name)}`;
  return absolute ? `${VERCEL_DOWNLOAD_ORIGIN}/api/download?${qs}` : `/api/download?${qs}`;
};

const clickAnchor = (href: string, opts?: { download?: string; target?: string }) => {
  const link = document.createElement('a');
  link.href = href;
  if (opts?.download) link.download = opts.download;
  if (opts?.target) link.target = opts.target;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const triggerBrowserDownload = (blob: Blob, fileName: string) => {
  const isPdf =
    fileName.toLowerCase().endsWith('.pdf') ||
    (blob.type || '').toLowerCase().includes('pdf');
  // Keep PDF mime so the saved invoice opens; octet-stream for images so
  // mobile browsers don't preview instead of saving.
  const type = isPdf ? (blob.type || 'application/pdf') : 'application/octet-stream';
  const downloadBlob = blob.type === type ? blob : new Blob([blob], { type });
  const url = URL.createObjectURL(downloadBlob);
  clickAnchor(url, { download: fileName || 'download' });
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/** Reject JSON/HTML error bodies that browsers would save as a fake image. */
const assertRealFileBlob = async (blob: Blob): Promise<Blob> => {
  const type = (blob.type || '').toLowerCase();
  const head = blob.size < 512 ? (await blob.slice(0, 120).text()).trim() : '';
  if (head.startsWith('%PDF')) return blob;
  if (type.includes('json') || type.includes('text/html')) {
    throw new Error('not a binary file');
  }
  if (type.includes('text/plain') && !head.startsWith('%PDF')) {
    throw new Error('not a binary file');
  }
  if (blob.size < 512 && (head.startsWith('{') || head.startsWith('<') || head.startsWith('['))) {
    throw new Error('error payload');
  }
  if (blob.size < 32) throw new Error('file too small');
  return blob;
};

const fetchBlobValidated = async (url: string, init?: RequestInit): Promise<Blob> => {
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit', ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('json') || ct.includes('text/html')) {
    throw new Error(`bad content-type ${ct}`);
  }
  return assertRealFileBlob(await res.blob());
};

/**
 * Download a file to the device (does not open a preview tab).
 * Hostinger invoice PDFs have no CORS headers, and files-api.php on production
 * does not yet expose action=download. Navigate to the Vercel attachment proxy
 * so the browser saves the file without a CORS fetch (keeps the click gesture).
 */
export const downloadFileToDevice = async (
  src: string | undefined,
  fileName: string,
): Promise<void> => {
  if (!src) throw new Error('missing file');
  const name = safeDownloadName(fileName, src);

  if (src.startsWith('data:')) {
    triggerBrowserDownload(await assertRealFileBlob(dataUrlToBlob(src)), name);
    return;
  }

  if (src.startsWith('blob:')) {
    triggerBrowserDownload(await fetchBlobValidated(src), name);
    return;
  }

  if (isHostingerUploadUrl(src)) {
    // Content-Disposition: attachment on the proxy forces a save.
    // Do not set <a download> here — a JSON/HTML error would be saved as "Invoice.pdf".
    clickAnchor(downloadProxyHref(src, name, true));
    return;
  }

  try {
    triggerBrowserDownload(await fetchBlobValidated(src, { mode: 'cors' }), name);
  } catch (err) {
    clickAnchor(src, { download: name, target: '_blank' });
    throw err;
  }
};
