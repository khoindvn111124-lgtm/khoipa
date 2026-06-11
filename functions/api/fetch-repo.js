export async function onRequest(context) {
    const { request } = context;
    const urlObj = new URL(request.url);
    const repoUrl = urlObj.searchParams.get('url');

    if (!repoUrl) {
        return new Response(JSON.stringify({ error: 'Thiếu URL repo' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // Cấu hình Cache API của Cloudflare để lưu trữ kết quả fetch repo trong 10 phút
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const response = await fetch(repoUrl, {
            headers: {
                'User-Agent': 'Esign/1.0 (iPhone; iOS 16.0; Scale/3.00)',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `Repo trả về lỗi HTTP ${response.status}` }), {
                status: 502,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const text = await response.text();
        
        // Kiểm tra nếu response là HTML (repo chết) thay vì JSON
        if (text.trim().startsWith('<')) {
            return new Response(JSON.stringify({ error: 'Repo này đã ngừng hoạt động (trả về HTML thay vì JSON)' }), {
                status: 502,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Parse JSON để kiểm tra tính hợp lệ
        let jsonData;
        try {
            jsonData = JSON.parse(text);
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Dữ liệu không phải JSON hợp lệ' }), {
                status: 502,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const finalResponse = new Response(JSON.stringify(jsonData), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=600' // Cache 10 phút ở phía client và Cloudflare Edge
            }
        });

        // Lưu vào Cloudflare Cache
        context.waitUntil(cache.put(cacheKey, finalResponse.clone()));

        return finalResponse;
    } catch (error) {
        return new Response(JSON.stringify({ error: `Không thể kết nối đến repo: ${error.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}