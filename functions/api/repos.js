export async function onRequest(context) {
    const { request } = context;
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
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            }
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
            "https://api.unkeyapp.com/v1/application/source.json"
        ];
        return new Response(JSON.stringify(fallbackRepos), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}