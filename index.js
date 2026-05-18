require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");

const app = express();

// 1. เชื่อมต่อ Supabase ผ่าน Environment Variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  //process.env.SUPABASE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. เริ่มต้น Gemini ด้วยคีย์จาก .env (พร้อมดักจับกรณีลืมตั้งค่า)
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ ERROR: กรุณาตั้งค่า GEMINI_API_KEY ในไฟล์ .env");
  process.exit(1);
}
console.log("GEMINI_API_KEY =", process.env.GEMINI_API_KEY);
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY.trim()
});

const aiModelCandidates = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
];

async function generateAIReply(userMessage) {
  const maxRetries = 2;

  for (const model of aiModelCandidates) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`AI request: model=${model} attempt=${attempt}`);
        const result = await genAI.models.generateContent({
          model,
          contents: userMessage,
        });

        if (result?.text) {
          return result.text;
        }

        return null;
      } catch (error) {
        const status = error?.status || error?.code;
        console.warn(`AI model ${model} failed (attempt ${attempt}):`, error?.message || error);

        if (status === 503 && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          continue;
        }

        if (status === 503) {
          break;
        }

        throw error;
      }
    }
  }

  return null;
}

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

  if (event.type === "message" && event.message.type === "image") {
    return handleImage(event);
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userMessage = event.message.text;
  let replyContent = "";

  // === ส่วนของ GEMINI ===
  try {
    const aiText = await generateAIReply(userMessage);
    if (aiText) {
      replyContent = aiText;
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
// 1. สร้าง Blob Client สำหรับดึงข้อมูลไฟล์โดยเฉพาะ (ของ v9+)
const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

const downloadLineContent = async (messageId) => {
  const stream = await lineBlobClient.getMessageContent(messageId);
  const chunks = [];
 
  // รองรับทั้งแบบ Blob (มี arrayBuffer) และแบบ Stream
  if (stream.arrayBuffer) {
    const arrayBuffer = await stream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: stream.type || 'image/jpeg'
      },
      buffer: buffer
    };
  } else {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/jpeg'
      },
      buffer: buffer
    };
  }
};

async function handleImage(event) {
  try {
    const messageId = event.message.id;
    
    // ดาวน์โหลดรูปภาพจาก LINE และดึงมาทั้ง Base64 และ Buffer
    const imageContent = await downloadLineContent(messageId);
   
    const fileName = `${messageId}.jpg`;

    // อัปโหลดเข้า Supabase
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('uploads')
      .upload(`bot-uploads/${fileName}`, imageContent.buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) throw new Error(uploadError.message);

    // ดึง Public URL กลับออกไป
    const { data: publicUrlData } = supabase
      .storage
      .from('uploads')
      .getPublicUrl(`bot-uploads/${fileName}`);

    const publicUrl = publicUrlData.publicUrl;

    // บันทึกข้อมูลรูปภาพลง Database (ใช้ try-catch แยก)
    try {
      const { error: dbError } = await supabase
        .from("messages")
        .insert([
          {
            user_id: event.source.userId || "",
            message_id: messageId,
            type: "image",
            content: publicUrl,
            reply_token: event.replyToken || "",
            reply_content: `อัพโหลดภาพเรียบร้อย: ${publicUrl}`,
          }
        ]);

      if (dbError) {
        console.error("❌ Database error:", dbError.message);
        console.warn("⚠️ ไม่สามารถบันทึก metadata ลง database ได้ (RLS policy หรือปัญหาอื่น)");
        console.warn("แนะนำ: ไปที่ Supabase Dashboard > Table Editor > messages > RLS Policies");
        console.warn("แล้วปิด RLS หรือสร้าง policy ให้ allow insert");
      }
    } catch (dbCatchError) {
      console.error("⚠️ Database connection error:", dbCatchError.message);
      // ไม่ throw - ให้ส่งข้อความตอบกลับต่อ
    }

    // ส่งข้อความตอบกลับ LINE
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: `✅ รับภาพแล้ว!\nURL: ${publicUrl}`,
        },
      ],
    });

  } catch (error) {
    console.error('❌ Error ในการดึงรูปภาพ:', error.message);
    
    // ส่งข้อความแจ้งข้อผิดพลาด
    try {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: `❌ เกิดข้อผิดพลาด: ${error.message}`,
          },
        ],
      });
    } catch (replyError) {
      console.error("Failed to send error message:", replyError.message);
    }
  }
}


// หน้าแรกเซิร์ฟเวอร์
app.get('/', (req, res) => res.send('Server is running perfectly with Environment Variables!'));

// 6. สั่งให้เซิร์ฟเวอร์เปิด Port รอรับข้อมูล
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});