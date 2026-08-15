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

/** Best source for viewing: local dataUrl or shared url */
export const getFileSource = (file?: FileAttachment | null): string | undefined => {
  if (!file) return undefined;
  return file.dataUrl || file.url || undefined;
};
