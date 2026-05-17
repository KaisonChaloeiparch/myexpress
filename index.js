require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 1. เชื่อมต่อ Supabase ผ่าน Environment Variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 2. เริ่มต้น Gemini ด้วยคีย์จาก .env (พร้อมดักจับกรณีลืมตั้งค่า)
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ ERROR: กรุณาตั้งค่า GEMINI_API_KEY ในไฟล์ .env");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY.trim()
});

// 3. ตั้งค่า LINE Config
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// 4. เส้นทาง Webhook สำหรับรับข้อความจาก LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  res.status(200).send('OK');

  if (req.body && req.body.events) {
    Promise.all(req.body.events.map(event => {
      return handleEvent(event).catch(err => {
        console.error("Error ระหว่างประมวลผล Event:", err.message);
      });
    }));
  }
});

// 5. ฟังก์ชันหลักในการประมวลผลข้อความ
async function handleEvent(event) {
  console.log("ได้รับ Event ใหม่:", event);

  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userMessage = event.message.text;
  let replyContent = "";

  // === ส่วนของ GEMINI ===
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(userMessage);
    
    if (result && result.response) {
      replyContent = result.response.text();
    } else {
      replyContent = "บอทไม่ได้รับคำตอบจาก AI";
    }
  } catch (error) {
    console.error("GEMINI ACTUAL ERROR:", error);
    replyContent = `ระบบ AI ขัดข้องชั่วคราว: ${error.message}`;
  }

  // === ส่วนของ SUPABASE ===
  try {
    const { error } = await supabase
      .from("messages")
      .insert([
        {
          user_id: event.source.userId || "",
          message_id: event.message.id || "",
          type: event.message.type || "text",
          content: userMessage,
          reply_token: event.replyToken || "",
          reply_content: replyContent,
        }
      ]);

    if (error) console.error("SUPABASE ERROR:", error);
  } catch (err) {
    console.error("SUPABASE CATCH ERROR:", err);
  }

  // === ส่งข้อความตอบกลับไปยัง LINE ===
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: replyContent,
      },
    ],
  });
}

// หน้าแรกเซิร์ฟเวอร์
app.get('/', (req, res) => res.send('Server is running perfectly with Environment Variables!'));

// 6. สั่งให้เซิร์ฟเวอร์เปิด Port รอรับข้อมูล
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});