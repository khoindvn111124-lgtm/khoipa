// Hàm so sánh phiên bản
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

export async function onRequest(context) {
    const { request, env } = context;
    const urlObj = new URL(request.url);

    // Cấu hình CORS headers
    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=600' // Cache 10 phút ở phía client và Cloudflare Edge
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }

    // Sử dụng Cache API của Cloudflare để lưu kết quả gộp trong 10 phút
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        // 1. Đọc danh sách repo từ file khoipa.txt tĩnh trên host
        const reposUrl = `${urlObj.origin}/khoipa.txt`;
        const reposResponse = await fetch(reposUrl);
        let repos = [];
        if (reposResponse.ok) {
            const text = await reposResponse.text();
            repos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        } else {
            // Fallback nếu không đọc được file khoipa.txt
            repos = [
                "https://repository.apptesters.org",
                "https://appstore.sidelix.vip/repos/esign.php",
                "https://ipa.thuthuatjb.com/repo",
                "http://ittza7aa.com/repo.json",
                "https://ipa.cypwn.xyz/cypwn.json",
                "https://fastsign.dev/repo.json",
                "https://api.unkeyapp.com/v1/application/source.json",
                "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/repo.flekstore.json",
                "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/repo.buildstore.json",
                "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/ipaomtkg.json",
                "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/ipaomtk.json"
            ];
        }

        // 2. Fetch song song tất cả các repo
        const allApps = [];
        const fetchPromises = repos.map(async (repoUrl) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // Timeout 8 giây cho mỗi repo để tránh treo lâu

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
                // Bỏ qua lỗi của từng repo riêng lẻ
            }
        });

        await Promise.allSettled(fetchPromises);

        // 3. Lọc trùng và giữ lại phiên bản cao nhất, đồng thời tối ưu hóa dung lượng app
        const uniqueAppsMap = new Map();
        allApps.forEach(app => {
            const key = app.bundleIdentifier || app.bundleID || app.name;
            if (!key) return;

            // Tối ưu hóa đối tượng app để giảm dung lượng file JSON
            const optimizedApp = {
                name: app.name || 'Ứng dụng',
                bundleIdentifier: app.bundleIdentifier || app.bundleID || key,
                version: app.version || '1.0',
                versionDate: app.versionDate || app.date || app.addedDate || app.timestamp || '',
                size: app.size || 0,
                iconURL: app.iconURL || app.icon || '',
                downloadURL: app.downloadURL || app.ipaURL || app.url || app.down || ''
            };

            // Cắt ngắn mô tả nếu quá dài để tiết kiệm dung lượng
            let desc = app.localizedDescription || app.description || app.subtitle || '';
            if (desc) {
                desc = desc.replace(/unkeyapp/gi, '').replace(/unkey/gi, '').trim();
                if (desc.length > 150) {
                    desc = desc.substring(0, 147) + '...';
                }
                optimizedApp.localizedDescription = desc;
            }

            const existing = uniqueAppsMap.get(key);
            if (!existing) {
                uniqueAppsMap.set(key, optimizedApp);
            } else {
                const vExisting = existing.version || '0';
                const vApp = optimizedApp.version || '0';
                if (compareVersions(vApp, vExisting) > 0) {
                    uniqueAppsMap.set(key, optimizedApp);
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

        const finalResponse = new Response(JSON.stringify(repoJson), { headers: corsHeaders });

        // Lưu vào Cloudflare Cache
        context.waitUntil(cache.put(cacheKey, finalResponse.clone()));

        return finalResponse;

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
