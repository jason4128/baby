const https = require('https');
https.get('https://image.pollinations.ai/prompt/cute%20baby?width=512&height=512&nologo=true', (res) => {
  console.log(res.statusCode);
});
