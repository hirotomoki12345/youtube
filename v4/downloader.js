const baseurls = "https://youtubedownload.psannetwork.net";
const apiurls = {
    request: `${baseurls}/request`,
    download: `${baseurls}/download`,
};

async function downloadVideos(urls, format = 'mp3') {
    try {
        const response = await fetch(apiurls.request, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls, format }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Request failed: ${errorData.error}`);
        }

        const data = await response.json();
        console.log('Download IDs:', data.ids);

        return await checkDownloadStatus(data.ids);
    } catch (error) {
        console.error('Error downloading videos:', error);
        return [];
    }
}

async function checkDownloadStatus(ids, interval = 1000) {
    const completedDownloads = [];

    await Promise.all(
        ids.map(id =>
            new Promise(resolve => {
                const intervalId = setInterval(async () => {
                    try {
                        const response = await fetch(`${apiurls.download}?id=${id}`);
                        if (!response.ok) throw new Error('Error fetching download status');
                        
                        const status = await response.json();
                        console.log(`Download Status for ID ${id}:`, status);

                        if (status.status === 'completed') {
                            console.log(`Download completed: ${status.url}`);
                            completedDownloads.push(status.url);
                            clearInterval(intervalId);
                            resolve(status.url);
                        }
                    } catch (error) {
                        console.error('Error fetching download status:', error);
                    }
                }, interval);
            })
        )
    );

    return completedDownloads;
}

async function youtubeDL(videoUrl, format = 'mp3') {
    const urlsArray = [videoUrl];
    
    try {
        const downloadUrls = await downloadVideos(urlsArray, format);
        downloadUrls.forEach(url => createDownloadLink(url));
        return downloadUrls.map(url => `${baseurls}${url}`);
    } catch (error) {
        console.error('Error during downloading:', error);
        throw error; 
    }
}

function createDownloadLink(url) {
    const downloadUrl = url.startsWith('http') ? url : `${baseurls}${url}`; 
    const filename = downloadUrl.split('/').pop(); 
    
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl; 
    downloadLink.download = filename; 
    downloadLink.style.display = 'none'; 
    document.body.appendChild(downloadLink); 
    
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

//youtubeDL("https://www.youtube.com/watch?v=nwtes0ETrtY&ab_channel=NatumeSaki", "mp3")
  //  .then(links => console.log("ダウンロードリンク:", links))
    //.catch(error => console.error("ダウンロードに失敗しました:", error));

// <script src="https://hirotomoki12345.github.io/youtube/v4/downloader.js"></script>
//　これを読み込んでからね
