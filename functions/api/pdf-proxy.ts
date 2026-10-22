interface Env {}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid URL' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const fetchHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/pdf,image/*,application/octet-stream,*/*',
    });

    // Forward Range header from client so PDF.js can stream individual pages on demand
    const clientRange = context.request.headers.get('range');
    if (clientRange) {
      fetchHeaders.set('range', clientRange);
    }

    const upstreamRes = await fetch(targetUrl, {
      headers: fetchHeaders,
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return new Response(`Upstream fetch failed with status: ${upstreamRes.status}`, {
        status: upstreamRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const ct = upstreamRes.headers.get('content-type') || 'application/pdf';
    const isPdf = ct.includes('pdf') || /\.pdf($|\?)/i.test(targetUrl);

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    responseHeaders.set('Content-Type', ct);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    if (isPdf) {
      responseHeaders.set('Content-Disposition', 'inline; filename="document.pdf"');
    }

    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const cl = upstreamRes.headers.get('content-length');
    if (cl) {
      responseHeaders.set('Content-Length', cl);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status, // Preserve 206 for partial content or 200 for full
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Proxy error' }), {
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
