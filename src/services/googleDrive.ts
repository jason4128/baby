
declare const google: any;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiry: number = 0;

export const initDriveAuth = (clientId: string) => {
  if (tokenClient) return;
  
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (response: any) => {
      if (response.error !== undefined) {
        throw response;
      }
      accessToken = response.access_token;
      tokenExpiry = Date.now() + response.expires_in * 1000;
    },
  });
};

export const ensureAuth = async (): Promise<string> => {
  if (accessToken && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response: any) => {
      if (response.error !== undefined) {
        reject(response);
        return;
      }
      accessToken = response.access_token;
      tokenExpiry = Date.now() + response.expires_in * 1000;
      resolve(accessToken!);
    };
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'select_account' });
  });
};

export const uploadToDrive = async (file: File): Promise<DriveFile> => {
  const token = await ensureAuth();

  const metadata = {
    name: file.name,
    mimeType: file.type,
  };

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
    throw new Error('Failed to upload to Google Drive');
  }

  return response.json();
};

export const deleteFromDrive = async (fileId: string): Promise<void> => {
  const token = await ensureAuth();

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete from Google Drive');
  }
};

export const getDriveFileUrl = (fileId: string): string => {
  // Direct link for embedding (works for most images/videos if permissions allow)
  return `https://drive.google.com/uc?id=${fileId}&export=view`;
};
