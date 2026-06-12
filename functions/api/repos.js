export async function onRequest(context) {
    const { request } = context;
    
    // Cấu hình CORS headers
    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
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

    try {
        // Fetch file khoipa.txt từ chính domain đang chạy
        const url = new URL('/khoipa.txt', request.url);
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error('Không thể đọc file khoipa.txt');
        }
        const text = await response.text();
        const repos = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        return new Response(JSON.stringify(repos), {
            headers: corsHeaders
        });
    } catch (error) {
        // Fallback nếu không fetch được file
        const fallbackRepos = [
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
        return new Response(JSON.stringify(fallbackRepos), {
            headers: corsHeaders
        });
    }
}