require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// --- 1. ต้องประกาศ config ก่อน ---
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || ""
};

// --- 2. สร้าง client หลังจากมี config แล้ว ---
const client = new line.messagingApi.MessagingApiClient(config);

app.use('/webhook', line.middleware(config));

app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const msg = event.message.text;
  let replyText = "";

  // --- 3. แก้ไขข้อความตอบกลับตามเงื่อนไขที่นี่ ---
  if (msg === "สวัสดี") {
    replyText = "สวัสดีครับคุณลูกค้า ยินดีต้อนรับสู่ Cafe ของเรา! ☕ รับกาแฟสักแก้วไหมครับ?";
  } else if (msg === "ราคา") {
    replyText = "เมนูเริ่มต้นที่ 50 บาทครับผม 💸";
  } else {
    replyText = `ได้รับข้อความ "${msg}" แล้วครับ`;
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: replyText }]
  });
}

app.get('/', (req, res) => res.send('Server is running!'));

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});