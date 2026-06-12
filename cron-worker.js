export default {
  async scheduled(event, env, ctx) {
    const domain = env.CF_DOMAIN || env.DOMAIN || 'khoipa.pages.dev';
    console.log(`Bắt đầu chạy Cron Trigger cập nhật repo.json cho domain: ${domain}`);

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

    try {
      // 1. Lấy danh sách repo từ khoipa.txt trên domain
      const reposUrl = `https://${domain}/khoipa.txt`;
      const reposResponse = await fetch(reposUrl);
      let repos = [];
      if (reposResponse.ok) {
        const text = await reposResponse.text();
        repos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      } else {
        throw new Error(`Không thể tải khoipa.txt từ ${reposUrl}`);
      }

      console.log(`Tìm thấy ${repos.length} repo để cập nhật.`);

      // 2. Fetch song song tất cả các repo
      const allApps = [];
      const fetchPromises = repos.map(async (repoUrl) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // Timeout 15 giây cho mỗi repo

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
        description: `Kho ứng dụng IPA tổng hợp từ nhiều nguồn, tự động cập nhật và lọc trùng phiên bản mới nhất. Tổng cộng ${mergedApps.length} ứng dụng. Cập nhật lúc: ${new Date().toISOString()}`,
        apps: mergedApps
      };

      const repoJsonString = JSON.stringify(repoJson);

      // 5. Lưu vào KV namespace nếu có cấu hình
      if (env.KHOIPA_KV) {
        await env.KHOIPA_KV.put('repo_json', repoJsonString);
        console.log(`Đã cập nhật repo.json thành công vào Cloudflare KV! Tổng cộng ${mergedApps.length} ứng dụng.`);
      } else {
        console.warn('Cảnh báo: Không tìm thấy KV namespace KHOIPA_KV. Vui lòng cấu hình KV trong Cloudflare.');
      }

      // 6. Ping Pages Function để cập nhật cache (nếu vẫn dùng cache làm fallback)
      try {
        await fetch(`https://${domain}/repo.json?update=true`);
      } catch (e) {
        console.warn('Không thể ping repo.json endpoint:', e.message);
      }

    } catch (error) {
      console.error(`Lỗi nghiêm trọng khi chạy Cron Trigger: ${error.message}`);
    }
  }
};
