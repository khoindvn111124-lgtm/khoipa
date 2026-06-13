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

// Hàm lọc và trích xuất tính năng mod/hack thông minh, loại bỏ mô tả gốc rườm rà
function cleanAndExtractFeatures(desc) {
    if (!desc) return '';
    
    // 1. Loại bỏ các từ khóa rác/quảng cáo của unkey
    desc = desc.replace(/unkeyapp/gi, '').replace(/unkey/gi, '').trim();
    
    // 2. Loại bỏ các thông tin cấu hình thiết bị rườm rà để tiết kiệm dung lượng
    desc = desc.replace(/📱\s*Thiết bị xử lý[\s\S]*?AppStore/gi, '');
    desc = desc.replace(/🔑\s*THÔNG TIN MOD\/HACK[\s\S]*?AppStore/gi, '');
    desc = desc.replace(/ID ứng dụng:[\s\S]*?Khu giải mã: \S+/gi, '');
    desc = desc.replace(/🔒\s*THÔNG TIN MOD\/HACK[\s\S]*?AppStore/gi, '');
    desc = desc.replace(/👉\s*Liên kết AppStore[\s\S]*?$/gi, '');
    
    // 3. Nếu có phần "MÔ TẢ ỨNG DỤNG GỐC" hoặc tương tự, hãy cắt bỏ nó đi vì nó rất dài và không cần thiết
    const originalAppDescIndex = desc.search(/MÔ TẢ ỨNG DỤNG GỐC|Giới thiệu ứng dụng|About this app/i);
    if (originalAppDescIndex !== -1) {
        // Tìm xem sau đó có phần tính năng mod không
        const modFeaturesIndex = desc.search(/TÍNH NĂNG MOD|Tính năng Hack|Mod Features|Tính năng|Mod:|Hack:|Zalo - chạy nền/i);
        if (modFeaturesIndex > originalAppDescIndex) {
            // Lấy từ phần tính năng mod trở đi
            desc = desc.substring(modFeaturesIndex);
        } else {
            // Nếu không tìm thấy từ khóa mod rõ ràng, cắt bỏ phần mô tả gốc
            desc = desc.substring(0, originalAppDescIndex);
        }
    }
    
    return desc.trim();
}

export async function onRequest(context) {
    const { request, env } = context;
    const urlObj = new URL(request.url);
    const isPing = urlObj.searchParams.get('ping') === 'true';

    // Cấu hình CORS headers
    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=43200' // Cache 12 giờ ở phía client và Cloudflare Edge
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

    // Nếu chỉ là ping để giữ cache hoặc kiểm tra, trả về phản hồi cực ngắn để tránh quá tải dung lượng
    if (isPing || request.method === 'HEAD') {
        // Vẫn chạy ngầm việc cập nhật cache nếu cần
        const cacheKey = new Request(urlObj.origin + urlObj.pathname, request);
        const cache = caches.default;
        
        // Kích hoạt fetch ngầm để cập nhật cache nếu cache hết hạn
        context.waitUntil(
            cache.match(cacheKey).then(async (cached) => {
                if (!cached) {
                    // Tự gọi hàm gộp để ghi vào cache, thêm header đặc biệt hoặc query param để tránh đệ quy vô hạn
                    const updateUrl = new URL(urlObj.origin + urlObj.pathname);
                    updateUrl.searchParams.set('internal_update', 'true');
                    await fetch(updateUrl.toString());
                }
            })
        );

        return new Response(JSON.stringify({ status: "OK", message: "Ping thành công, cache đang được cập nhật ngầm!" }), {
            headers: corsHeaders
        });
    }

    // Tránh đệ quy vô hạn khi fetch ngầm
    const isInternalUpdate = urlObj.searchParams.get('internal_update') === 'true';

    // ── Đọc tham số query cho website (phân trang, tìm kiếm, danh mục) ──
    const pageParam = urlObj.searchParams.get('page');
    const sizeParam = urlObj.searchParams.get('size');
    const searchQuery = urlObj.searchParams.get('search') || '';
    const categoryParam = urlObj.searchParams.get('category') || '';
    const isWebRequest = pageParam !== null || sizeParam !== null || searchQuery !== '' || categoryParam !== '';

    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(sizeParam, 10) || 50));

    // Cache key gốc (không có tham số) — dùng để lưu toàn bộ dữ liệu đã gộp
    const baseCacheKey = new Request(urlObj.origin + urlObj.pathname, request);
    const cache = caches.default;

    // ── Hàm danh mục (giống y hệt frontend) ──
    const CATEGORIES = [
        { key: 'game', rules: /game|play|trò chơi|sport|football|soccer|racing|puzzle|adventure|action|casino|slot|poker|card|chess|board|rpg|mmorpg|battle|fight|war|gun|shoot|zombie|minecraft|roblox|pubg|garena|league|valorant|clash|dragon|hero|quest|dungeon|candy|crush|angry|bird|temple|run|subway|surfer|sonic|mario|pokemon|car|racing|drift/i },
        { key: 'music', rules: /music|nhạc|audio|sound|beat|melody|tune|song|sing|karaoke|piano|guitar|drum|dj|mix|radio|podcast|spotify|deezer|nhaccuatui|zing|mp3|tone|ring/i },
        { key: 'video', rules: /video|phim|movie|film|tv|show|anime|netflix|youtube|tiktok|stream|watch|player|cinema|drama|series|clip|reel|shorts|iptv|live|broadcast/i },
        { key: 'social', rules: /chat|social|message|nhắn|zalo|facebook|messenger|instagram|twitter|telegram|wechat|line|viber|snap|discord|forum|dating|hẹn|meet|call|video call|facetime|whatsapp|tinder|bumble/i },
        { key: 'photo', rules: /photo|ảnh|camera|selfie|beauty|edit|filter|collage|design|art|draw|paint|photoshop|lightroom|canva|figma|illustrator|procreate|pic|image|gallery|album/i },
        { key: 'utility', rules: /utility|util|clean|boost|battery|wifi|scan|qr|file|manager|backup|cloud|vpn|proxy|adblock|keyboard|launcher|lock|wallpaper|widget|theme|icon|pack|shortcut|automation|torrent|download|unzip|compress|converter/i },
        { key: 'productivity', rules: /note|ghi chú|calendar|lịch|remind|nhắc|todo|task|mail|email|office|word|excel|powerpoint|docs|sheet|slide|pdf|scan|print|translate|dịch|ai|assistant|trợ lý|clock|alarm|timer|stopwatch|focus|pomodoro/i },
        { key: 'health', rules: /health|sức khỏe|fitness|workout|exercise|tập|gym|yoga|medit|sleep|ngủ|run|walk|step|calorie|diet|ăn|water|nước|heart|blood|pressure|period|cycle/i },
        { key: 'shopping', rules: /shop|mua|bán|store|cửa hàng|market|chợ|lazada|shoppe|tiki|sendo|amazon|ebay|deal|discount|giảm|giá|coupon|voucher|fashion|thời trang|cloth|quần áo|shoe|giày/i },
        { key: 'education', rules: /education|giáo dục|học|learn|study|school|trường|university|đại học|course|khóa học|quiz|test|exam|thi|book|sách|language|ngôn ngữ|english|tiếng anh|math|toán|science|code|program/i },
        { key: 'finance', rules: /bank|ngân hàng|finance|tài chính|money|tiền|pay|thanh toán|invest|đầu tư|stock|chứng khoán|crypto|bitcoin|blockchain|wallet|ví|momo|zalopay|vnpay|tax|thuế|budget|expense|chi tiêu/i },
        { key: 'travel', rules: /travel|du lịch|tour|hotel|khách sạn|flight|vé|bus|xe|taxi|grab|be|map|bản đồ|gps|navigate|đường|guide|hướng dẫn|booking|agoda|airbnb|trip/i },
        { key: 'books', rules: /book|sách|news|tin tức|báo|magazine|tạp chí|read|đọc|comic|truyện|manga|novel|tiểu thuyết|library|thư viện|rss|feed|blog|article/i },
        { key: 'food', rules: /food|ăn|đồ ăn|thức uống|drink|nấu|cook|recipe|công thức|restaurant|nhà hàng|order|đặt|delivery|giao|pizza|burger|coffee|cà phê|trà sữa|milk tea/i }
    ];

    function categorizeApp(app) {
        const searchText = `${app.name || ''} ${app.bundleIdentifier || ''} ${app.localizedDescription || ''}`.toLowerCase();
        for (const cat of CATEGORIES) {
            if (cat.rules.test(searchText)) return cat.key;
        }
        return 'other';
    }

    // ── Hàm lấy toàn bộ dữ liệu đã gộp (từ cache hoặc fetch mới) ──
    async function getMergedData() {
        // Kiểm tra cache gốc trước (Bỏ qua cache nếu có tham số clear_cache)
        const clearCache = urlObj.searchParams.get('clear_cache') === 'true';
        let cached = await cache.match(baseCacheKey);
        if (cached && !clearCache) {
            const data = await cached.json();
            return data.apps || [];
        }

        // Fetch và gộp tất cả repo
        // 1. Đọc danh sách repo từ file khoipa.txt tĩnh trên host
        const reposUrl = `${urlObj.origin}/khoipa.txt`;
        const reposResponse = await fetch(reposUrl);
        let repos = [];
        if (reposResponse.ok) {
            const text = await reposResponse.text();
            repos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        }

        if (repos.length === 0) {
            console.log("Cảnh báo: khoipa.txt trống hoặc không tải được.");
        }

        // 2. Fetch song song tất cả các repo
        const allApps = [];
        const fetchPromises = repos.map(async (repoUrl) => {
            try {
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
                if (text.trim().startsWith('<')) return;

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

        // 3. Lọc trùng, giữ phiên bản cao nhất
        const uniqueAppsMap = new Map();
        allApps.forEach(app => {
            const key = app.bundleIdentifier || app.bundleID || app.name;
            if (!key) return;

            const optimizedApp = {
                name: app.name || 'Ứng dụng',
                bundleIdentifier: app.bundleIdentifier || app.bundleID || key,
                version: app.version || '1.0',
                versionDate: app.versionDate || app.date || app.addedDate || app.timestamp || '',
                size: app.size || 0,
                iconURL: app.iconURL || app.icon || '',
                downloadURL: app.downloadURL || app.ipaURL || app.url || app.down || ''
            };

            let desc = app.localizedDescription || app.description || app.subtitle || '';
            if (desc) {
                optimizedApp.localizedDescription = cleanAndExtractFeatures(desc);
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

        // 4. Sắp xếp theo ngày mới nhất lên đầu
        mergedApps.sort((a, b) => {
            const getAppDate = (app) => {
                const dateStr = app.versionDate || '';
                if (!dateStr) return 0;
                if (!isNaN(dateStr)) return Number(dateStr);
                const parsed = Date.parse(dateStr);
                return isNaN(parsed) ? 0 : parsed;
            };
            const dateA = getAppDate(a);
            const dateB = getAppDate(b);
            if (dateA !== dateB) return dateB - dateA;
            return (a.name || '').localeCompare(b.name || '');
        });

        // 5. Lưu toàn bộ vào cache gốc (12 giờ)
        const fullRepoJson = {
            name: "Kho IPA Store Tổng Hợp",
            identifier: "com.khoipa.store",
            description: `Kho ứng dụng IPA tổng hợp từ nhiều nguồn, tự động cập nhật và lọc trùng phiên bản mới nhất. Tổng cộng ${mergedApps.length} ứng dụng.`,
            apps: mergedApps
        };

        const fullResponse = new Response(JSON.stringify(fullRepoJson), { headers: corsHeaders });
        context.waitUntil(cache.put(baseCacheKey, fullResponse.clone()));

        return mergedApps;
    }

    try {
        const allMergedApps = await getMergedData();

        // Nếu là request từ website (có tham số phân trang/tìm kiếm/danh mục)
        if (isWebRequest) {
            let filteredApps = allMergedApps;

            // Lọc theo danh mục
            if (categoryParam && categoryParam !== 'all') {
                filteredApps = filteredApps.filter(app => categorizeApp(app) === categoryParam);
            }

            // Lọc theo từ khóa tìm kiếm
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                filteredApps = filteredApps.filter(app =>
                    (app.name && app.name.toLowerCase().includes(q)) ||
                    (app.bundleIdentifier && app.bundleIdentifier.toLowerCase().includes(q))
                );
            }

            const totalApps = filteredApps.length;
            const totalPages = Math.ceil(totalApps / pageSize);
            const startIdx = (page - 1) * pageSize;
            const endIdx = Math.min(startIdx + pageSize, totalApps);
            const pageApps = filteredApps.slice(startIdx, endIdx);

            const paginatedResponse = {
                name: "Kho IPA Store Tổng Hợp",
                identifier: "com.khoipa.store",
                description: `Kho ứng dụng IPA tổng hợp từ nhiều nguồn.`,
                apps: pageApps,
                // Metadata phân trang
                pagination: {
                    page: page,
                    pageSize: pageSize,
                    totalApps: totalApps,
                    totalPages: totalPages,
                    hasMore: page < totalPages
                },
                category: categoryParam || 'all',
                search: searchQuery || ''
            };

            return new Response(JSON.stringify(paginatedResponse), { headers: corsHeaders });
        }

        // Nếu là request đầy đủ (ESign, KSign, Feather, GBox...)
        const fullRepoJson = {
            name: "Kho IPA Store Tổng Hợp",
            identifier: "com.khoipa.store",
            description: `Kho ứng dụng IPA tổng hợp từ nhiều nguồn, tự động cập nhật và lọc trùng phiên bản mới nhất. Tổng cộng ${allMergedApps.length} ứng dụng.`,
            apps: allMergedApps
        };

        return new Response(JSON.stringify(fullRepoJson), { headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
