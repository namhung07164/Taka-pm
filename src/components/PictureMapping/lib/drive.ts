export async function uploadFileToDrive({
  accessToken,
  fileBlob,
  fileName,
  mimeType,
  fileId,
}: {
  accessToken: string;
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  fileId?: string;
}) {
  const metadata = {
    name: fileName,
    mimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileBlob);

  let uploadUrl = '';
  let method = 'POST';

  if (fileId) {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
    method = 'PATCH';
  } else {
    // 1. Check if the file already exists (to overwrite it)
    const query = encodeURIComponent(`name='${fileName}' and trashed=false`);
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listRes.ok) {
      throw new Error('Failed to list files from Google Drive');
    }

    const listData = await listRes.json();
    const existingFile = listData.files && listData.files.length > 0 ? listData.files[0] : null;

    if (existingFile) {
      // Overwrite existing file
      uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
      method = 'PATCH';
    } else {
      // Create new file
      uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      method = 'POST';
    }
  }

  const uploadRes = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!uploadRes.ok) {
    const errorData = await uploadRes.text();
    console.error('Failed to upload file:', errorData);
    throw new Error('Failed to upload file to Google Drive');
  }

  return await uploadRes.json();
}
