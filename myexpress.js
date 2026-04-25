const express = require('express');
const { messagingApi, middleware } = require('@line/bot-sdk');

const app = express();

const config = {
  // 🔴 เอาค่าจากหน้า LINE Developers มาใส่ตรงนี้ให้ถูกต้อง
  channelAccessToken: 'C2trWjCsKw+rdCtdYTuOkdTgVoxIZUulpRGXQASWw+fqdhx4cngyTJobfbJo4u4i1+Q8Nm6cov/yXFqqcdrpt+Sk8FkYb0W0+luCTaP2lQYjaQghzMZliqTkCcZFAlzdIZlFqObLUicNTXZg+9AdggdB04t89/1O/w1cDnyilFU=', 
  channelSecret: '6b84a27f3eab0b2cfc840f950d9ffe1c'
};

// ✅ สร้าง Client แบบใหม่ (MessagingApiClient)
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

app.get('/', (req, res) => res.send('Server Online!'));

// ✅ Webhook Route
app.post('/webhook', middleware(config), async (req, res) => {
  // 🛡️ เพิ่มบรรทัดนี้เพื่อข้ามหน้า Warning ของ ngrok ให้ Verify ผ่าน
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

  // ✅ ใช้ฟังก์ชัน replyMessage แบบใหม่
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: `คุณไกรสรพิมพ์ว่า: ${event.message.text}`
    }]
  });
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});