document.addEventListener('DOMContentLoaded', () => {
    const repoListEl = document.getElementById('repoList');
    const appListEl = document.getElementById('appList');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const emptyStateEl = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const headerTitle = document.getElementById('headerTitle');
    const headerSubtitle = document.getElementById('headerSubtitle');
    const appsSectionTitle = document.getElementById('appsSectionTitle');
    const paginationContainer = document.getElementById('paginationContainer');
    const paginationFirst = document.getElementById('paginationFirst');
    const paginationPrev = document.getElementById('paginationPrev');
    const paginationNext = document.getElementById('paginationNext');
    const paginationLast = document.getElementById('paginationLast');
    const paginationInfo = document.getElementById('paginationInfo');

    let currentApps = [];
    let allRepos = [
                "https://repository.apptesters.org",
        "https://appstore.sidelix.vip/repos/esign.php",
        "https://ipa.thuthuatjb.com/repo",
        "http://ittza7aa.com/repo.json",
        "https://ipa.cypwn.xyz/cypwn.json",
        "https://fastsign.dev/repo.json",
        "https://api.unkeyapp.com/v1/application/source.json"
    ];
    let allRepoNamesCache = [];
    let activeCategory = 'all';
    
    let currentPage = 1;
    const PAGE_SIZE = 50;
    let filteredAppsList = [];

    // Tự động xác định API endpoint hoặc CORS proxy tùy theo môi trường
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    // Hàm fetch repo thông minh sử dụng API endpoint của chính domain đang chạy (local hoặc Cloudflare Pages Functions)
    async function fetchRepoDataFromUrl(repoUrl, signal) {
        const response = await fetch(`/api/fetch-repo?url=${encodeURIComponent(repoUrl)}`, { signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }

    const getTranslateUrl = (text) => {
        return `/api/translate?q=${encodeURIComponent(text)}`;
    };

    // ── Tab Navigation ──
    const pages = { appsPage: document.getElementById('appsPage'), reposPage: document.getElementById('reposPage') };
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const pageId = tab.dataset.page;
            Object.keys(pages).forEach(k => pages[k].classList.remove('active'));
            pages[pageId].classList.add('active');
            if (pageId === 'reposPage') {
                headerTitle.textContent = 'Kho Repo';
                headerSubtitle.textContent = '';
            }
        });
    });

    // ── Render Repo List (tái sử dụng) ──
    function renderRepoList(repos) {
        allRepos = repos;
        repoListEl.innerHTML = '';
        
        // Nút "Tất cả Repositories"
        const allBtn = document.createElement('div');
        allBtn.className = 'repo-list-item';
        allBtn.innerHTML = `
            <div class="repo-icon all"><i class="bi bi-collection-fill"></i></div>
            <div class="repo-info">
                <div class="repo-name">Tất cả</div>
                <div class="repo-url">Tổng hợp ứng dụng từ mọi nguồn</div>
            </div>
            <div class="repo-count"><i class="bi bi-chevron-right"></i></div>
        `;
        allBtn.addEventListener('click', () => fetchAllRepos());
        repoListEl.appendChild(allBtn);
        
        repos.forEach(repo => {
            const div = document.createElement('div');
            div.className = 'repo-list-item';
            const shortName = repo.replace(/^https?:\/\//, '').split('/')[0];
            div.innerHTML = `
                <div class="repo-icon"><i class="bi bi-box"></i></div>
                <div class="repo-info">
                    <div class="repo-name">${shortName}</div>
                    <div class="repo-url">${repo}</div>
                </div>
                <div class="repo-count"><i class="bi bi-chevron-right"></i></div>
            `;
            div.addEventListener('click', () => {
                switchTab('appsPage');
                fetchRepoData(repo);
            });
            repoListEl.appendChild(div);
        });
    }

    // ── Load Repos (Apple list style) ──
    async function loadRepos() {
        // Nếu đã có repos nhúng sẵn từ build (môi trường tĩnh)
        if (allRepos.length > 0) {
            renderRepoList(allRepos);
            return;
        }
        try {
            const response = await fetch('/api/repos');
            const repos = await response.json();
            renderRepoList(repos);
        } catch (error) {
            console.error('Lỗi tải danh sách repo:', error);
            // Fallback nếu chạy tĩnh hoàn toàn mà chưa được build nhúng sẵn
            allRepos = [
                "https://repository.apptesters.org",
                "https://appstore.sidelix.vip/repos/esign.php",
                "https://ipa.thuthuatjb.com/repo",
                "http://ittza7aa.com/repo.json",
                "https://ipa.cypwn.xyz/cypwn.json",
                "https://fastsign.dev/repo.json",
                "https://api.unkeyapp.com/v1/application/source.json"
            ];
            renderRepoList(allRepos);
        }
    }

    function switchTab(pageId) {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.tab-item[data-page="${pageId}"]`);
        if (tab) tab.classList.add('active');
        Object.keys(pages).forEach(k => pages[k].classList.remove('active'));
        pages[pageId].classList.add('active');
    }

    // ── Version Compare ──
    function compareVersions(v1, v2) {
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
    }

    function getAppDate(app) {
        const dateStr = app.versionDate || app.date || app.addedDate || app.timestamp || '';
        if (!dateStr) return 0;
        if (!isNaN(dateStr)) return Number(dateStr);
        const parsed = Date.parse(dateStr);
        return isNaN(parsed) ? 0 : parsed;
    }

    // ── Fetch All Repos ──
    async function fetchAllRepos() {
        if (currentApps.length === 0) {
            loadingEl.style.display = 'flex';
        }
        errorEl.classList.add('d-none');
        emptyStateEl.classList.add('d-none');
        // Không xóa appListEl.innerHTML nếu đã có dữ liệu cache để tránh nhấp nháy màn hình
        if (currentApps.length === 0) {
            appListEl.innerHTML = '';
        }
        headerTitle.textContent = 'Tất cả';
        headerSubtitle.textContent = '';
        appsSectionTitle.classList.add('d-none');

        const allApps = [];
        allRepoNamesCache = [];

        // Tải song song tất cả các repo cùng lúc bằng Promise.allSettled
        const fetchPromises = allRepos.map(async (repoUrl) => {
            try {
                // Thêm timeout cho từng request fetch để tránh bị treo nếu repo phản hồi quá lâu
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 giây timeout toàn cục cho mỗi repo

                const data = await fetchRepoDataFromUrl(repoUrl, controller.signal);
                clearTimeout(timeoutId);

                let apps = [];
                if (data.apps && Array.isArray(data.apps)) apps = data.apps;
                else if (data.packages && Array.isArray(data.packages)) apps = data.packages;
                else if (Array.isArray(data)) apps = data;
                
                if (apps.length > 0) {
                    const mappedApps = apps.map(app => ({ ...app, _repo: repoUrl, _repoName: data.name || repoUrl }));
                    allApps.push(...mappedApps);
                    allRepoNamesCache.push(data.name || repoUrl);
                }
            } catch (error) {
                console.warn(`Bỏ qua ${repoUrl} do lỗi:`, error.message || error);
            }
        });

        await Promise.allSettled(fetchPromises);

        // Lọc trùng
        const uniqueAppsMap = new Map();
        allApps.forEach(app => {
            const key = app.bundleIdentifier || app.bundleID || app.name;
            if (!key) return;
            const existing = uniqueAppsMap.get(key);
            if (!existing) { uniqueAppsMap.set(key, app); }
            else if (compareVersions(app.version || '0', existing.version || '0') > 0) { uniqueAppsMap.set(key, app); }
        });
        currentApps = Array.from(uniqueAppsMap.values());

        // Sắp xếp theo ngày mới nhất lên đầu
        currentApps.sort((a, b) => {
            const dateA = getAppDate(a);
            const dateB = getAppDate(b);
            if (dateA !== dateB) {
                return dateB - dateA; // Ngày mới hơn lên đầu
            }
            return (a.name || '').localeCompare(b.name || '');
        });

        // Lưu vào localStorage cache (chỉ lưu các thông tin cần thiết để tránh tràn bộ nhớ 5MB của localStorage)
        try {
            // Chỉ giữ lại các trường cần thiết để hiển thị danh sách nhằm tối ưu dung lượng cache
            const minimizedApps = currentApps.map(app => ({
                name: app.name,
                bundleIdentifier: app.bundleIdentifier || app.bundleID,
                version: app.version,
                size: app.size,
                iconURL: app.iconURL || app.icon,
                downloadURL: app.downloadURL || app.ipaURL || app.url || app.down,
                localizedDescription: app.localizedDescription || app.description || app.subtitle,
                versionDate: app.versionDate || app.date || app.addedDate || app.timestamp
            }));
            localStorage.setItem('cached_apps', JSON.stringify(minimizedApps));
            localStorage.setItem('cached_apps_time', Date.now().toString());
        } catch (e) {
            console.warn('Không thể lưu cache vào localStorage:', e);
            // Nếu vẫn tràn, xóa bớt cache cũ
            try {
                localStorage.removeItem('cached_apps');
                localStorage.removeItem('cached_apps_time');
            } catch (innerEx) {}
        }

        headerTitle.textContent = 'Tất cả';
        headerSubtitle.textContent = '';
        appsSectionTitle.classList.remove('d-none');
        redrawApps();
        hideLoading();
    }

    // ── Fetch Single Repo ──
    async function fetchRepoData(repoUrl) {
        if (currentApps.length === 0) {
            loadingEl.style.display = 'flex';
        }
        errorEl.classList.add('d-none');
        emptyStateEl.classList.add('d-none');
        if (currentApps.length === 0) {
            appListEl.innerHTML = '';
        }
        headerTitle.textContent = repoUrl.replace(/^https?:\/\//,'').split('/')[0];
        headerSubtitle.textContent = '';
        appsSectionTitle.classList.add('d-none');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000); // Tăng lên 25 giây
            const data = await fetchRepoDataFromUrl(repoUrl, controller.signal);
            clearTimeout(timeoutId);

            let apps = [];
            if (data.apps && Array.isArray(data.apps)) apps = data.apps;
            else if (data.packages && Array.isArray(data.packages)) apps = data.packages;
            else if (Array.isArray(data)) apps = data;
            else throw new Error('Định dạng repo không được hỗ trợ');

            currentApps = apps;
            headerTitle.textContent = data.name || 'Ứng dụng';
            headerSubtitle.textContent = '';
            appsSectionTitle.classList.remove('d-none');
            redrawApps();
        } catch (error) {
            console.error('Lỗi fetch repo:', error);
            errorEl.textContent = 'Không thể tải dữ liệu từ repo này.';
            errorEl.classList.remove('d-none');
            headerTitle.textContent = 'Lỗi';
            headerSubtitle.textContent = '';
        } finally {
            hideLoading();
        }
    }

    function showLoading() {
        appListEl.innerHTML = '';
        loadingEl.style.display = 'none';
        errorEl.classList.add('d-none');
        emptyStateEl.classList.add('d-none');
    }

    function hideLoading() {
        loadingEl.style.display = 'none';
    }

    // ── Translate cache ──
    const translateCache = new Map();
    async function translateText(text) {
        if (!text) return text;
        if (translateCache.has(text)) return translateCache.get(text);
        try {
            const url = getTranslateUrl(text);
            const res = await fetch(url);
            const data = await res.json();
            
            let translated = text;
            if (data && data.translated) {
                translated = data.translated;
            } else if (Array.isArray(data)) {
                // Môi trường tĩnh: Google Translate API trả về [[["...", "..."]], null, "en"]
                translated = data[0]?.map(s => s[0]).join('') || text;
            }
            
            translateCache.set(text, translated);
            return translated;
        } catch { return text; }
    }

    // ── Categorize App ──
    const CATEGORIES = [
        { key: 'game', label: '🎮 Trò chơi', icon: 'game' },
        { key: 'music', label: '🎵 Nhạc', icon: 'music' },
        { key: 'video', label: '🎬 Video & Phim', icon: 'video' },
        { key: 'social', label: '💬 Mạng xã hội', icon: 'social' },
        { key: 'photo', label: '📸 Ảnh & Video', icon: 'photo' },
        { key: 'utility', label: '🛠 Tiện ích', icon: 'utility' },
        { key: 'productivity', label: '💼 Năng suất', icon: 'productivity' },
        { key: 'health', label: '🏃 Sức khỏe & Thể hình', icon: 'health' },
        { key: 'shopping', label: '🛍 Mua sắm', icon: 'shopping' },
        { key: 'education', label: '🎓 Giáo dục', icon: 'education' },
        { key: 'finance', label: '💰 Tài chính', icon: 'finance' },
        { key: 'travel', label: '🗺 Du lịch', icon: 'travel' },
        { key: 'books', label: '📖 Sách & Tin tức', icon: 'books' },
        { key: 'food', label: '🍔 Đồ ăn & Thức uống', icon: 'food' },
        { key: 'other', label: '📦 Khác', icon: 'other' }
    ];

    const CATEGORY_RULES = {
        game: /game|play|trò chơi|sport|football|soccer|racing|puzzle|adventure|action|casino|slot|poker|card|chess|board|rpg|mmorpg|battle|fight|war|gun|shoot|zombie|minecraft|roblox|pubg|garena|league|valorant|clash|dragon|hero|quest|dungeon|candy|crush|angry|bird|temple|run|subway|surfer|sonic|mario|pokemon|car|racing|drift/i,
        music: /music|nhạc|audio|sound|beat|melody|tune|song|sing|karaoke|piano|guitar|drum|dj|mix|radio|podcast|spotify|deezer|nhaccuatui|zing|mp3|tone|ring/i,
        video: /video|phim|movie|film|tv|show|anime|netflix|youtube|tiktok|stream|watch|player|cinema|drama|series|clip|reel|shorts|iptv|live|broadcast/i,
        social: /chat|social|message|nhắn|zalo|facebook|messenger|instagram|twitter|telegram|wechat|line|viber|snap|discord|forum|dating|hẹn|meet|call|video call|facetime|whatsapp|tinder|bumble/i,
        photo: /photo|ảnh|camera|selfie|beauty|edit|filter|collage|design|art|draw|paint|photoshop|lightroom|canva|figma|illustrator|procreate|pic|image|gallery|album/i,
        utility: /utility|util|clean|boost|battery|wifi|scan|qr|file|manager|backup|cloud|vpn|proxy|adblock|keyboard|launcher|lock|wallpaper|widget|theme|icon|pack|shortcut|automation|torrent|download|unzip|compress|converter/i,
        productivity: /note|ghi chú|calendar|lịch|remind|nhắc|todo|task|mail|email|office|word|excel|powerpoint|docs|sheet|slide|pdf|scan|print|translate|dịch|ai|assistant|trợ lý|clock|alarm|timer|stopwatch|focus|pomodoro/i,
        health: /health|sức khỏe|fitness|workout|exercise|tập|gym|yoga|medit|sleep|ngủ|run|walk|step|calorie|diet|ăn|water|nước|heart|blood|pressure|period|cycle/i,
        shopping: /shop|mua|bán|store|cửa hàng|market|chợ|lazada|shoppe|tiki|sendo|amazon|ebay|deal|discount|giảm|giá|coupon|voucher|fashion|thời trang|cloth|quần áo|shoe|giày/i,
        education: /education|giáo dục|học|learn|study|school|trường|university|đại học|course|khóa học|quiz|test|exam|thi|book|sách|language|ngôn ngữ|english|tiếng anh|math|toán|science|code|program/i,
        finance: /bank|ngân hàng|finance|tài chính|money|tiền|pay|thanh toán|invest|đầu tư|stock|chứng khoán|crypto|bitcoin|blockchain|wallet|ví|momo|zalopay|vnpay|tax|thuế|budget|expense|chi tiêu/i,
        travel: /travel|du lịch|tour|hotel|khách sạn|flight|vé|bus|xe|taxi|grab|be|map|bản đồ|gps|navigate|đường|guide|hướng dẫn|booking|agoda|airbnb|trip/i,
        books: /book|sách|news|tin tức|báo|magazine|tạp chí|read|đọc|comic|truyện|manga|novel|tiểu thuyết|library|thư viện|rss|feed|blog|article/i,
        food: /food|ăn|đồ ăn|thức uống|drink|nấu|cook|recipe|công thức|restaurant|nhà hàng|order|đặt|delivery|giao|pizza|burger|coffee|cà phê|trà sữa|milk tea/i
    };

    function categorizeApp(app) {
        const searchText = `${app.name || ''} ${app.bundleIdentifier || app.bundleID || ''} ${app.localizedDescription || app.description || ''}`.toLowerCase();
        for (const { key } of CATEGORIES) {
            if (key === 'other') continue;
            if (CATEGORY_RULES[key].test(searchText)) return key;
        }
        return 'other';
    }

    // ── Render Apps (Apple Store style with categories) ──
    function renderApps(apps, flat = false) {
        appListEl.innerHTML = '';
        emptyStateEl.classList.add('d-none');
        errorEl.classList.add('d-none');

        if (apps.length === 0) {
            emptyStateEl.classList.remove('d-none');
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const descEl = entry.target.querySelector('.app-desc[data-raw]');
                if (!descEl) return;
                const raw = descEl.getAttribute('data-raw');
                descEl.removeAttribute('data-raw');
                observer.unobserve(entry.target);
                translateText(raw).then(translated => { descEl.textContent = translated; });
            });
        }, { rootMargin: '200px' });

        function buildAppItem(app) {
            const downloadUrl = app.downloadURL || app.ipaURL || app.url || app.down || '';
            const iconUrl = app.iconURL || app.icon || '';
            const version = app.version || '';
            const size = app.size ? formatSize(app.size) : '';
            const description = app.localizedDescription || app.description || app.subtitle || '';

            const item = document.createElement('div');
            item.className = 'app-list-item';
            if (downloadUrl) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.get-btn')) return;
                    window.open(downloadUrl, '_blank');
                });
            }
            item.innerHTML = `
                ${iconUrl ? `<img src="${iconUrl.replace(/"/g,'&quot;')}" class="app-icon" alt="${(app.name||'').replace(/"/g,'&quot;')}" loading="lazy" onerror="this.style.display='none'">` : `<div class="app-icon" style="display:flex;align-items:center;justify-content:center;color:#C7C7CC;font-size:24px;"><i class="bi bi-app"></i></div>`}
                <div class="app-info">
                    <div class="app-name">${(app.name || 'Không tên').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                    ${description ? `<div class="app-desc" data-raw="${description.replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}">${description.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
                    <div class="app-meta">
                        ${version ? `<span class="app-badge">v${version.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>` : ''}
                        ${size ? `<span class="app-badge">${size}</span>` : ''}
                    </div>
                </div>
                ${downloadUrl ? `<a href="${downloadUrl.replace(/"/g,'&quot;')}" class="get-btn" target="_blank" onclick="event.stopPropagation()">NHẬN</a>` : ''}
            `;
            return item;
        }

        if (flat) {
            apps.forEach(app => {
                const item = buildAppItem(app);
                appListEl.appendChild(item);
                const desc = app.localizedDescription || app.description || app.subtitle || '';
                if (desc) observer.observe(item);
            });
            return;
        }

        // Group by category
        const groups = new Map();
        apps.forEach(app => {
            const cat = categorizeApp(app);
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(app);
        });

        // Sort categories by order in CATEGORIES
        const sortedKeys = CATEGORIES.map(c => c.key).filter(k => groups.has(k));

        sortedKeys.forEach(catKey => {
            const catApps = groups.get(catKey);
            const catInfo = CATEGORIES.find(c => c.key === catKey);

            const section = document.createElement('div');
            section.className = 'category-section';
            section.innerHTML = `<div class="category-header">
                <span class="category-icon">${catInfo.label.split(' ')[0]}</span>
                <span class="category-title">${catInfo.label.replace(/^\S+\s/, '')}</span>
                <span class="category-count">${catApps.length}</span>
            </div>`;

            const list = document.createElement('div');
            list.className = 'category-apps';

            // Sort apps by name within category
            catApps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            catApps.forEach(app => {
                const item = buildAppItem(app);
                list.appendChild(item);
                const desc = app.localizedDescription || app.description || app.subtitle || '';
                if (desc) observer.observe(item);
            });

            section.appendChild(list);
            appListEl.appendChild(section);
        });
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        const mb = bytes / 1024 / 1024;
        if (mb >= 1000) return (mb / 1024).toFixed(1) + ' GB';
        return mb.toFixed(0) + ' MB';
    }

    // ── Redraw with current filter ──
    function redrawApps() {
        filteredAppsList = activeCategory === 'all' ? currentApps : currentApps.filter(app => categorizeApp(app) === activeCategory);
        currentPage = 1;
        const totalPages = Math.ceil(filteredAppsList.length / PAGE_SIZE);
        appsSectionTitle.textContent = `${activeCategory === 'all' ? 'Ứng dụng' : document.querySelector('.category-filter-item.active')?.textContent || 'Ứng dụng'} (${filteredAppsList.length})`;
        renderPage();
        updatePagination(totalPages);
    }

    // ── Render current page ──
    function renderPage() {
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = Math.min(startIdx + PAGE_SIZE, filteredAppsList.length);
        const pageApps = filteredAppsList.slice(startIdx, endIdx);
        renderApps(pageApps, true);
    }

    // ── Update Pagination Controls ──
    function updatePagination(totalPages) {
        if (totalPages <= 1) {
            paginationContainer.classList.add('d-none');
            return;
        }
        paginationContainer.classList.remove('d-none');
        paginationInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
        paginationFirst.disabled = currentPage === 1;
        paginationPrev.disabled = currentPage === 1;
        paginationNext.disabled = currentPage === totalPages;
        paginationLast.disabled = currentPage === totalPages;
    }

    // ── Go to page ──
    function goToPage(page) {
        currentPage = page;
        const totalPages = Math.ceil(filteredAppsList.length / PAGE_SIZE);
        renderPage();
        updatePagination(totalPages);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── Category Filter ──
    document.getElementById('categoryFilterBar').addEventListener('click', (e) => {
        const item = e.target.closest('.category-filter-item');
        if (!item) return;
        document.querySelectorAll('.category-filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        activeCategory = item.dataset.category;
        searchInput.value = '';
        redrawApps();
    });

    // ── Search ──
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filterBar = document.getElementById('categoryFilterBar');
        if (!searchTerm) {
            filterBar.style.display = 'flex';
            redrawApps();
            return;
        }
        filterBar.style.display = 'none';
        filteredAppsList = currentApps.filter(app => 
            (app.name && app.name.toLowerCase().includes(searchTerm)) || 
            (app.bundleIdentifier && app.bundleIdentifier.toLowerCase().includes(searchTerm))
        );
        currentPage = 1;
        const totalPages = Math.ceil(filteredAppsList.length / PAGE_SIZE);
        appsSectionTitle.textContent = `Kết quả (${filteredAppsList.length})`;
        renderPage();
        updatePagination(totalPages);
    });

    // ── Pagination Events ──
    paginationFirst.addEventListener('click', () => goToPage(1));
    paginationPrev.addEventListener('click', () => goToPage(currentPage - 1));
    paginationNext.addEventListener('click', () => goToPage(currentPage + 1));
    paginationLast.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredAppsList.length / PAGE_SIZE);
        goToPage(totalPages);
    });

    // ── Init ──
    headerTitle.textContent = 'IPA Store';
    headerSubtitle.textContent = '';

    // Thử load từ localStorage cache trước để hiển thị ngay lập tức
    const cachedAppsStr = localStorage.getItem('cached_apps');
    if (cachedAppsStr) {
        try {
            const cached = JSON.parse(cachedAppsStr);
            if (cached && cached.length > 0) {
                currentApps = cached;
                console.log('Đã tải ' + cached.length + ' ứng dụng từ localStorage cache');
                headerTitle.textContent = 'Tất cả';
                appsSectionTitle.classList.remove('d-none');
                redrawApps();
                hideLoading();
            }
        } catch (e) {
            console.error('Lỗi parse localStorage cache:', e);
        }
    }

    loadRepos().then(() => fetchAllRepos());
});