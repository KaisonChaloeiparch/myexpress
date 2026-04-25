const express = require('express');
const { messagingApi, middleware } = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: 'C2trWjCsKw+rdCtdYTuOkdTgVoxIZUulpRGXQASWw+fqdhx4cngyTJobfbJo4u4i1+Q8Nm6cov/yXFqqcdrpt+Sk8FkYb0W0+luCTaP2lQYjaQghzMZliqTkCcZFAlzdIZlFqObLUicNTXZg+9AdggdB04t89/1O/w1cDnyilFU=',
  channelSecret: '6b84a27f3eab0b2cfc840f950d9ffe1c'
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

app.post('/webhook', middleware(config), async (req, res) => {
  // บรรทัดนี้ยังต้องมีไว้เพื่อให้ใช้งานผ่าน ngrok ได้เสถียร
  res.set('ngrok-skip-browser-warning', 'true');

  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.status(200).json(results);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  // บอทจะตอบกลับข้อความที่คุณพิมพ์มา
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: `สวัสดีครับคุณไกรสร ผมได้รับข้อความว่า: "${event.message.text}" แล้วครับ!`
    }]
  });
}

app.listen(5000, () => {
    console.log('Server running on port 5000');

});