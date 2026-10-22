import { setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { getS3Sdk, R2Credentials } from '../PictureMapping/lib/r2Upload';

export interface R2TemplateItem {
  key: string;
  fileName: string;
  size: number;
  lastModified?: Date;
  folder: string;
  isConfigJson?: boolean;
}

export async function listR2TemplatesInFolder(
  creds: R2Credentials,
  selectedFolder: string
): Promise<R2TemplateItem[]> {
  const { S3Client, ListObjectsV2Command } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  const listCmd = new ListObjectsV2Command({
    Bucket: creds.bucketName,
    Prefix: selectedFolder,
  });

  const res = await s3.send(listCmd);
  return (res.Contents || [])
    .filter((obj) => obj.Key && !obj.Key.endsWith('/'))
    .map((obj) => {
      const key = obj.Key!;
      const parts = key.split('/');
      const fileName = parts.pop() || key;
      const folder = parts.join('/') + '/';
      return {
        key,
        fileName,
        size: obj.Size || 0,
        lastModified: obj.LastModified,
        folder,
        isConfigJson: fileName.endsWith('.json'),
      };
    });
}

export async function downloadR2TemplateObject(
  creds: R2Credentials,
  key: string
): Promise<Response> {
  const { S3Client, GetObjectCommand, getSignedUrl } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  const getCmd = new GetObjectCommand({
    Bucket: creds.bucketName,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });
  const fetchRes = await fetch(signedUrl);
  if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}: Không thể tải file từ R2.`);
  return fetchRes;
}

export async function deleteR2TemplateObject(
  creds: R2Credentials,
  key: string
): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  await s3.send(
    new DeleteObjectCommand({
      Bucket: creds.bucketName,
      Key: key,
    })
  );
}

export async function uploadR2TemplatePackage(params: {
  creds: R2Credentials;
  folder: string;
  name: string;
  activeTab: string;
  saveOption: 'data_file' | 'template_file' | 'mapping_json' | 'all';
  uploadFile: File | null;
  file: File | null;
  templateFile: File | null;
  mapping: Record<string, string>;
  constantMapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
}): Promise<void> {
  const {
    creds,
    folder,
    name,
    activeTab,
    saveOption,
    uploadFile,
    file,
    templateFile,
    mapping,
    constantMapping,
    keepOriginal,
  } = params;

  const { S3Client, PutObjectCommand, getSignedUrl } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });

  const uploadObject = async (key: string, body: Blob | File | string, contentType: string) => {
    const putCmd = new PutObjectCommand({
      Bucket: creds.bucketName,
      Key: key,
      ContentType: contentType,
    });
    const signedUrl = await getSignedUrl(s3, putCmd, { expiresIn: 3600 });
    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Upload failed for ${key}`);
  };

  if (uploadFile) {
    const fileKey = `${folder}${uploadFile.name}`;
    await uploadObject(fileKey, uploadFile, uploadFile.type || 'application/octet-stream');
  }

  if (saveOption === 'all' || saveOption === 'data_file') {
    const targetFile = file || templateFile;
    if (targetFile && !uploadFile) {
      const fileKey = `${folder}${name}_${targetFile.name}`;
      await uploadObject(fileKey, targetFile, targetFile.type || 'application/octet-stream');
    }
  }

  if (saveOption === 'all' || saveOption === 'mapping_json') {
    const jsonKey = `${folder}${name}_mapping.json`;
    const jsonContent = JSON.stringify(
      {
        version: '1.0',
        tab: activeTab,
        templateName: name,
        timestamp: Date.now(),
        mapping,
        constantMapping,
        keepOriginal,
      },
      null,
      2
    );
    await uploadObject(
      jsonKey,
      new Blob([jsonContent], { type: 'application/json' }),
      'application/json'
    );
  }
}

export async function saveR2ConfigToStorageAndCloud(configData: R2Credentials): Promise<void> {
  localStorage.setItem('r2_account_id', configData.accountId);
  localStorage.setItem('r2_bucket_name', configData.bucketName);
  localStorage.setItem('r2_access_key', configData.accessKeyId);
  localStorage.setItem('r2_access_key_id', configData.accessKeyId);
  localStorage.setItem('r2_secret_key', configData.secretAccessKey);
  localStorage.setItem('r2_secret_access_key', configData.secretAccessKey);
  localStorage.setItem('taka_cache_r2_config_v1', JSON.stringify(configData));

  useAppStore.getState().setR2Config(configData);
  await setDoc(
    doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'r2_credentials'),
    configData
  );
}
