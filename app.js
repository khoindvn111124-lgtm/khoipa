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

    let allMergedApps = [];  // Toàn bộ dữ liệu tĩnh tải về 1 lần
    let allAppsLoaded = false;

    
    let currentPage = 1;
    const PAGE_SIZE = 50;
    let serverTotalApps = 0;
    let serverTotalPages = 0;
    let currentSearchTerm = '';
    let activeCategory = 'all';

    const getTranslateUrl = (text) => {
        return `/api/translate?q=${encodeURIComponent(text)}`;
    };

    // ── Load Repos (Apple list style) ──
    async function loadRepos() {
        try {
            // Tải danh sách repo trực tiếp từ file khoipa.txt tĩnh trên host
            const response = await fetch('/khoipa.txt');
            if (!response.ok) throw new Error('Không thể tải khoipa.txt');
            const text = await response.text();
            allRepos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            renderRepoList(allRepos);
        } catch (error) {
            console.error('Lỗi tải danh sách repo từ khoipa.txt:', error);
            // Fallback nếu không tải được file
            allRepos = [
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
            renderRepoList(allRepos);
        }
    }

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
            } else if (pageId === 'appsPage') {
                headerTitle.textContent = 'IPA Store';
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
                <div class="repo-count" style="margin-left: 8px;"><i class="bi bi-plus-circle-fill" style="color: var(--app-blue); font-size: 18px;"></i></div>
            `;
            div.addEventListener('click', () => {
                window._openAddSourceModal(repo);
            });
            repoListEl.appendChild(div);
        });
    }

    function getAppDate(app) {
        const dateStr = app.versionDate || app.date || app.addedDate || app.timestamp || '';
        if (!dateStr) return 0;
        if (!isNaN(dateStr)) return Number(dateStr);
        const parsed = Date.parse(dateStr);
        return isNaN(parsed) ? 0 : parsed;
    }

    // ── Fetch All Repos (Tải file repo.json tĩnh và xử lý client-side) ──
    async function fetchAllRepos() {
        const loadingTextEl = document.getElementById('loadingText');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        
        loadingEl.style.display = 'flex';
        if (loadingTextEl) loadingTextEl.textContent = 'Đang tải...';
        if (progressContainer) { progressContainer.style.display = 'block'; progressBar.style.width = '30%'; }
        
        errorEl.classList.add('d-none');
        emptyStateEl.classList.add('d-none');
        appListEl.innerHTML = '';
        
        headerTitle.textContent = 'Tất cả';
        headerSubtitle.textContent = 'Đang tải...';
        appsSectionTitle.classList.add('d-none');

        try {
            // Tải file repo.json tĩnh nếu chưa tải
            if (!allAppsLoaded) {
                if (progressContainer) progressBar.style.width = '50%';
                const response = await fetch('/repo.json');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                allMergedApps = data.apps && Array.isArray(data.apps) ? data.apps : [];
                allAppsLoaded = true;
            }

            if (progressContainer) progressBar.style.width = '80%';

            // Thực hiện lọc client-side
            let filteredApps = allMergedApps;

            // Lọc theo danh mục
            if (activeCategory && activeCategory !== 'all') {
                filteredApps = filteredApps.filter(app => categorizeApp(app) === activeCategory);
            }

            // Lọc theo từ khóa tìm kiếm
            if (currentSearchTerm) {
                const q = currentSearchTerm.toLowerCase();
                filteredApps = filteredApps.filter(app =>
                    (app.name && app.name.toLowerCase().includes(q)) ||
                    (app.bundleIdentifier && app.bundleIdentifier.toLowerCase().includes(q))
                );
            }

            serverTotalApps = filteredApps.length;
            serverTotalPages = Math.ceil(serverTotalApps / PAGE_SIZE);

            // Cắt mảng theo trang hiện tại
            const startIdx = (currentPage - 1) * PAGE_SIZE;
            const endIdx = Math.min(startIdx + PAGE_SIZE, serverTotalApps);
            const pageApps = filteredApps.slice(startIdx, endIdx);

            appsSectionTitle.classList.remove('d-none');
            
            // Cập nhật tiêu đề phần ứng dụng
            if (currentSearchTerm) {
                appsSectionTitle.textContent = `Kết quả (${serverTotalApps})`;
                headerSubtitle.textContent = `Tìm thấy ${serverTotalApps.toLocaleString()} ứng dụng`;
            } else {
                const catItem = document.querySelector('.category-filter-item.active');
                const catName = catItem ? catItem.textContent : 'Ứng dụng';
                appsSectionTitle.textContent = `${catName} (${serverTotalApps})`;
                headerSubtitle.textContent = `${serverTotalApps.toLocaleString()} ứng dụng`;
            }

            // Render danh sách ứng dụng
            renderApps(pageApps, true);
            updatePagination(serverTotalPages);
        } catch (error) {
            console.error('Lỗi tải repo.json:', error);
            errorEl.textContent = 'Không thể tải dữ liệu. Vui lòng thử lại.';
            errorEl.classList.remove('d-none');
            headerSubtitle.textContent = '';
        } finally {
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressBar) progressBar.style.width = '100%';
            hideLoading();
        }
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

            // Ẩn chữ "unkeyapp" hoặc "unkey" khỏi tên ứng dụng và mô tả nếu có
            let cleanName = app.name || 'Không tên';
            cleanName = cleanName.replace(/unkeyapp/gi, '').replace(/unkey/gi, '').trim();
            if (!cleanName) cleanName = 'Ứng dụng';

            let cleanDesc = description;
            if (cleanDesc) {
                cleanDesc = cleanDesc.replace(/unkeyapp/gi, '').replace(/unkey/gi, '').trim();
            }

            if (downloadUrl) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.get-btn')) return;
                    // Tải trực tiếp file IPA về máy
                    window._downloadIPA(downloadUrl, cleanName);
                });
            }
            
            const buttonHtml = downloadUrl 
                ? `<button class="get-btn" onclick="event.stopPropagation(); window._downloadIPA('${downloadUrl.replace(/'/g, "\\'")}', '${cleanName.replace(/'/g, "\\'")}')">NHẬN</button>`
                : '';

            item.innerHTML = `
                ${iconUrl ? `<img src="${iconUrl.replace(/"/g,'&quot;')}" class="app-icon" alt="${cleanName.replace(/"/g,'&quot;')}" loading="lazy" onerror="this.style.display='none'">` : `<div class="app-icon" style="display:flex;align-items:center;justify-content:center;color:#C7C7CC;font-size:24px;"><i class="bi bi-app"></i></div>`}
                <div class="app-info">
                    <div class="app-name">${cleanName.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                    ${cleanDesc ? `<div class="app-desc" data-raw="${cleanDesc.replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}">${cleanDesc.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
                    <div class="app-meta">
                        ${version ? `<span class="app-badge">v${version.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>` : ''}
                        ${size ? `<span class="app-badge">${size}</span>` : ''}
                    </div>
                </div>
                ${buttonHtml}
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

            // Sort apps by date newest first within category, then by name
            catApps.sort((a, b) => {
                const dateA = getAppDate(a);
                const dateB = getAppDate(b);
                if (dateA !== dateB) return dateB - dateA;
                return (a.name || '').localeCompare(b.name || '');
            });

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

    // ── Go to page ──
    function goToPage(page) {
        currentPage = page;
        fetchAllRepos();
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // ── Category Filter ──
    document.getElementById('categoryFilterBar').addEventListener('click', (e) => {
        const item = e.target.closest('.category-filter-item');
        if (!item) return;
        document.querySelectorAll('.category-filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        activeCategory = item.dataset.category;
        searchInput.value = '';
        currentSearchTerm = '';
        currentPage = 1;
        fetchAllRepos();
    });

    // ── Search ──
    let searchTimeout = null;
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim();
        const filterBar = document.getElementById('categoryFilterBar');
        
        // Debounce tìm kiếm để tránh gửi quá nhiều request liên tục lên server
        if (searchTimeout) clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(() => {
            currentSearchTerm = searchTerm;
            currentPage = 1;
            
            if (!searchTerm) {
                filterBar.style.display = 'flex';
            } else {
                filterBar.style.display = 'none';
            }
            
            fetchAllRepos();
        }, 400); // Chờ 400ms sau khi người dùng dừng gõ
    });

    // ── Pagination Events ──
    paginationFirst.addEventListener('click', () => goToPage(1));
    paginationPrev.addEventListener('click', () => goToPage(currentPage - 1));
    paginationNext.addEventListener('click', () => goToPage(currentPage + 1));
    paginationLast.addEventListener('click', () => {
        goToPage(serverTotalPages);
    });

    // ── Download IPA trực tiếp ──
    window._downloadIPA = async (downloadUrl, appName) => {
        if (!downloadUrl) return;
        
        const cleanName = (appName || 'app').replace(/[^a-zA-Z0-9-_]/g, '_') + '.ipa';
        
        // Dùng API download proxy để ép tải file (server.js sẽ stream file và set Content-Disposition)
        window.location.href = `/api/download-ipa?url=${encodeURIComponent(downloadUrl)}&name=${encodeURIComponent(cleanName)}`;
    };

    // ── Install Modal (giữ lại cho nguồn repo) ──
    let _installData = null;
    window._openInstallModal = (appName, downloadUrl) => {
        _installData = { appName, downloadUrl };
        document.getElementById('installModalAppName').textContent = appName;
        document.getElementById('installModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    window._closeInstallModal = () => {
        document.getElementById('installModal').classList.remove('active');
        document.body.style.overflow = '';
        _installData = null;
    };
    window._installAction = (target) => {
        if (!_installData) return;
        const { downloadUrl } = _installData;
        if (target === 'esign') {
            window.location.href = `esign://install?url=${encodeURIComponent(downloadUrl)}`;
        } else if (target === 'feather') {
            window.location.href = `feather://install?url=${encodeURIComponent(downloadUrl)}`;
        } else if (target === 'ksign') {
            window.location.href = `ksign://install?url=${encodeURIComponent(downloadUrl)}`;
        } else if (target === 'direct') {
            // Tải trực tiếp file IPA về máy qua proxy để đảm bảo trình duyệt hiện popup tải về
            window._downloadIPA(downloadUrl, _installData.appName);
        }
        window._closeInstallModal();
    };
    
    // Close install modal on overlay click
    document.getElementById('installModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            window._closeInstallModal();
        }
    });

    // ── Add Source Modal ──
    let _addSourceUrl = null;
    window._openAddSourceModal = (repoUrl) => {
        _addSourceUrl = repoUrl;
        document.getElementById('addSourceModalUrl').textContent = repoUrl;
        document.getElementById('addSourceModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    window._closeAddSourceModal = () => {
        document.getElementById('addSourceModal').classList.remove('active');
        document.body.style.overflow = '';
        _addSourceUrl = null;
    };
    window._addSourceAction = (target) => {
        if (!_addSourceUrl) return;
        const repoUrl = _addSourceUrl;
        if (target === 'esign') {
            window.location.href = `esign://addsource?url=${repoUrl}`;
        } else if (target === 'feather') {
            window.location.href = `feather://addsource?url=${repoUrl}`;
        } else if (target === 'ksign') {
            window.location.href = `ksign://addsource?url=${repoUrl}`;
        } else if (target === 'gbox') {
            window.location.href = `gbox://addsource?url=${repoUrl}`;
        } else if (target === 'copy') {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(repoUrl).then(() => {
                    alert('Đã sao chép URL nguồn!');
                }).catch(() => {
                    alert('URL nguồn: ' + repoUrl);
                });
            } else {
                alert('URL nguồn: ' + repoUrl);
            }
        }
        window._closeAddSourceModal();
    };
    
    // Close add source modal on overlay click
    document.getElementById('addSourceModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            window._closeAddSourceModal();
        }
    });

    // ── Quick Add Source (thêm nguồn tổng hợp động theo domain hiện tại) ──
    window._quickAddSource = (target) => {
        const repoUrl = window.location.origin + '/repo.json';
        if (target === 'esign') {
            window.location.href = `esign://addsource?url=${repoUrl}`;
        } else if (target === 'feather') {
            window.location.href = `feather://addsource?url=${repoUrl}`;
        } else if (target === 'ksign') {
            window.location.href = `ksign://addsource?url=${repoUrl}`;
        } else if (target === 'gbox') {
            window.location.href = `gbox://addsource?url=${repoUrl}`;
        }
    };

    window._copyRepoUrl = () => {
        const repoUrl = window.location.origin + '/repo.json';
        if (navigator.clipboard) {
            navigator.clipboard.writeText(repoUrl).then(() => {
                alert('Đã sao chép URL nguồn tổng hợp!');
            }).catch(() => {
                alert('URL nguồn: ' + repoUrl);
            });
        } else {
            alert('URL nguồn: ' + repoUrl);
        }
    };

    // ── Init ──
    headerTitle.textContent = 'IPA Store';
    headerSubtitle.textContent = '';

    loadRepos().then(() => fetchAllRepos());
});