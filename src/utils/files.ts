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
  const base = { id, name: file.name, type: file.type, size: file.size };
  try {
    const url = await uploadRawFileToServer(id, file);
    if (url) return { ...base, url };
  } catch (err) {
    console.warn('[upload] server upload failed', err);
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    return { ...base, dataUrl };
  } catch (err) {
    console.warn('[upload] local read failed', err);
    return base;
  }
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

/** Best source for viewing: local dataUrl or shared url */
export const getFileSource = (file?: FileAttachment | null): string | undefined => {
  if (!file) return undefined;
  return file.dataUrl || file.url || undefined;
};

const triggerBrowserDownload = (blob: Blob, fileName: string) => {
  // octet-stream forces "Save as" instead of opening images/PDFs inline
  const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(downloadBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'download';
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/** Reject JSON/HTML error bodies that browsers would save as a fake image. */
const assertRealFileBlob = async (blob: Blob): Promise<Blob> => {
  const type = (blob.type || '').toLowerCase();
  if (type.includes('json') || type.includes('text/html') || type.includes('text/plain')) {
    throw new Error('not a binary file');
  }
  // Health/error JSON from files-api is typically ~40–120 bytes
  if (blob.size < 512) {
    const head = (await blob.slice(0, 120).text()).trim();
    if (head.startsWith('{') || head.startsWith('<') || head.startsWith('[')) {
      throw new Error('error payload');
    }
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
 * Prefers same-origin Vercel proxy for Hostinger uploads (avoids CORS + fake JSON saves).
 */
export const downloadFileToDevice = async (
  src: string | undefined,
  fileName: string,
): Promise<void> => {
  if (!src) throw new Error('missing file');
  const name = (fileName || 'download').trim() || 'download';

  if (src.startsWith('data:')) {
    triggerBrowserDownload(await assertRealFileBlob(dataUrlToBlob(src)), name);
    return;
  }

  if (src.startsWith('blob:')) {
    triggerBrowserDownload(await fetchBlobValidated(src), name);
    return;
  }

  const uploadsMatch = src.match(/\/teamwork-api\/uploads\/([^/?#]+)/i);
  const errors: string[] = [];

  // 1) Same-origin Vercel proxy — works without Hostinger files-api update
  if (uploadsMatch) {
    try {
      const proxy =
        `/api/download?url=${encodeURIComponent(src)}` +
        `&name=${encodeURIComponent(name)}`;
      triggerBrowserDownload(await fetchBlobValidated(proxy), name);
      return;
    } catch (e: any) {
      errors.push(`vercel-proxy: ${e?.message || e}`);
    }
  }

  // 2) Direct fetch (needs CORS on uploads)
  try {
    triggerBrowserDownload(
      await fetchBlobValidated(src, { mode: 'cors' }),
      name,
    );
    return;
  } catch (e: any) {
    errors.push(`direct: ${e?.message || e}`);
  }

  // 3) Hostinger files-api download action (if updated on server)
  if (uploadsMatch?.[1]) {
    try {
      const apiUrl =
        `${FILES_API_URL}?action=download` +
        `&file=${encodeURIComponent(uploadsMatch[1])}` +
        `&name=${encodeURIComponent(name)}`;
      triggerBrowserDownload(
        await fetchBlobValidated(apiUrl, { headers: { 'X-API-Key': API_KEY } }),
        name,
      );
      return;
    } catch (e: any) {
      errors.push(`files-api: ${e?.message || e}`);
    }
  }

  console.warn('[download] all strategies failed', errors);
  throw new Error('download failed');
};
