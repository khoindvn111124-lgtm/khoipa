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

    const allApps = [];
    const fetchPromises = repos.map(async (repoUrl) => {
        try {
            const response = await fetch(repoUrl, {
                headers: {
                    'User-Agent': 'Esign/1.0 (iPhone; iOS 16.0; Scale/3.00)',
                    'Accept': 'application/json, text/plain, */*'
                },
                signal: AbortSignal.timeout(10000)
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
        const key = app.bundleIdentifier || app.bundleID || app.name;
        if (!key) return;

        const optimizedApp = {
            name: app.name || 'Ứng dụng',
            bundleIdentifier: app.bundleIdentifier || app.bundleID || key,
            version: app.version || '1.0',
            size: app.size || 0
        };

        const versionDate = app.versionDate || app.date || app.addedDate || app.timestamp || '';
        if (versionDate) optimizedApp.versionDate = versionDate;

        const iconURL = app.iconURL || app.icon || '';
        if (iconURL) optimizedApp.iconURL = iconURL;

        const downloadURL = app.downloadURL || app.ipaURL || app.url || app.down || '';
        if (downloadURL) optimizedApp.downloadURL = downloadURL;

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

    // === LỌC APP CÓ LINK TẢI LỖI HOẶC TRỐNG ===
    console.log(`\nĐang lọc link tải lỗi...`);
    
    // Bước 1: Luôn loại bỏ app không có downloadURL
    let filteredApps = mergedApps.filter(app => {
        const url = app.downloadURL;
        if (!url || url.toString().trim() === '') {
            return false;
        }
        return true;
    });
    const removedEmpty = mergedApps.length - filteredApps.length;
    console.log(`  Đã loại bỏ ${removedEmpty} app không có link tải`);

    // Bước 2: Kiểm tra HEAD request nếu được bật (CHECK_LINKS=true)
    const shouldCheckLinks = process.env.CHECK_LINKS === 'true';
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
    } else {
        console.log(`  (Bỏ qua HEAD check. Đặt CHECK_LINKS=true để kiểm tra link tải)`);
    }

    console.log(`Còn lại ${filteredApps.length} app sau khi lọc\n`);

    // Sắp xếp theo ngày mới nhất lên đầu
    filteredApps.sort((a, b) => {
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

    const fullRepoJson = {
        name: "Kho IPA Store Tổng Hợp",
        identifier: "com.khoipa.store",
        description: `Kho ứng dụng IPA tổng hợp từ nhiều nguồn, tự động cập nhật và lọc trùng phiên bản mới nhất. Tổng cộng ${filteredApps.length} ứng dụng.`,
        apps: filteredApps
    };

    // Đảm bảo thư mục dist tồn tại
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    // Ghi file repo.json tĩnh vào dist (dạng minify để giảm dung lượng file dưới 25MB)
    fs.writeFileSync(path.join(distDir, 'repo.json'), JSON.stringify(fullRepoJson), 'utf8');
    console.log(`Đã ghi ${filteredApps.length} ứng dụng vào dist/repo.json thành công!`);
}

mergeRepos().catch(err => {
    console.error("Lỗi gộp repo:", err);
    process.exit(1);
});
