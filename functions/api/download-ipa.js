export async function onRequest(context) {
    const { request } = context;
    const urlObj = new URL(request.url);
    const ipaUrl = urlObj.searchParams.get('url');
    const filename = urlObj.searchParams.get('name') || 'app.ipa';
    const checkOnly = urlObj.searchParams.get('check') === 'true';

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type'
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

    if (!ipaUrl) {
        return new Response(JSON.stringify({ error: 'Thiếu URL tải xuống', alive: false }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Nếu chỉ kiểm tra link (checkOnly)
    if (checkOnly) {
        try {
            // Thử HEAD request trước
            const response = await fetch(ipaUrl, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                }
            });

            if (response.ok) {
                return new Response(JSON.stringify({
                    alive: true,
                    status: response.status,
                    size: response.headers.get('content-length') ? parseInt(response.headers.get('content-length'), 10) : null,
                    contentType: response.headers.get('content-type')
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Nếu HEAD lỗi (403, 405), thử GET với Range header để tránh tải toàn bộ file
            if (response.status === 403 || response.status === 405) {
                const getResponse = await fetch(ipaUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                        'Range': 'bytes=0-0'
                    }
                });

                return new Response(JSON.stringify({
                    alive: getResponse.ok || getResponse.status === 206,
                    status: getResponse.status,
                    size: getResponse.headers.get('content-length') ? parseInt(getResponse.headers.get('content-length'), 10) : null,
                    contentType: getResponse.headers.get('content-type')
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({
                alive: false,
                status: response.status,
                error: `Server trả về HTTP ${response.status}`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({
                alive: false,
                status: 0,
                error: `Lỗi kết nối: ${error.message}`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    try {
        const response = await fetch(ipaUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
            }
        });

        if (!response.ok) {
            let errorMsg = `Lỗi khi tải file IPA từ nguồn: HTTP ${response.status}`;
            if (response.status === 404) {
                errorMsg = 'File IPA không tồn tại (404 - đã bị xóa hoặc gỡ)';
            } else if (response.status === 403) {
                errorMsg = 'Không có quyền truy cập file IPA (403 Forbidden)';
            }
            return new Response(errorMsg, {
                status: 502,
                headers: corsHeaders
            });
        }

        // Kiểm tra content-type để đảm bảo là file nhị phân, không phải HTML lỗi
        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length');
        if (contentType.includes('text/html') && contentLength && parseInt(contentLength, 10) < 1000) {
            return new Response('Link tải không còn tồn tại (server trả về HTML thay vì file IPA)', {
                status: 502,
                headers: corsHeaders
            });
        }

        // Tạo response mới với header Content-Disposition để ép tải xuống
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        newHeaders.set('Content-Type', 'application/octet-stream');
        newHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch (error) {
        return new Response(`Lỗi kết nối: ${error.message}`, {
            status: 500,
            headers: corsHeaders
        });
    }
}