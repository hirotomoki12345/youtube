const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const youtubedl = require('youtube-dl-exec');

const app = express();
const port = 3020;
const tmpDir = path.join(__dirname, 'tmp');
const downloadStatus = {};

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/tmp', express.static(tmpDir));

app.all('/request', async (req, res) => {
  const rawUrl = req.method === 'GET' ? req.query.url : req.body.url;
  const url = formatYoutubeUrl(rawUrl);
  
  if (!url) {
    return res.status(400).json({ error: 'URLが無効です。YouTubeのビデオIDが見つかりません。' });
  }

  const id = Math.random().toString(36).substring(7);
  const videoDir = path.join(tmpDir, id);
  fs.mkdirSync(videoDir);
  downloadStatus[id] = { status: 'downloading', progress: 0, speed: 0, timeRemaining: 0 };

  try {
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    });

    if (!output.fulltitle) {
      console.error('動画のタイトルが取得できませんでした。');
      return res.status(500).json({ error: '動画情報の取得中にエラーが発生しました。' });
    }

    const title = sanitizeFilename(output.fulltitle);
    const finalFilePath = path.join(videoDir, `${title}.mp4`);
    const fileSize = output.filesize || output.contentLength;

    const downloadProcess = youtubedl.exec(url, {
      output: finalFilePath,
      format: 'best'
    });

    let startTime = Date.now();
    
    downloadProcess.stdout.on('data', (data) => {
      const progressMatch = data.toString().match(/(\d+\.\d+)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        downloadStatus[id].progress = progress;

        if (progress > 0) {
          const elapsedTime = (Date.now() - startTime) / 1000;

          const remainingPercentage = 100 - progress;
          if (remainingPercentage > 0) {
            downloadStatus[id].timeRemaining = (elapsedTime / progress) * remainingPercentage;
          }

          const downloadedBytes = (fileSize * (progress / 100));
          downloadStatus[id].speed = downloadedBytes / elapsedTime;
        }
      }
    });

    downloadProcess.on('exit', (code) => {
      if (code === 0) {
        downloadStatus[id].status = 'completed';
        downloadStatus[id].url = `/tmp/${id}/${title}.mp4`;
      } else {
        downloadStatus[id].status = 'error';
      }
    });

    res.json({ id });
  } catch (error) {
    console.error('Error fetching video info:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: '動画情報の取得中にエラーが発生しました。' });
    }
  }
});

app.post('/download', (req, res) => {
  const { id } = req.body;
  const status = downloadStatus[id];
  if (status) {
    res.json(status);
  } else {
    res.status(404).json({ error: 'IDが見つかりません。' });
  }
});

app.get('/download', (req, res) => {
  const { id } = req.query;
  const status = downloadStatus[id];
  if (status) {
    res.json(status);
  } else {
    res.status(404).json({ error: 'IDが見つかりません。' });
  }
});

function formatYoutubeUrl(url) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^&\n]{11})/;
  const match = url.match(regex);
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
}

function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]+/g, '_').trim();
}

function deleteDirectoryRecursive(dir) {
  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error(`Error reading directory: ${dir}`, err);
      return;
    }

    let remaining = files.length;
    if (remaining === 0) {
      // ディレクトリが空の場合、直接削除
      fs.rmdir(dir, (err) => {
        if (err) console.error(`Error deleting directory: ${dir}`, err);
      });
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting stats for file: ${filePath}`, err);
          return;
        }

        if (stats.isDirectory()) {
          // ディレクトリの場合、再帰的に削除
          deleteDirectoryRecursive(filePath);
        } else {
          // ファイルの場合、削除
          fs.unlink(filePath, (err) => {
            if (err) console.error(`Error deleting file: ${filePath}`, err);
            if (--remaining === 0) {
              // すべてのファイルが削除されたらディレクトリを削除
              fs.rmdir(dir, (err) => {
                if (err) console.error(`Error deleting directory: ${dir}`, err);
              });
            }
          });
        }
      });
    });
  });
}


setInterval(() => {
  fs.readdir(tmpDir, (err, dirs) => {
    if (err) return;
    dirs.forEach((dir) => {
      const dirPath = path.join(tmpDir, dir);
      fs.stat(dirPath, (err, stats) => {
        if (err) return;
        const now = Date.now();
        if (now - stats.mtimeMs > 1 * 60 * 1000) {
          deleteDirectoryRecursive(dirPath);
        }
      });
    });
  });
}, 1 * 60 * 1000);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
