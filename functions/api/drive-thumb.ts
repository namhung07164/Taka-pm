interface Env {}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const url = new URL(context.request.url);
  const fileId = url.searchParams.get('id');
  const sz = url.searchParams.get('sz') || 'w1600';

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
    const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=${sz}`;
    let response = await fetch(thumbUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok || (response.headers.get('content-type') || '').includes('text/html')) {
      const fallbackLh3 = `https://lh3.googleusercontent.com/d/${fileId}=${sz}`;
      response = await fetch(fallbackLh3, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });
    }

    const ct = response.headers.get('content-type') || 'image/jpeg';
    if (!response.ok || ct.includes('text/html')) {
      return new Response('Thumbnail not found', { status: 404 });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Content-Type', ct);
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Drive thumb error' }), {
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
