import { NextRequest, NextResponse } from 'next/server';

function parseDuration(iso: string) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] || '0'), mn = parseInt(m[2] || '0'), s = parseInt(m[3] || '0');
  if (h > 0) return `${h}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mn}:${String(s).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-youtube-key') || process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ videos: [], nextPageToken: null });

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') || '아기 육아';
  const maxResults = Math.min(parseInt(sp.get('maxResults') || '12'), 25);
  const order = sp.get('order') || 'relevance';
  const pageToken = sp.get('pageToken') || '';

  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    const searchParams: Record<string, string> = {
      part: 'snippet', q, type: 'video',
      maxResults: String(maxResults),
      relevanceLanguage: 'ko', regionCode: 'KR',
      order, key: apiKey,
    };
    if (pageToken) searchParams.pageToken = pageToken;
    Object.entries(searchParams).forEach(([k, v]) => searchUrl.searchParams.set(k, v));

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();
    if (searchData.error) {
      return NextResponse.json({ videos: [], error: searchData.error.message }, { status: 400 });
    }

    const items: Record<string, unknown>[] = searchData.items || [];
    const videoIds = items
      .map(i => (i.id as Record<string, string>)?.videoId)
      .filter(Boolean).join(',');

    let detailsMap: Record<string, Record<string, unknown>> = {};
    if (videoIds) {
      const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      Object.entries({ part: 'statistics,contentDetails', id: videoIds, key: apiKey })
        .forEach(([k, v]) => detailsUrl.searchParams.set(k, v));
      const detailsRes = await fetch(detailsUrl.toString());
      const detailsData = await detailsRes.json();
      (detailsData.items || []).forEach((i: Record<string, unknown>) => {
        detailsMap[i.id as string] = i;
      });
    }

    const videos = items.map(item => {
      const vid = (item.id as Record<string, string>)?.videoId || '';
      const sn = (item.snippet as Record<string, unknown>) || {};
      const d = detailsMap[vid] || {};
      const thumbs = (sn.thumbnails as Record<string, Record<string, string>>) || {};
      return {
        id: vid,
        title: (sn.title as string) || '',
        thumbnail: thumbs.medium?.url || thumbs.default?.url || '',
        channelTitle: (sn.channelTitle as string) || '',
        publishedAt: (sn.publishedAt as string) || '',
        viewCount: ((d.statistics as Record<string, string>)?.viewCount) || '0',
        duration: parseDuration(((d.contentDetails as Record<string, string>)?.duration) || ''),
      };
    });

    return NextResponse.json({
      videos,
      nextPageToken: searchData.nextPageToken || null,
      totalResults: searchData.pageInfo?.totalResults || 0,
    });
  } catch (err) {
    return NextResponse.json({ videos: [], error: String(err) }, { status: 500 });
  }
}
