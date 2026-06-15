const axios = require('axios');
const fs = require('fs');
const path = require('path');

const repos = [
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

async function analyze() {
    console.log("Bắt đầu phân tích các link download từ các repo...");
    
    for (const repoUrl of repos) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Đang fetch repo: ${repoUrl}`);
        try {
            const response = await axios.get(repoUrl, {
                headers: {
                    'User-Agent': 'Esign/1.0 (iPhone; iOS 16.0; Scale/3.00)',
                    'Accept': 'application/json, text/plain, */*'
                },
                timeout: 10000
            });
            
            let data = response.data;
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            
            let apps = [];
            if (data.apps && Array.isArray(data.apps)) apps = data.apps;
            else if (data.packages && Array.isArray(data.packages)) apps = data.packages;
            else if (Array.isArray(data)) apps = data;
            
            console.log(`Tìm thấy ${apps.length} ứng dụng.`);
            if (apps.length === 0) continue;
            
            // Lấy mẫu 5 ứng dụng đầu tiên để xem link download
            const sampleApps = apps.slice(0, 10);
            sampleApps.forEach((app, index) => {
                const downloadURL = app.downloadURL || app.ipaURL || app.url || app.down || '';
                const name = app.name || 'Không tên';
                console.log(`  [${index + 1}] ${name}: ${downloadURL}`);
            });
            
            // Thống kê định dạng link
            let plistCount = 0;
            let ipaCount = 0;
            let otherCount = 0;
            
            apps.forEach(app => {
                const url = app.downloadURL || app.ipaURL || app.url || app.down || '';
                if (url.startsWith('itms-services:')) {
                    plistCount++;
                } else if (url.toLowerCase().endsWith('.ipa') || url.toLowerCase().includes('.ipa?')) {
                    ipaCount++;
                } else {
                    otherCount++;
                }
            });
            
            console.log(`Thống kê định dạng link trong repo này:`);
            console.log(`  - Link plist (itms-services): ${plistCount}`);
            console.log(`  - Link trực tiếp .ipa: ${ipaCount}`);
            console.log(`  - Link khác/chuyển hướng: ${otherCount}`);
            
        } catch (error) {
            console.log(`Lỗi khi fetch repo ${repoUrl}: ${error.message}`);
        }
    }
}

analyze();
