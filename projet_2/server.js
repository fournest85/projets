const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const apiKey = process.env.REPLICATE_API_TOKEN;


// axios.get('https://api.replicate.com/v1/models', {
//     headers: {
//         'Authorization': `Bearer ${apiKey}`
//     }
// })
//     .then(res => console.log('✅ Token valide, accès OK'))
//     .catch(err => console.error('❌ Token invalide ou mal transmis', err.response?.data || err.message));

const prompt = "Un astronaute chevauchant un cheval sur Mars, style réaliste";
const outputDir = path.join(__dirname, 'generated_medias');


if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

async function generateImage(prompt) {
    try {
        const response = await axios.post('https://api.replicate.com/v1/predictions', {
            version: "70aff093ee9e714ea6dfe2afc89e0a478fae214d5de37742e4a3d3791de48b19", // Stable Diffusion v1.5
            input: {

                prompt: prompt,
                aspect_ratio: "1:1",
                enhance_image: false,
                prompt_enhancement: false

            }

        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait'
            }
        });
        const imageUrl = response.data.output[0];
        console.log('Image URL:', imageUrl);

        const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
        const imagePath = path.join(outputDir, `bria_image.png`);
        const writer = fs.createWriteStream(imagePath);

        imageResponse.data.pipe(writer);
        writer.on('finish', () => console.log(`Image saved to: ${imagePath}`));
        writer.on('error', (err) => console.error('Error saving image:', err));
        return imagePath;
    } catch (error) {
        console.error('Error generating image:', error.response ? error.response.data : error.message);
    }
}

generateImage(prompt);

