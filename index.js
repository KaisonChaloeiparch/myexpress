require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 1. เชื่อมต่อ Supabase (ใส่ค่าตรงๆ จากโปรเจกต์ของคุณ)
const supabase = createClient(
  "https://byocmtqyseipekobaavw.supabase.co", 
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5b2NtdHF5c2VpcGVrb2JhYXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MTA5MDUsImV4cCI6MjA5NDQ4NjkwNX0.IT2OQ5sIXf6KbDQjgNdwKRVAHYfsT9UDuhm69kPp66c"
);

// 2. เริ่มต้น Gemini ด้วยคีย์ตัวล่าสุดที่คุณฝังไว้
const genAI = new GoogleGenerativeAI({
  apiKey: "AIzaSyAzsDLR7NWyjFXG83yMeTeTWYKLBZBWjHk"
});

// 3. ตั้งค่า LINE Config (ใส่ค่าตรงๆ จาก LINE Developers)
const config = {
  channelAccessToken: "C2trWjCsKw+rdCtdYTuOkdTgVoxIZUulpRGXQASWw+fqdhx4cngyTJobfbJo4u4i1+Q8Nm6cov/yXFqqcdrpt+Sk8FkYb0W0+luCTaP2lQYjaQghzMZliqTkCcZFAlzdIZlFqObLUicNTXZg+9AdggdB04t89/1O/w1cDnyilFU=",
  channelSecret: "6b84a27f3eab0b2cfc840f950d9ffe1c"
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
app.get('/', (req, res) => res.send('Server is running perfectly!'));

// 6. สั่งให้เซิร์ฟเวอร์เปิด Port รอรับข้อมูล
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});