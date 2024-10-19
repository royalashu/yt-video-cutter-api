const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

// Allow CORS for your Chrome extension
const allowedOrigins = ['chrome-extension://pkggpaipfaghkhpikfddklfnmomhmmjh']; // Replace with your actual extension ID

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
}));

app.use(express.json());

// Store metadata about files
const metadataFilePath = path.join(__dirname, 'files_metadata.json');

// Load existing metadata or create a new object
let filesMetadata = {};
if (fs.existsSync(metadataFilePath)) {
    filesMetadata = JSON.parse(fs.readFileSync(metadataFilePath));
}

// Schedule a task to delete files older than 1 hour every hour
cron.schedule('0 * * * *', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000; // One hour in milliseconds
    Object.keys(filesMetadata).forEach(filename => {
        if (filesMetadata[filename] < oneHourAgo) {
            const filePath = path.join(__dirname, filename);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Error deleting file ${filename}:`, err);
                } else {
                    console.log(`File ${filename} deleted successfully after 1 hour.`);
                    delete filesMetadata[filename]; // Remove from metadata
                }
            });
        }
    });
    // Update the metadata file
    fs.writeFileSync(metadataFilePath, JSON.stringify(filesMetadata));
});

app.post('/cut-video', (req, res) => {
    const { videoUrl, startTime, endTime } = req.body;

    // Generate a unique output file name
    const outputFilename = `output-${Date.now()}.mp4`;

    // Construct the yt-dlp and FFmpeg command
    const downloadCommand = `yt-dlp -f best -o "input.%(ext)s" "${videoUrl}"`;
    const cutCommand = `ffmpeg -i input.mp4 -ss ${startTime} -to ${endTime} -c copy ${outputFilename}`;

    // Run yt-dlp to download the video first
    exec(downloadCommand, (downloadErr, downloadStdout, downloadStderr) => {
        if (downloadErr) {
            console.error('Download Error:', downloadStderr);
            return res.status(500).json({ message: 'Error downloading video.' });
        }

        // Run FFmpeg to cut the video
        exec(cutCommand, (cutErr, cutStdout, cutStderr) => {
            if (cutErr) {
                console.error('FFmpeg Error:', cutStderr);
                return res.status(500).json({ message: 'Error cutting video.' });
            }

            // Update metadata to store the file creation time
            filesMetadata[outputFilename] = Date.now();
            fs.writeFileSync(metadataFilePath, JSON.stringify(filesMetadata));

            // If successful, respond with the path to the output file
            return res.status(200).json({ message: 'Video cut successfully!', downloadLink: `http://localhost:${PORT}/download/${outputFilename}` });
        });
    });
});

app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('Error serving the file:', err);
                return res.status(500).send('Error downloading the file.');
            }
            console.log(`Serving file: ${filePath}`);
            // Optionally, remove the file from metadata (to prevent it from being deleted by the cron job)
            delete filesMetadata[filename];
            fs.writeFileSync(metadataFilePath, JSON.stringify(filesMetadata));
        });
    } else {
        console.log(`File ${filePath} not found.`);
        res.status(404).send('File not found.');
    }
});

// Serve the cut videos
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
