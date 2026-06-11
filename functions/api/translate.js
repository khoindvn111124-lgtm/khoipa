export async function onRequest(context) {
    const { request } = context;
    const urlObj = new URL(request.url);
    const text = urlObj.searchParams.get('q');

    if (!text) {
        return new Response(JSON.stringify({ error: 'Thiếu text' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // Cấu hình Cache API của Cloudflare để lưu trữ kết quả dịch trong 1 ngày (86400 giây)
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(translateUrl);
        if (!response.ok) {
            throw new Error('Lỗi Google Translate API');
        }
        const data = await response.json();
        const translated = data[0]?.map(s => s[0]).join('') || text;

        const finalResponse = new Response(JSON.stringify({ original: text, translated }), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400' // Cache 1 ngày
            }
        });

        // Lưu vào Cloudflare Cache
        context.waitUntil(cache.put(cacheKey, finalResponse.clone()));

        return finalResponse;
    } catch (error) {
        return new Response(JSON.stringify({ original: text, translated: text }), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}