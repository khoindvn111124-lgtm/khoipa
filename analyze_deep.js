const axios = require('axios');

// Phân tích chi tiết các link "khác" và kiểm tra itms-services
async function analyzeDeep() {
    console.log("=== PHÂN TÍCH CHI TIẾT CÁC LINK KHÁC/CHUYỂN HƯỚNG ===\n");
    
    // Repo có nhiều link "khác"
    const repos = [
        "https://appstore.sidelix.vip/repos/esign.php",
        "https://ipa.thuthuatjb.com/repo",
        "http://ittza7aa.com/repo.json",
        "https://fastsign.dev/repo.json",
        "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/ipaomtk.json",
        "https://fastsign.dev/repo.lite.altstore.json",
        "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/repo.favorite.json",
        "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/repo.unkeyapp.json",
        "https://stikdebug.xyz/index.json",
        "https://raw.githubusercontent.com/drphe/KhoIPA/main/upload/EpicGamesIPASource.json",
        "https://alt.getutm.app",
        "https://quarksources.github.io/dist/quantumsource.min.json",
        "https://quarksources.github.io/dist/quantumsource%2B%2B.min.json",
        "https://community-apps.sidestore.io/sidecommunity.json",
        "https://driftywinds.github.io/AltStore/apps.json",
        "https://wuxu1.github.io/wuxu-complete-plus.json",
        "https://wuxu1.github.io/wuxu-complete.json",
        "https://raw.githubusercontent.com/WhySooooFurious/Ultimate-Sideloading-Guide/refs/heads/main/raw-files/app-repo.json",
        "https://raw.githubusercontent.com/Neoncat-OG/TrollStore-IPAs/main/apps_esign.json?moduleError=1",
        "https://cdn.dbservices.to/repo-jsons/2c61e8984f400fbe2c28d620494b9efee8621930.json",
        "https://cdn.dbservices.to/repo-jsons/0852d7254534240c8fa12f3ed082c44c0023ad08.json",
        "https://cdn.dbservices.to/repo-jsons/1ae857434ef5533ecf3a5ed64c3a8a7096dc3573.json",
        "https://repo.owo.network",
        "https://altstore.fouadraheb.com/",
        "https://raw.githubusercontent.com/yodaluca23/SpotC-AltStore-Repo/main/AltStore%20Repo.json",
        "https://apps.sidestore.io/",
        "https://raw.githubusercontent.com/royilkom-alt/EthSign/refs/heads/main/EthSign.json",
        "https://raw.githubusercontent.com/testbung1/testbung1.github.io/refs/heads/main/repo.json"
    ];
    
    for (const repoUrl of repos) {
        try {
            const response = await axios.get(repoUrl, {
                headers: { 'User-Agent': 'Esign/1.0 (iPhone; iOS 16.0; Scale/3.00)' },
                timeout: 10000
            });
            let data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
            
            let apps = [];
            if (data.apps && Array.isArray(data.apps)) apps = data.apps;
            else if (data.packages && Array.isArray(data.packages)) apps = data.packages;
            else if (Array.isArray(data)) apps = data;
            
            // Tìm các link "khác" (không .ipa, không itms-services)
            const otherLinks = [];
            for (const app of apps) {
                const url = app.downloadURL || app.ipaURL || app.url || app.down || '';
                if (!url) continue;
                if (url.startsWith('itms-services:')) {
                    console.log(`  *** PHÁT HIỆN PLIST: ${app.name || 'N/A'} -> ${url}`);
                } else if (!url.toLowerCase().endsWith('.ipa') && !url.toLowerCase().includes('.ipa?')) {
                    otherLinks.push({ name: app.name, url: url });
                }
            }
            
            if (otherLinks.length > 0) {
                console.log(`\n--- ${repoUrl} ---`);
                console.log(`Tổng link khác: ${otherLinks.length}`);
                console.log(`Mẫu (tối đa 15):`);
                otherLinks.slice(0, 15).forEach((item, i) => {
                    console.log(`  [${i+1}] ${item.name}: ${item.url}`);
                });
            }
            
        } catch (e) {
            console.log(`Lỗi: ${repoUrl} - ${e.message}`);
        }
    }
    
    // Thử kiểm tra unkey qua server.js cache
    console.log("\n\n=== THỬ FETCH UNKEY QUA LOCALHOST SERVER ===\n");
    try {
        const resp = await axios.get('http://localhost:3000/api/fetch-repo?url=https://api.unkeyapp.com/v1/application/source.json', {
            timeout: 30000
        });
        const data = resp.data;
        let apps = [];
        if (data.apps && Array.isArray(data.apps)) apps = data.apps;
        else if (data.packages && Array.isArray(data.packages)) apps = data.packages;
        else if (Array.isArray(data)) apps = data;
        
        console.log(`Unkey: ${apps.length} ứng dụng`);
        
        let plistCount = 0, ipaCount = 0, otherCount = 0;
        const otherSamples = [];
        
        for (const app of apps) {
            const url = app.downloadURL || app.ipaURL || app.url || app.down || '';
            if (url.startsWith('itms-services:')) {
                plistCount++;
                if (plistCount <= 5) console.log(`  PLIST: ${app.name} -> ${url}`);
            } else if (url.toLowerCase().endsWith('.ipa') || url.toLowerCase().includes('.ipa?')) {
                ipaCount++;
            } else {
                otherCount++;
                if (otherSamples.length < 10) otherSamples.push({ name: app.name, url });
            }
        }
        console.log(`  - Plist: ${plistCount}, .ipa: ${ipaCount}, Khác: ${otherCount}`);
        if (otherSamples.length > 0) {
            console.log(`  Link khác:`);
            otherSamples.forEach((s, i) => console.log(`    [${i+1}] ${s.name}: ${s.url}`));
        }
    } catch (e) {
        console.log(`Không fetch được unkey: ${e.message}`);
    }
}

analyzeDeep();
