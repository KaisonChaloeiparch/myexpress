require('dotenv').config();
const express = require('express');
const { messagingApi, middleware } = require('@line/bot-sdk');
import * as dotenv from 'dotenv';
dotenv.config();


const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
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
  app.get('/', (req, res) => {
  res.send('hello world, kaison');
});


app.listen(3005, () => {
    console.log('Server running on port 3005');

});