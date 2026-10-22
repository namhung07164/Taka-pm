interface Env {}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const url = new URL(context.request.url);
  const fileId = url.searchParams.get('id');

  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid Google Drive ID' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const fetchHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/pdf,*/*',
    });
    const clientRange = context.request.headers.get('range');
    if (clientRange) {
      fetchHeaders.set('range', clientRange);
    }

    const response = await fetch(driveUrl, {
      headers: fetchHeaders,
      redirect: 'follow',
    });

    if (!response.ok && response.status !== 206) {
      return new Response('Failed to retrieve file from Google Drive', {
        status: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const ct = response.headers.get('content-type') || 'application/pdf';
    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    responseHeaders.set('Content-Type', ct);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    responseHeaders.set('Content-Disposition', 'inline; filename="document.pdf"');

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }
    const cl = response.headers.get('content-length');
    if (cl) {
      responseHeaders.set('Content-Length', cl);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Drive fetch error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
};
