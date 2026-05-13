
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

export const getOrCreateFolder = async (folderName: string): Promise<string> => {
  const token = await ensureAuth();

  // Search for the folder
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchResponse.ok) throw new Error('Search folder failed');
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

  if (!createResponse.ok) throw new Error('Create folder failed');
  const createData = await createResponse.json();
  
  return createData.id;
};

export const uploadToDrive = async (file: File, folderId?: string): Promise<DriveFile> => {
  const token = await ensureAuth();

  const metadata: any = {
    name: file.name,
    mimeType: file.type,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

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

export const makeFilePublic = async (fileId: string): Promise<void> => {
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
    throw new Error('Failed to set public permissions on drive file');
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

  if (!response.ok) {
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
