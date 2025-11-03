const express = require('express');
const multer = require('multer');
const gifFrames = require('gif-frames');
const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

//multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

//api endpoint
app.post('/overlay', upload.single('gif'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No GIF file uploaded' });
    }

    const { text, fontSize = 32, x = 100, y = 100, angle = 0, color = '#000000' } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text parameter is required' });
    }

    const inputPath = req.file.path;
    const outputFilename = `${uuidv4()}.gif`;
    const outputPath = path.join(__dirname, 'outputs', outputFilename);

    try {
        // Extracting all frames from input GIF 
        const frameData = await gifFrames({
            url: inputPath,
            frames: 'all',
            outputType: 'png',
            cumulative: true,
        });

        const width = frameData[0].frameInfo.width;
        const height = frameData[0].frameInfo.height;

        // Set up GIF encoder
        const encoder = new GIFEncoder(width, height);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setQuality(50);

        for (const frame of frameData) {
            // Get frame as buffer
            const stream = frame.getImage();
            const buffer = await streamToBuffer(stream);

            // Load into canvas and draw original frame
            const image = await loadImage(buffer);
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            // Adding rotated text here
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle * Math.PI / 180);
            ctx.fillStyle = color;
            ctx.font = `${fontSize}px Arial`; // You can change 'Arial' to any installed font
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, 0);
            ctx.restore();

            // Adding frame to encoder with original delay
            encoder.setDelay(frame.frameInfo.delay * 10); //Converting to ms
            encoder.addFrame(ctx);
        }

        encoder.finish();
        const outputBuffer = encoder.out.getData();

        fs.writeFileSync(outputPath, outputBuffer);
        fs.unlinkSync(inputPath);

        const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
        const link = `${host}/outputs/${outputFilename}`;
        res.json({ outputUrl: link });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process GIF' });
    }
});

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});