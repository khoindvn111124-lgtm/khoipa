export async function onRequest(context) {
    const { request } = context;
    const urlObj = new URL(request.url);
    const text = urlObj.searchParams.get('q') || '';

    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=86400' // Cache 1 ngày
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }

    if (!text) {
        return new Response(JSON.stringify({ translated: '' }), { headers: corsHeaders });
    }

    try {
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(translateUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Google Translate API returned status ${response.status}`);
        }

        const data = await response.json();
        const translatedText = data[0]?.map(s => s[0]).join('') || text;

        return new Response(JSON.stringify({ translated: translatedText }), { headers: corsHeaders });
    } catch (error) {
        // Fallback trả về text gốc nếu lỗi
        return new Response(JSON.stringify({ translated: text, error: error.message }), { headers: corsHeaders });
    }
}