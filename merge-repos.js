const fs = require('fs');
const path = require('path');

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

function cleanAndExtractFeatures(desc) {
    if (!desc) return '';
    desc = desc.replace(/unkeyapp/gi, '').replace(/unkey/gi, '').trim();
    desc = desc.replace(/📱\s*Thiết bị xử lý[\s\S]*?AppStore/gi, '');
    desc = desc.replace(/🔑\s*THÔNG TIN MOD\/HACK[\s\S]*?AppStore/gi, '');
    desc = desc.replace(/ID ứng dụng:[\s\S]*?Khu giải mã: \S+/gi, '');
    desc = desc.replace(/🔒\s*THÔNG TIN MOD\/HACK[\s\S]*?AppStore/gi, '');
    desc = desc.replace(/👉\s*Liên kết AppStore[\s\S]*?$/gi, '');
    
    const originalAppDescIndex = desc.search(/MÔ TẢ ỨNG DỤNG GỐC|Giới thiệu ứng dụng|About this app/i);
    if (originalAppDescIndex !== -1) {
        const modFeaturesIndex = desc.search(/TÍNH NĂNG MOD|Tính năng Hack|Mod Features|Tính năng|Mod:|Hack:|Zalo - chạy nền/i);
        if (modFeaturesIndex > originalAppDescIndex) {
            desc = desc.substring(modFeaturesIndex);
        } else {
            desc = desc.substring(0, originalAppDescIndex);
        }
    }
    return desc.trim();
}

// Chuẩn hóa tên app để so sánh trùng lặp
function normalizeName(name) {
    if (!name) return '';
    let normalized = name
        .toLowerCase()
        .replace(/[™®©]/g, '')           // Bỏ ký hiệu thương hiệu
        .replace(/\s*-\s*hack\s*#?\d*/gi, '')  // Bỏ "- Hack #1", "- Hack #2"
        .replace(/\s*\(hack(?:ed)?\s*#?\d*\)/gi, '') // Bỏ "(Hack #2)", "(hacked #3)"
        .replace(/\s*hack$/gi, '')        // Bỏ "Hack" ở cuối
        .replace(/\s*ipa\s*mod\s*/gi, '') // Bỏ "IPA Mod"
        .replace(/\s*-\s*daily.*$/gi, '') // Bỏ "- Daily English Vocab"
        .replace(/\s*-\s*learn.*$/gi, '') // Bỏ "- Learn English Daily"
        .replace(/[:：].*$/g, '')          // Bỏ phần sau dấu ":" (ví dụ: "365Scores: Live Scores & News")
        .replace(/\s*\(.*\)\s*/g, '')     // Bỏ nội dung trong ngoặc
        .trim();

    // Nếu tên chứa ký tự Latin (a-z), loại bỏ các ký tự phi Latin (như tiếng Trung, tiếng Ả Rập)
    // để gộp các bản như "Douyin 抖音" và "Douyin" lại với nhau.
    const latinMatch = normalized.match(/[a-z]/g);
    if (latinMatch && latinMatch.length >= 2) {
        normalized = normalized.replace(/[^a-z0-9]/g, '');
    } else {
        // Nếu không có đủ ký tự Latin, giữ lại ký tự CJK và Arabic để tránh gộp nhầm
        normalized = normalized.replace(/[^a-z0-9\u4e00-\u9fff\u0600-\u06ff]/g, '');
    }
    return normalized.trim();
}

async function mergeRepos() {
    console.log("Bắt đầu gộp repo tại build-time...");
    
    // Đọc danh sách repo từ khoipa.txt
    let repos = [];
    try {
        const txtPath = path.join(__dirname, 'khoipa.txt');
        if (fs.existsSync(txtPath)) {
            const text = fs.readFileSync(txtPath, 'utf8');
            repos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        }
    } catch (e) {
        console.error("Lỗi đọc khoipa.txt:", e.message);
    }

    if (repos.length === 0) {
        console.log("Cảnh báo: khoipa.txt trống hoặc không tồn tại. Không có repo nào để gộp.");
    }

    const allApps = [];
    const fetchPromises = repos.map(async (repoUrl) => {
        try {
            const response = await fetch(repoUrl, {
                headers: {
                    'User-Agent': 'Esign/1.0 (iPhone; iOS 16.0; Scale/3.00)',
                    'Accept': 'application/json, text/plain, */*'
                },
                signal: AbortSignal.timeout(30000)
            });

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
            console.log(`Bỏ qua repo lỗi: ${repoUrl} (${e.message})`);
        }
    });

    await Promise.allSettled(fetchPromises);
    console.log(`Tải xong. Tổng số app thô: ${allApps.length}`);

    const uniqueAppsMap = new Map();
    allApps.forEach(app => {
        let bundleId = (app.bundleIdentifier || app.bundleID || '').trim();
        let appName = (app.name || '').trim();
        const key = bundleId || appName;
        if (!key) return;

        const optimizedApp = {
            name: appName || 'Ứng dụng',
            bundleIdentifier: bundleId || key,
            version: (app.version || (app.versions && app.versions[0] && app.versions[0].version) || '1.0').toString().trim(),
            size: app.size || (app.versions && app.versions[0] && app.versions[0].size) || 0
        };

        // Bỏ tab Mới nhất bằng cách không gán versionDate
        // const versionDate = app.versionDate || app.date || app.addedDate || app.timestamp || (app.versions && app.versions[0] && app.versions[0].date) || '';
        // if (versionDate) optimizedApp.versionDate = versionDate;

        const iconURL = app.iconURL || app.icon || '';
        if (iconURL) optimizedApp.iconURL = iconURL;

        let downloadURL = app.downloadURL || app.ipaURL || app.url || app.down || '';
        if (!downloadURL && app.versions && app.versions[0] && app.versions[0].downloadURL) {
            downloadURL = app.versions[0].downloadURL;
        }
        if (downloadURL) optimizedApp.downloadURL = downloadURL;

        // Giữ lại hoặc tự động gán category để hiển thị đúng tab trên Esign/KSign
        let category = (app.category || '').toLowerCase().trim();
        const dlLower = (downloadURL || '').toLowerCase();
        const nameLower = (app.name || '').toLowerCase();
        const bundleLower = (app.bundleIdentifier || app.bundleID || '').toLowerCase();
        
        // 1. Nhận diện Tweak / Plugin
        const isTweak = dlLower.endsWith('.dylib') || 
                        dlLower.includes('.dylib?') || 
                        dlLower.endsWith('.deb') || 
                        dlLower.includes('.deb?') || 
                        nameLower.includes('.dylib') || 
                        nameLower.includes('tweak') || 
                        nameLower.includes('plugin') || 
                        nameLower.includes('inject') || 
                        bundleLower.includes('tweak') || 
                        bundleLower.includes('dylib');

        // 2. Nhận diện Game / Trò chơi
        // Các từ khóa chỉ có ở game
        const gameKeywords = [
            'game', 'arcade', 'simulator', 'rpg', 'puzzle', 'racing', 'sports', 'fight', 'battle', 'clash', 
            'lego', 'pokemon', 'mario', 'sonic', 'pubg', 'roblox', 'minecraft', 'gta', 'angry birds', 
            'subway surfers', 'candy crush', 'plants vs', 'pvz', 'fifa', 'pes', 'efootball', 'shadow fight', 
            'hill climb', 'temple run', 'fruit ninja', 'among us', 'fortnite', 'codm', 'genshin', 'honkai', 
            'wild rift', 'lien quan', 'liên quân', 'brawl stars', 'clash royale', 'clash of clans', 'free fire', 
            'angrybirds', 'cooking', 'solitaire', 'sudoku', 'chess', 'tetris', 'pac-man', 'pacman', 'monopoly'
        ];
        const gameBundleKeywords = [
            'game', 'playrix', 'rovio', 'mojang', 'sega', 'nintendo', 'konami', 'capcom', 'square-enix', 
            'bandainamco', 'ubisoft', 'gameloft', 'supercell', 'roblox', 'tencent', 'netease', 'mihoyo', 
            'garena', 'epicgames', 'rockstargames', 'activision', 'blizzard', 'riotgames', 'dts.freefire'
        ];
        
        // Các từ khóa của ứng dụng thông thường (để tránh nhận diện nhầm khi có từ mod/hack)
        const appKeywords = [
            'learning', 'piano', 'notes', 'editor', 'camera', 'music', 'vpn', 'browser', 'dictionary', 
            'photo', 'video', 'youtube', 'facebook', 'messenger', 'wechat', 'tiktok', 'instagram', 
            'spotify', 'adblock', 'blocker', 'cleaner', 'manager', 'downloader', 'torrent', 'keyboard', 
            'font', 'wallpaper', 'widget', 'theme', 'calculator', 'scanner', 'pdf', 'office', 'word', 
            'excel', 'powerpoint', 'note', 'diary', 'calendar', 'clock', 'alarm', 'weather', 'map', 
            'navigation', 'gps', 'fitness', 'workout', 'health', 'diet', 'recipe', 'shopping', 'finance', 
            'bank', 'wallet', 'crypto', 'bitcoin', 'investing', 'stock', 'trading', 'news', 'book', 
            'reader', 'comic', 'manga', 'anime', 'tv', 'show', 'stream', 'live', 'radio', 'podcast', 
            'chat', 'mail', 'email', 'contact', 'call', 'sms', 'text', 'voice', 'recorder', 'creator', 
            'maker', 'builder', 'designer', 'painter', 'draw', 'sketch', 'art', 'pic', 'picture', 'film', 
            'audio', 'sound', 'song', 'player', 'playlist', 'equalizer', 'lyrics', 'karaoke', 'instrument', 
            'guitar', 'drum', 'violin', 'flute', 'synth', 'dj', 'mix', 'remix', 'beat', 'loop', 'sample'
        ];

        let isGame = false;
        if (category === 'game' || category === 'games') {
            isGame = true;
        } else if (gameKeywords.some(kw => nameLower.includes(kw)) || gameBundleKeywords.some(kw => bundleLower.includes(kw))) {
            isGame = true;
        } else if ((nameLower.includes('hack') || nameLower.includes('mod') || nameLower.includes('cheat')) && !appKeywords.some(kw => nameLower.includes(kw))) {
            isGame = true;
        }

        let type = 1; // Mặc định là Ứng dụng (type: 1)
        if (isTweak) {
            category = 'tweak';
            type = 5; // Plugin/Tweak (type: 5)
        } else if (isGame) {
            category = 'game';
            type = 2; // Trò chơi (type: 2)
        } else {
            category = 'utility';
            type = 1; // Ứng dụng (type: 1)
        }
        
        // Chỉ gán type và category cho Game (2) và Plugin (5) để Esign/KSign tạo tab tương ứng.
        // Ứng dụng thường (type 1) sẽ không gán type/category để không tạo tab "Ứng dụng", nhưng vẫn hiện ở tab Mặc định.
        if (type === 2 || type === 5) {
            optimizedApp.category = category;
            optimizedApp.type = type;
        }

        let desc = app.localizedDescription || app.description || app.subtitle || '';
        if (desc) {
            let cleanedDesc = cleanAndExtractFeatures(desc);
            if (cleanedDesc) {
                // Giới hạn độ dài mô tả tối đa 500 ký tự để giảm dung lượng file JSON
                if (cleanedDesc.length > 500) {
                    cleanedDesc = cleanedDesc.substring(0, 500) + '...';
                }
                optimizedApp.localizedDescription = cleanedDesc;
            }
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
    console.log(`Sau khi gộp theo bundleIdentifier: ${mergedApps.length} app`);

    // === XÓA PREFIX KHÔI / IPAOMTK / RIFTYSIPALIBRARY TRONG MÔ TẢ & TÊN ===
    console.log(`\nĐang dọn mô tả & tên (xóa prefix ipaomtk.com | khoi | riftysipalibrary)...`);
    mergedApps.forEach(app => {
        // Dọn mô tả
        let desc = app.localizedDescription || app.description || '';
        if (desc) {
            desc = desc.replace(/^ipaomtk\.com\s*\|\s*/i, '');
            desc = desc.replace(/^khoi\s*\|\s*/i, '');
            desc = desc.replace(/^khoi\s*/i, '');
            // Xóa IPAOMTK/ipaomtk ở đầu mô tả
            desc = desc.replace(/^ipaomtk\s+/i, '');
            desc = desc.replace(/^IPAOMTK\s+/i, '');
            desc = desc.replace(/^Introduction\s+ipaomtk\s+app\s+is\s+/i, 'This is ');
            desc = desc.replace(/^Introduction\s+IPAOMTK\s+App\s+is\s+/i, 'This is ');
            // Xóa @riftysIPAlibrary hoặc riftysipalibrary trong mô tả
            desc = desc.replace(/@riftysIPAlibrary\s*\|?\s*/gi, '');
            desc = desc.replace(/riftysipalibrary/gi, '');
            desc = desc.replace(/riftysipas/gi, '');
            desc = desc.replace(/\s{2,}/g, ' ').trim();
            app.localizedDescription = desc;
        }
        // Dọn tên: bỏ ipaomtk.com hoặc ipaomtk ở cuối hoặc làm hậu tố
        if (app.name) {
            app.name = app.name.replace(/[-\s]*ipaomtk\.com$/i, '');
            app.name = app.name.replace(/[-\s]*ipaomtk$/i, '');
            app.name = app.name.replace(/\s*ipaomtk\.com\s*/i, ' ');
            app.name = app.name.replace(/\s*ipaomtk\s*/i, ' ');
            app.name = app.name.trim();
        }
    });

    // === LỌC TRÙNG THEO MÔ TẢ ===
    // Chỉ lọc trùng app có mô tả ngôn ngữ khác (Anh, Trung, Nga...)
    // App có mô tả tiếng Việt → giữ nguyên, KHÔNG lọc
    console.log(`\nĐang lọc trùng theo mô tả...`);
    
    function isVietnamese(text) {
        const viPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
        return viPattern.test(text || '');
    }

    function normalizeDesc(desc) {
        if (!desc) return '';
        return desc
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, '')
            .trim();
    }

    // Gộp theo mô tả (chỉ lọc app không phải tiếng Việt)
    const descDedup = new Map();
    mergedApps.forEach(app => {
        const desc = app.localizedDescription || '';
        // App tiếng Việt: giữ nguyên, không lọc
        if (isVietnamese(desc)) {
            descDedup.set('__vi_' + (app.bundleIdentifier || Math.random()), app);
            return;
        }
        const nDesc = normalizeDesc(desc);
        if (!nDesc || nDesc.length < 20) {
            descDedup.set('__' + (app.bundleIdentifier || Math.random()), app);
            return;
        }
        
        const existing = descDedup.get(nDesc);
        if (!existing) {
            descDedup.set(nDesc, app);
        } else {
            const vExisting = existing.version || '0';
            const vApp = app.version || '0';
            if (compareVersions(vApp, vExisting) > 0) {
                descDedup.set(nDesc, app);
            } else if (compareVersions(vApp, vExisting) === 0) {
                const existingBundleValid = (existing.bundleIdentifier || '').includes('.');
                const appBundleValid = (app.bundleIdentifier || '').includes('.');
                if (!existingBundleValid && appBundleValid) {
                    descDedup.set(nDesc, app);
                } else if ((app.name || '').length < (existing.name || '').length) {
                    descDedup.set(nDesc, app);
                }
            }
        }
    });
    const dedupedApps = Array.from(descDedup.values());
    const totalRemoved = mergedApps.length - dedupedApps.length;
    console.log(`  Sau khi gộp mô tả: ${dedupedApps.length} app`);
    console.log(`  Tổng cộng đã loại ${totalRemoved} app trùng`);

    // === DỊCH MÔ TẢ SANG TIẾNG ANH ===
    console.log(`\nĐang dịch mô tả sang tiếng Anh...`);
    
    // Hàm phát hiện ngôn ngữ không phải tiếng Anh (giữ nguyên tiếng Việt)
    function isNonEnglish(text) {
        if (!text) return false;
        const hasArabic = /[\u0600-\u06FF]/.test(text);
        const hasCJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
        const hasCyrillic = /[\u0400-\u04FF]/.test(text);
        const hasThai = /[\u0E00-\u0E7F]/.test(text);
        const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(text);
        const hasHebrew = /[\u0590-\u05FF]/.test(text);
        const hasDevanagari = /[\u0900-\u097F]/.test(text);
        // Tiếng Việt giữ nguyên, KHÔNG dịch
        return hasArabic || hasCJK || hasCyrillic || hasThai || hasKorean || hasHebrew || hasDevanagari;
    }

    // Dịch batch các mô tả
    async function translateToEnglish(text) {
        if (!text) return text;
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) return text;
            const data = await response.json();
            return data[0]?.map(s => s[0]).join('') || text;
        } catch {
            return text;
        }
    }

    let translatedCount = 0;
    const BATCH_SIZE = 20;
    for (let i = 0; i < dedupedApps.length; i += BATCH_SIZE) {
        const batch = dedupedApps.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (app) => {
            const desc = app.localizedDescription || app.description || '';
            if (desc && isNonEnglish(desc)) {
                const translated = await translateToEnglish(desc);
                if (translated !== desc) {
                    app.localizedDescription = translated;
                    translatedCount++;
                }
            }
        }));
        if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= dedupedApps.length) {
            console.log(`  Đã xử lý: ${Math.min(i + BATCH_SIZE, dedupedApps.length)}/${dedupedApps.length} app`);
        }
    }
    console.log(`  Đã dịch ${translatedCount} mô tả sang tiếng Anh`);

    // === LỌC APP CÓ LINK TẢI LỖI HOẶC TRỐNG ===
    console.log(`\nĐang lọc link tải lỗi...`);
    
    // Bước 1: Loại bỏ app không có downloadURL
    let filteredApps = dedupedApps.filter(app => {
        const url = app.downloadURL ? app.downloadURL.toString().trim() : '';
        
        if (!url) {
            return false;
        }
        
        return true;
    });
    const removedEmpty = dedupedApps.length - filteredApps.length;
    console.log(`  Đã loại bỏ ${removedEmpty} app không có link tải hoặc link lỗi`);

    // Bước 2: Bỏ tab Ứng dụng - Chỉ giữ Game (type: 2) và Plugin/Tweak (type: 5)
    // (Đã bỏ lọc này để hiển thị đầy đủ tất cả app, không chia tab)
    // const beforeTypeFilter = filteredApps.length;
    // filteredApps = filteredApps.filter(app => app.type === 2 || app.type === 5);
    // const removedUtility = beforeTypeFilter - filteredApps.length;
    // console.log(`  Đã loại bỏ ${removedUtility} ứng dụng thường (type: 1), chỉ giữ Game & Plugin`);

    // Bước 2: Kiểm tra HEAD request (mặc định luôn bật, trừ khi đặt CHECK_LINKS=false)
    const shouldCheckLinks = process.env.CHECK_LINKS !== 'false';
    if (shouldCheckLinks) {
        console.log(`  Đang kiểm tra ${filteredApps.length} link tải (HEAD request)...`);
        const CONCURRENCY = 30;
        const HEAD_TIMEOUT = 5000;
        
        const results = [];
        for (let i = 0; i < filteredApps.length; i += CONCURRENCY) {
            const batch = filteredApps.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(
                batch.map(async (app, idx) => {
                    try {
                        const resp = await fetch(app.downloadURL, {
                            method: 'HEAD',
                            signal: AbortSignal.timeout(HEAD_TIMEOUT),
                            headers: { 'User-Agent': 'Esign/1.0' }
                        });
                        return { index: i + idx, ok: resp.ok, status: resp.status };
                    } catch {
                        return { index: i + idx, ok: false, status: 0 };
                    }
                })
            );
            results.push(...batchResults);
            
            // In tiến độ mỗi 500 app
            if ((i + CONCURRENCY) % 500 === 0 || i + CONCURRENCY >= filteredApps.length) {
                const checked = Math.min(i + CONCURRENCY, filteredApps.length);
                console.log(`    Đã kiểm tra: ${checked}/${filteredApps.length}`);
            }
        }

        const aliveSet = new Set();
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value.ok) {
                aliveSet.add(r.value.index);
            }
        });

        const beforeCheck = filteredApps.length;
        filteredApps = filteredApps.filter((_, idx) => aliveSet.has(idx));
        console.log(`  Đã loại bỏ thêm ${beforeCheck - filteredApps.length} app có link tải die (HEAD check)`);
    }

    console.log(`Còn lại ${filteredApps.length} app sau khi lọc\n`);

    // Sắp xếp theo tên A-Z (đã bỏ tab Mới nhất nên không cần sắp xếp theo ngày)
    filteredApps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const fullRepoJson = {
        name: "Kho IPA Store",
        identifier: "com.khoipa.store",
        sourceURL: "https://khoipa.pages.dev",
        iconURL: "https://khoipa.pages.dev/icon.png",
        website: "https://khoipa.pages.dev",
        subtitle: `Tổng hợp ${filteredApps.length} ứng dụng IPA từ nhiều nguồn, tự động cập nhật & lọc trùng phiên bản mới nhất`,
        META: {
            repoName: "Kho IPA Store",
            repoIcon: "https://khoipa.pages.dev/icon.png"
        },
        apps: filteredApps
    };

    // Đảm bảo thư mục dist tồn tại
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    // Ghi file repo.json tĩnh vào cả thư mục gốc và thư mục dist (dạng minify để giảm dung lượng file dưới 25MB)
    const repoJsonStr = JSON.stringify(fullRepoJson);
    fs.writeFileSync(path.join(__dirname, 'repo.json'), repoJsonStr, 'utf8');
    fs.writeFileSync(path.join(distDir, 'repo.json'), repoJsonStr, 'utf8');
    console.log(`Đã ghi ${filteredApps.length} ứng dụng vào repo.json và dist/repo.json thành công!`);
}

mergeRepos().catch(err => {
    console.error("Lỗi gộp repo:", err);
    process.exit(1);
});
