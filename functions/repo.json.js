export async function onRequest(context) {
    const { request, env } = context;
    
    const urlObj = new URL(request.url);
    const forceUpdate = urlObj.searchParams.get('update') === 'true';
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;

    // 1. Kiểm tra Cloudflare CDN Cache trước (Không tốn request KV)
    let cachedResponse = !forceUpdate ? await cache.match(cacheKey) : null;
    if (cachedResponse) {
        return cachedResponse;
    }

    // 2. Nếu không có CDN Cache, thử đọc từ Cloudflare KV
    if (env.KHOIPA_KV) {
        try {
            const kvData = await env.KHOIPA_KV.get('repo_json');
            if (kvData) {
                const response = new Response(kvData, {
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=43200' // Cho phép Cloudflare CDN cache lại trong 12 giờ
                    }
                });
                // Lưu vào CDN Cache để các request sau không cần đọc KV nữa
                context.waitUntil(cache.put(cacheKey, response.clone()));
                return response;
            }
        } catch (kvError) {
            console.error('Lỗi đọc từ KV:', kvError.message);
        }
    }

    // 3. Fallback nếu không có KV hoặc KV trống: Tự động fetch trực tiếp (như cũ)
    try {
        // 1. Lấy danh sách repo từ khoipa.txt
        const reposUrl = new URL('/khoipa.txt', request.url);
        const reposResponse = await fetch(reposUrl.toString());
        let repos = [];
        if (reposResponse.ok) {
            const text = await reposResponse.text();
            repos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        } else {
            // Fallback
            repos = [
                "https://repository.apptesters.org",
                "https://appstore.sidelix.vip/repos/esign.php",
                "https://ipa.thuthuatjb.com/repo",
                "http://ittza7aa.com/repo.json",
                "https://ipa.cypwn.xyz/cypwn.json",
                "https://fastsign.dev/repo.json",
                "https://api.unkeyapp.com/v1/application/source.json"
            ];
        }

        // 2. Fetch song song tất cả các repo
        const allApps = [];
        const fetchPromises = repos.map(async (repoUrl) => {
            try {
                // Sử dụng AbortController để giới hạn timeout 8 giây cho mỗi repo
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                const response = await fetch(repoUrl, {
                    headers: {
                        'User-Agent': 'Esign/1.0 (iPhone; iOS 16.0; Scale/3.00)',
                        'Accept': 'application/json, text/plain, */*'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) return;
                const text = await response.text();
                if (text.trim().startsWith('<')) return; // Bỏ qua nếu là HTML

                const data = JSON.parse(text);
                let apps = [];
                if (data.apps && Array.isArray(data.apps)) apps = data.apps;
                else if (data.packages && Array.isArray(data.packages)) apps = data.packages;
                else if (Array.isArray(data)) apps = data;

                if (apps.length > 0) {
                    allApps.push(...apps);
                }
            } catch (e) {
                console.warn(`Lỗi fetch repo ${repoUrl}:`, e.message);
            }
        });

        await Promise.allSettled(fetchPromises);

        // 3. Lọc trùng và giữ lại phiên bản cao nhất
        const compareVersions = (v1, v2) => {
            if (!v1) return -1;
            if (!v2) return 1;
            const parts1 = v1.toString().split('.').map(Number);
            const parts2 = v2.toString().split('.').map(Number);
            const len = Math.max(parts1.length, parts2.length);
            for (let i = 0; i < len; i++) {
                const p1 = parts1[i] || 0;
                const p2 = parts2[i] || 0;
                if (p1 > p2) return 1;
                if (p1 < p2) return -1;
            }
            return 0;
        };

        const uniqueAppsMap = new Map();
        allApps.forEach(app => {
            const key = app.bundleIdentifier || app.bundleID || app.name;
            if (!key) return;
            const existing = uniqueAppsMap.get(key);
            if (!existing) {
                uniqueAppsMap.set(key, app);
            } else {
                const vExisting = existing.version || '0';
                const vApp = app.version || '0';
                if (compareVersions(vApp, vExisting) > 0) {
                    uniqueAppsMap.set(key, app);
                }
            }
        });

        const mergedApps = Array.from(uniqueAppsMap.values());

        // 4. Tạo cấu trúc repo.json hoàn chỉnh
        const repoJson = {
            name: "Kho IPA Store Tổng Hợp",
            identifier: "com.khoipa.store",
            description: `Kho ứng dụng IPA tổng hợp từ nhiều nguồn, tự động cập nhật và lọc trùng phiên bản mới nhất. Tổng cộng ${mergedApps.length} ứng dụng.`,
            apps: mergedApps
        };

        const finalResponse = new Response(JSON.stringify(repoJson), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=43200' // Cache 12 giờ
            }
        });

        // Lưu vào Cloudflare Cache
        context.waitUntil(cache.put(cacheKey, finalResponse.clone()));

        return finalResponse;
    } catch (error) {
        return new Response(JSON.stringify({ error: `Lỗi tạo repo.json: ${error.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}