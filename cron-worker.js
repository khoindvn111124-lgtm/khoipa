export default {
  async scheduled(event, env, ctx) {
    // Tự động ping endpoint repo.json với ?update=true để cập nhật cache
    const domain = env.CF_DOMAIN || env.DOMAIN || 'localhost:3000';
    const url = `https://${domain}/repo.json?update=true`;
    
    console.log(`Bắt đầu chạy Cron Trigger cập nhật repo.json tại: ${url}`);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Cloudflare-Cron-Trigger/1.0'
        }
      });
      console.log(`Kết quả cập nhật: HTTP ${response.status}`);
    } catch (error) {
      console.error(`Lỗi khi chạy Cron Trigger: ${error.message}`);
    }
  }
};
