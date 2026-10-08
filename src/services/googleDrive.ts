import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../lib/firebase';

declare const google: any;

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

// Google Auth Provider configured for Google Drive scope
const driveProvider = new GoogleAuthProvider();
driveProvider.addScope('https://www.googleapis.com/auth/drive.file');
driveProvider.setCustomParameters({
  prompt: 'select_account'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedDriveEmail: string | null = null;
let tokenClient: any = null;
let tokenExpiry: number = 0;

// Listen to auth changes and clear token when logged out
onAuthStateChanged(auth, (user: User | null) => {
  if (!user && !isSigningIn) {
    cachedAccessToken = null;
    cachedDriveEmail = null;
  } else if (user) {
    if (!cachedDriveEmail) {
      cachedDriveEmail = user.email;
    }
  }
});

export const setCachedAccessToken = (token: string | null, email?: string | null) => {
  cachedAccessToken = token;
  if (email !== undefined) {
    cachedDriveEmail = email;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getDriveEmail = (): string | null => {
  return cachedDriveEmail || auth.currentUser?.email || null;
};

export const hasDriveAuth = (): boolean => {
  return !!cachedAccessToken;
};

/**
 * 透過 Google 帳號彈窗登入並授權 Google 雲端硬碟 (Google Drive)
 * 支援選擇任意 Google 帳號 (如 crywood216@gmail.com)
 */
export const authorizeGoogleDrive = async (): Promise<{ accessToken: string; email: string | null; user: User }> => {
  try {
    isSigningIn = true;
    let result;
    try {
      result = await signInWithPopup(auth, driveProvider);
    } catch (popupErr: any) {
      if (popupErr?.code === 'auth/popup-blocked') {
        throw new Error('瀏覽器已封鎖快顯視窗，請允許本網站開啟彈出視窗後重試。');
      }
      if (popupErr?.code === 'auth/popup-closed-by-user') {
        throw popupErr;
      }
      console.warn('Drive provider sign-in notice, retrying with standard Google provider:', popupErr);
      const fallbackProvider = new GoogleAuthProvider();
      result = await signInWithPopup(auth, fallbackProvider);
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    cachedDriveEmail = result.user.email;

    return {
      accessToken: cachedAccessToken || '',
      email: cachedDriveEmail,
      user: result.user
    };
  } catch (err: any) {
    console.error('Google sign-in/authorization error:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
};

/**
 * 相容舊版 Client ID 初始化 (若有填寫)
 */
export const initDriveAuth = (clientId: string) => {
  if (tokenClient || !clientId || typeof google === 'undefined' || !google.accounts?.oauth2) return;
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response: any) => {
        if (response.error !== undefined) {
          throw response;
        }
        cachedAccessToken = response.access_token;
        tokenExpiry = Date.now() + response.expires_in * 1000;
      },
    });
  } catch (e) {
    console.warn('initDriveAuth fallback error:', e);
  }
};

/**
 * 確保已取得有效的 Google Drive 存取權限。
 * 若尚未授權，將自動開啟 Google 官方授權彈窗供使用者登入/核准。
 */
export const ensureAuth = async (): Promise<string> => {
  if (cachedAccessToken && (tokenExpiry === 0 || Date.now() < tokenExpiry - 60000)) {
    return cachedAccessToken;
  }

  // 若存在舊版 tokenClient
  if (tokenClient) {
    return new Promise((resolve, reject) => {
      tokenClient.callback = (response: any) => {
        if (response.error !== undefined) {
          reject(response);
          return;
        }
        cachedAccessToken = response.access_token;
        tokenExpiry = Date.now() + response.expires_in * 1000;
        resolve(cachedAccessToken!);
      };
      tokenClient.requestAccessToken({ prompt: cachedAccessToken ? '' : 'select_account' });
    });
  }

  // 官方 Firebase Auth Google 授權
  const authRes = await authorizeGoogleDrive();
  return authRes.accessToken;
};

export const getOrCreateFolder = async (folderName: string): Promise<string> => {
  const token = await ensureAuth();

  // Search for the folder
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchResponse.ok) throw new Error('搜尋雲端硬碟資料夾失敗，請確認授權權限。');
  const searchData = await searchResponse.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder if not found
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createResponse.ok) throw new Error('建立雲端硬碟預設資料夾失敗，請確認授權權限。');
  const createData = await createResponse.json();
  
  return createData.id;
};

/**
 * 上傳檔案至 Google 雲端硬碟
 * 支援大容量檔案與長影片 (Resumable Upload，完全解除 35MB 限制，267MB+ 檔案直傳)
 */
export const uploadToDrive = async (
  file: File,
  folderId?: string,
  onProgress?: (percent: number, message: string) => void
): Promise<DriveFile> => {
  const token = await ensureAuth();

  const metadata: any = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const isVideo = file.type.startsWith('video');
  const fileMB = (file.size / (1024 * 1024)).toFixed(1);

  // 針對大於 5MB 的檔案或影片，採用 Google Drive Resumable Upload 協定
  // 完全解除大小限制，支援 267MB+ 甚至數 GB 的長影片！
  if (file.size > 5 * 1024 * 1024 || isVideo) {
    onProgress?.(3, `正在建立 Google 雲端高速上傳通道 (${fileMB}MB)...`);

    const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size.toString(),
      },
      body: JSON.stringify(metadata),
    });

    if (!initResponse.ok) {
      if (initResponse.status === 401) {
        cachedAccessToken = null;
        throw new Error('Google 授權已過期，請重新點擊授權 Google 雲端硬碟帳號。');
      }
      const errorText = await initResponse.text();
      throw new Error(`初始化 Google 雲端上傳會話失敗 (${initResponse.status}): ${errorText}`);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('未取得 Google Drive 的可續傳上傳連結 (Location Header)');
    }

    // 使用 XMLHttpRequest 支援原生即時上傳進度回報
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 95) + 3);
          const uploadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
          onProgress?.(percent, `正在直傳至 Google 雲端硬碟... ${percent}% (${uploadedMB}MB / ${fileMB}MB)`);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resData = JSON.parse(xhr.responseText);
            onProgress?.(100, '上傳完成！正在設定檢視權限...');
            resolve(resData);
          } catch (err) {
            reject(new Error('無法解析 Google Drive 上傳回應資料'));
          }
        } else {
          if (xhr.status === 401) {
            cachedAccessToken = null;
          }
          reject(new Error(`上傳至 Google Drive 失敗 (${xhr.status}): ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('上傳至 Google 雲端硬碟時發生網路中斷，請確認連線後重試'));
      };

      xhr.send(file);
    });
  } else {
    // Standard multipart upload for files <= 5MB
    onProgress?.(20, `正在上傳至 Google 雲端硬碟 (${fileMB}MB)...`);
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedAccessToken = null;
        throw new Error('Google 授權已過期，請重新點擊授權 Google 雲端硬碟帳號。');
      }
      const errorText = await response.text();
      throw new Error(`上傳至雲端硬碟失敗 (${response.status}): ${errorText}`);
    }

    onProgress?.(100, '上傳完成！');
    return response.json();
  }
};

export const makeFilePublic = async (fileId: string): Promise<void> => {
  try {
    const token = await ensureAuth();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });

    if (!response.ok) {
      console.warn('Set public permission warning:', await response.text());
    }
  } catch (err) {
    console.warn('Set public permissions skipped or non-fatal:', err);
  }
};

export const deleteFromDrive = async (fileId: string): Promise<void> => {
  const token = await ensureAuth();

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error('Failed to delete from Google Drive');
  }
};

export const getDriveFileUrl = (fileId: string, isVideo: boolean = false): string => {
  if (isVideo) {
    // For videos, use the preview embed link
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  // For images, using the thumbnail endpoint is often more reliable than the /uc endpoint
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
};

/**
 * 將 Blob 轉為 Base64 字串
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const commaIdx = res.indexOf(',');
      resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
};

/**
 * 免登入上傳：透過使用者的 Google Apps Script (GAS) Web App 直接將檔案存入指定的 Google 雲端帳號
 * 支援超大檔案（分段自動上傳，完全解除 35MB 限制，200MB+ / 1GB 影片均可正常上傳）
 */
export const uploadViaGAS = async (
  gasUrl: string,
  file: File,
  onProgress?: (percent: number, message: string) => void
): Promise<{ id: string; url: string; name?: string }> => {
  const isVideo = file.type.startsWith('video');
  const fileMB = (file.size / (1024 * 1024)).toFixed(1);

  // 方案一：若檔案 <= 25MB，直接走單次 Base64 直傳
  if (file.size <= 25 * 1024 * 1024) {
    onProgress?.(25, `正在以高速模式上傳 (${fileMB}MB)...`);
    return uploadViaGASBase64(gasUrl, file, onProgress);
  }

  // 方案二：大容量檔案/長影片，啟用自動分段上傳 (Chunked Resumable Upload)
  onProgress?.(3, `影片大小為 ${fileMB}MB，正在建立大檔案分段傳輸通道...`);

  let locationUrl = '';
  try {
    const sessionRes = await fetch(gasUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'createResumableSession',
        filename: file.name,
        mimeType: file.type || (isVideo ? 'video/mp4' : 'application/octet-stream'),
        size: file.size,
      }),
    });

    if (!sessionRes.ok) {
      throw new Error(`GAS 服務連線回應異常 (${sessionRes.status})`);
    }

    const sessionData = await sessionRes.json();
    if (sessionData.status !== 'success' || !sessionData.locationUrl) {
      throw new Error(sessionData.message || 'Google Drive 未建立大檔案通道');
    }
    locationUrl = sessionData.locationUrl;
  } catch (initErr: any) {
    console.error('Create resumable session failed', initErr);
    throw new Error(
      `無法啟動 ${fileMB}MB 大檔案上傳通道：\n` +
      `請改用「Google 帳號直接授權直傳」模式，或至右上角「廚備設定」重新部署 GAS 網頁應用程式。\n` +
      `（詳細訊息：${initErr.message || initErr}）`
    );
  }

  // 分段傳輸 (Chunk Upload)
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const totalSize = file.size;
  let start = 0;

  while (start < totalSize) {
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunkBlob = file.slice(start, end);
    const rangeHeader = `bytes ${start}-${end - 1}/${totalSize}`;
    const currentPercent = Math.min(96, Math.round((start / totalSize) * 90) + 5);
    const uploadedMB = (end / (1024 * 1024)).toFixed(1);

    onProgress?.(
      currentPercent,
      `正在分段傳輸至 Google 雲端... ${currentPercent}% (${uploadedMB}MB / ${fileMB}MB)`
    );

    const chunkBase64 = await blobToBase64(chunkBlob);

    const chunkRes = await fetch(gasUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'uploadChunk',
        locationUrl: locationUrl,
        range: rangeHeader,
        mimeType: file.type || (isVideo ? 'video/mp4' : 'application/octet-stream'),
        filename: file.name,
        chunkBase64: chunkBase64,
      }),
    });

    if (!chunkRes.ok) {
      throw new Error(`分段傳輸時網路異常 (${chunkRes.status})，請確認網路連線`);
    }

    const chunkData = await chunkRes.json();
    if (chunkData.status === 'error') {
      throw new Error(`分段上傳失敗: ${chunkData.message}`);
    }

    if (chunkData.status === 'success' && chunkData.id) {
      onProgress?.(100, '上傳完成！');
      return {
        id: chunkData.id,
        url: chunkData.url || getDriveFileUrl(chunkData.id, isVideo),
        name: chunkData.name || file.name,
      };
    }

    start = end;
  }

  throw new Error('分段傳輸已全部送出，但未取得雲端檔案資訊');
};

/**
 * 舊版相容：Base64 單次上傳 (適用 <= 25MB 檔案)
 */
const uploadViaGASBase64 = async (
  gasUrl: string,
  file: File,
  onProgress?: (percent: number, message: string) => void
): Promise<{ id: string; url: string; name?: string }> => {
  onProgress?.(40, '正在讀取檔案內容...');
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const commaIdx = res.indexOf(',');
      resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });

  onProgress?.(70, '正在上傳至 Google Apps Script...');
  const payload = {
    filename: file.name,
    mimeType: file.type || (file.name.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream'),
    base64: base64Data,
  };

  const response = await fetch(gasUrl, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Apps Script 連線失敗 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (result.status !== 'success' || !result.id) {
    throw new Error(result.message || 'Google Apps Script 雲端儲存失敗，請檢查腳本設定與資料夾權限。');
  }

  const isVideo = file.type.startsWith('video');
  const displayUrl = result.url || getDriveFileUrl(result.id, isVideo);

  onProgress?.(100, '上傳完成！');
  return {
    id: result.id,
    url: displayUrl,
    name: result.name || file.name,
  };
};
